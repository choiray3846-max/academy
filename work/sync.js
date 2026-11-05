/*
 * 상계2점 업무관리 – 저장소 + 여러 기기 공유 (Supabase 연동)
 *
 * 달력·시간표·급여명세서와 같은 boards 테이블을 쓰고 'work:' 접두사로 분리 저장한다.
 *   work:<학원코드>             직원·학생·기간이슈·요청 (메타 문서)
 *   work:<학원코드>:d:<날짜>     그날의 출결·이슈 일지 (하루 한 문서)
 *
 * 달력 앱과 달리 '마지막 저장이 이긴다'가 아니라, 학생별·칸별로 더 최근에 적은 값을
 * 합치는 병합 방식이다. 매니저 여럿이 같은 날짜를 동시에 적어도 서로 지우지 않는다.
 * 지점달력 데이터(calendar:<학원코드>)는 읽기 전용으로 가져와 달력 탭에 보여준다.
 */
window.WorkStore = (function () {
  'use strict';
  const CFG_KEY = 'academy-work/sync';
  const DATA_KEY = 'academy-work/data';
  const PREFIX = 'work:';
  const DEFAULT_URL = 'https://twnonsqjxngsyavehddq.supabase.co';
  const DAY_WINDOW = 120; // 최근 며칠치 일지를 기기에 내려받아 둘지
  const COLLS = ['staff', 'students', 'events', 'requests'];
  const DAY_GROUPS = [['att', 'attAt', 'attBy'], ['si', 'siAt', 'siBy'], ['pi', 'piAt', 'piBy'], ['f', 'fAt', 'fBy'], ['m', 'mAt', 'mBy']];

  let cfg = null;
  let meta = emptyMeta();
  let days = {}; // date -> {date, s:{sid:{...}}}
  let stamps = {}; // row id -> updated_at (서버에서 마지막으로 본 값)
  let dirty = new Set(); // 'meta' | 'd:YYYY-MM-DD'
  let status = 'off'; // off | ok | syncing | error
  let lastError = '';
  let calendar = null; // 지점달력 데이터 (읽기 전용)
  let calendarAt = null;
  let listeners = [];
  let pushTimer = 0, pollTimer = 0, calTimer = 0, cacheTimer = 0;
  let pushing = false, pushAgain = false;

  function emptyMeta() { return { v: 1, staff: {}, students: {}, events: {}, requests: {} }; }
  const nowIso = () => new Date().toISOString();
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const shiftKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); };

  function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  function setStatus(s, err) { status = s; lastError = err || ''; notify(); }

  // ---------- 설정 ----------
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function loadCfg() {
    let c = readJson(CFG_KEY);
    if (!c || !c.url || !c.anonKey || !c.roomId) {
      // 같은 사이트의 달력·급여 앱에 이미 설정이 있으면 그대로 가져다 쓴다.
      const other = readJson('academy-calendar/sync') || readJson('academy-payslip/sync') || readJson('academy-timetable/sync');
      if (other && other.url && other.anonKey && other.roomId) { c = { url: other.url, anonKey: other.anonKey, roomId: other.roomId, adopted: true }; saveCfg(c); }
      else c = null;
    }
    return c;
  }
  function saveCfg(c) { try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); } catch (e) { /* noop */ } }
  function siblingCfg() { return readJson('academy-calendar/sync') || readJson('academy-payslip/sync') || null; }

  // ---------- 로컬 캐시 ----------
  function loadCache() {
    const c = readJson(DATA_KEY);
    if (c && c.meta) { meta = Object.assign(emptyMeta(), c.meta); days = c.days || {}; stamps = c.stamps || {}; }
  }
  function saveCacheSoon() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      try { localStorage.setItem(DATA_KEY, JSON.stringify({ meta, days, stamps, savedAt: nowIso() })); }
      catch (e) { setStatus(status, '브라우저 저장 공간이 부족해요. 오래된 기록이 많으면 설정에서 정리하세요.'); }
    }, 300);
  }

  // ---------- 병합 ----------
  function mergeMeta(a, b) {
    const out = emptyMeta();
    COLLS.forEach((c) => {
      const ids = new Set([...Object.keys(a[c] || {}), ...Object.keys(b[c] || {})]);
      ids.forEach((id) => {
        const x = (a[c] || {})[id], y = (b[c] || {})[id];
        out[c][id] = !x ? y : !y ? x : ((y.updatedAt || '') > (x.updatedAt || '') ? y : x);
      });
    });
    return out;
  }
  function mergeDay(a, b, date) {
    const out = { date, s: {} };
    const sids = new Set([...Object.keys((a && a.s) || {}), ...Object.keys((b && b.s) || {})]);
    sids.forEach((sid) => {
      const x = ((a && a.s) || {})[sid] || {}, y = ((b && b.s) || {})[sid] || {};
      const e = {};
      DAY_GROUPS.forEach(([val, at, by]) => {
        const src = (y[at] || '') > (x[at] || '') ? y : x;
        if (src[val] !== undefined) e[val] = src[val];
        if (src[at]) e[at] = src[at];
        if (src[by]) e[by] = src[by];
      });
      if (Object.keys(e).length) out.s[sid] = e;
    });
    return out;
  }

  // ---------- Supabase REST ----------
  // 응답이 15초 넘게 없으면 끊어서 '저장중…'에 영원히 머물지 않게 한다.
  function fetchT(url, opts) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
    return fetch(url, Object.assign({}, opts, { signal: ac.signal })).catch((e) => { throw new Error(e.name === 'AbortError' ? '서버 응답 없음 (15초)' : '네트워크 오류'); }).finally(() => clearTimeout(t));
  }
  function headers() { return { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' }; }
  function endpoint() { return cfg.url.replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/boards'; }
  const rowId = (key) => PREFIX + cfg.roomId + (key ? ':' + key : '');
  async function fetchRows(ids) {
    if (!ids.length) return [];
    const q = 'id=in.(' + ids.map((x) => '"' + x.replace(/"/g, '\\"') + '"').join(',') + ')';
    const res = await fetchT(endpoint() + '?' + encodeURI(q) + '&select=id,data,updated_at', { headers: headers() });
    if (!res.ok) throw new Error('서버 응답 오류 (' + res.status + ')');
    return res.json();
  }
  async function fetchStamps() {
    const res = await fetchT(endpoint() + '?id=like.' + encodeURIComponent(PREFIX + cfg.roomId + '*') + '&select=id,updated_at', { headers: headers() });
    if (!res.ok) throw new Error('서버 응답 오류 (' + res.status + ')');
    return res.json();
  }
  async function upsertRow(id, data) {
    const updatedAt = nowIso();
    const res = await fetchT(endpoint() + '?on_conflict=id', {
      method: 'POST', headers: Object.assign(headers(), { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ id, data, updated_at: updatedAt }),
    });
    if (!res.ok) throw new Error('저장 실패 (' + res.status + ')');
    return updatedAt;
  }

  // ---------- 올리기 / 내려받기 ----------
  function applyRemote(id, data) {
    if (id === rowId()) meta = mergeMeta(meta, data || emptyMeta());
    else { const date = id.slice(rowId('d:').length); days[date] = mergeDay(days[date], data, date); }
  }
  function schedulePush() {
    if (!cfg) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushDirty, 900);
  }
  async function pushDirty() {
    if (!cfg || !dirty.size) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true; setStatus('syncing');
    const keys = [...dirty]; dirty = new Set();
    try {
      const ids = keys.map((k) => (k === 'meta' ? rowId() : rowId(k)));
      const remote = {}; (await fetchRows(ids)).forEach((r) => { remote[r.id] = r; });
      for (const k of keys) {
        const id = k === 'meta' ? rowId() : rowId(k);
        if (remote[id]) applyRemote(id, remote[id].data);
        const data = k === 'meta' ? meta : days[k.slice(2)];
        stamps[id] = await upsertRow(id, data);
      }
      saveCacheSoon(); setStatus('ok');
    } catch (e) {
      // 실패한 건 다음 기회에 다시 올린다.
      keys.forEach((k) => dirty.add(k));
      setStatus('error', e.message || '저장 실패');
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
      else if (dirty.size) { clearTimeout(pushTimer); pushTimer = setTimeout(pushDirty, 8000); }
    }
  }
  async function pull(full) {
    if (!cfg) return;
    try {
      const rows = await fetchStamps();
      const cutoff = shiftKey(todayKey(), -DAY_WINDOW);
      const want = [];
      rows.forEach((r) => {
        if (r.id === rowId()) { if (full || stamps[r.id] !== r.updated_at) want.push(r.id); return; }
        const p = rowId('d:');
        if (r.id.startsWith(p)) {
          const date = r.id.slice(p.length);
          if (date < cutoff) return;
          if (dirty.has('d:' + date)) return;
          if (full || stamps[r.id] !== r.updated_at) want.push(r.id);
        }
      });
      if (dirty.has('meta')) { const i = want.indexOf(rowId()); if (i >= 0) want.splice(i, 1); }
      for (let i = 0; i < want.length; i += 40) {
        const got = await fetchRows(want.slice(i, i + 40));
        got.forEach((r) => { applyRemote(r.id, r.data); stamps[r.id] = r.updated_at; });
      }
      if (want.length) { saveCacheSoon(); }
      if (!pushing) setStatus('ok'); else notify();
    } catch (e) { setStatus('error', e.message || '연결 실패'); }
  }
  async function pullCalendar() {
    if (!cfg) return;
    try {
      const rows = await fetchRows(['calendar:' + cfg.roomId]);
      if (rows.length && rows[0].updated_at !== calendarAt) { calendar = rows[0].data; calendarAt = rows[0].updated_at; notify(); }
    } catch (e) { /* 달력은 없어도 앱은 돈다 */ }
  }
  function startLoops() {
    clearInterval(pollTimer); clearInterval(calTimer);
    if (!cfg) return;
    pollTimer = setInterval(() => pull(false), 6000);
    calTimer = setInterval(pullCalendar, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { pull(false); pullCalendar(); } });
  }

  // ---------- 변경 API (UI가 쓰는 것) ----------
  function touchMeta() { dirty.add('meta'); saveCacheSoon(); schedulePush(); notify(); }
  function touchDay(date) { dirty.add('d:' + date); saveCacheSoon(); schedulePush(); notify(); }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    DEFAULT_URL,
    init() {
      loadCache(); cfg = loadCfg();
      if (cfg) { setStatus('syncing'); pull(true).then(() => pullCalendar()); startLoops(); }
      else setStatus('off');
    },
    onChange(fn) { listeners.push(fn); },
    get status() { return status; },
    get lastError() { return lastError; },
    get cfg() { return cfg; },
    siblingCfg,
    get meta() { return meta; },
    get days() { return days; },
    get calendar() { return calendar; },
    get calendarAt() { return calendarAt; },
    get dirtyCount() { return dirty.size; },
    async connect(c) {
      // 연결 테스트: 서버에 뭐가 있든 병합하므로 덮어쓰기 걱정이 없다.
      const test = { url: c.url, anonKey: c.anonKey, roomId: c.roomId };
      const prev = cfg; cfg = test;
      try { await fetchStamps(); } catch (e) { cfg = prev; throw e; }
      saveCfg(test); stamps = {}; calendarAt = null;
      dirty.add('meta'); Object.keys(days).forEach((d) => dirty.add('d:' + d));
      setStatus('syncing'); await pull(true); await pushDirty(); await pullCalendar(); startLoops();
    },
    disconnect() { cfg = null; saveCfg(null); clearInterval(pollTimer); clearInterval(calTimer); setStatus('off'); },
    refresh() { pull(false); pullCalendar(); },
    // 메타 문서
    upsert(coll, id, data) {
      const nid = id || uid();
      const cur = meta[coll][nid] || {};
      meta[coll][nid] = Object.assign({}, cur, data, { id: nid, updatedAt: nowIso(), deleted: false });
      touchMeta(); return nid;
    },
    remove(coll, id) { if (!meta[coll][id]) return; meta[coll][id] = Object.assign({}, meta[coll][id], { deleted: true, updatedAt: nowIso() }); touchMeta(); },
    live(coll) { const out = {}; Object.values(meta[coll] || {}).forEach((x) => { if (!x.deleted) out[x.id] = x; }); return out; },
    // 일지
    entry(date, sid) { return ((days[date] || {}).s || {})[sid] || {}; },
    patchEntry(date, sid, group, value, by) {
      // group: 'att' | 'si' | 'pi' | 'f'
      const doc = days[date] || (days[date] = { date, s: {} });
      const e = doc.s[sid] || (doc.s[sid] = {});
      const g = DAY_GROUPS.find((x) => x[0] === group);
      e[g[0]] = value; e[g[1]] = nowIso(); if (by) e[g[2]] = by;
      touchDay(date);
    },
    exportJson() { return JSON.stringify({ app: 'academy-work', exportedAt: nowIso(), meta, days }, null, 2); },
    importJson(text) {
      const j = JSON.parse(text);
      if (!j || j.app !== 'academy-work' || !j.meta) throw new Error('업무관리 백업 파일이 아니에요.');
      meta = mergeMeta(meta, j.meta);
      Object.entries(j.days || {}).forEach(([date, doc]) => { days[date] = mergeDay(days[date], doc, date); dirty.add('d:' + date); });
      touchMeta();
    },
    uid,
  };
})();
