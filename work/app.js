/* 상계2점 업무관리 – 화면. 데이터는 sync.js(WorkStore)가 맡는다. */
(function () {
'use strict';
const W = window.WorkStore;
// ---------- utils ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayKey = () => key(new Date());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = '일월화수목금토';
const fmtK = (k) => { const d = parseKey(k); return (d.getMonth() + 1) + '.' + d.getDate() + '(' + WD[d.getDay()] + ')'; };
const fmtMD = (k) => { const d = parseKey(k); return (d.getMonth() + 1) + '/' + d.getDate(); };
const shiftK = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return key(d); };
const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtDT = (iso) => { if (!iso) return ''; const d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } } };
const gradeRank = (g) => { if (!g) return 99; const m = /^(초|중|고)(\d)/.exec(g); if (!m) return 98; return ({ 초: 0, 중: 6, 고: 9 })[m[1]] + Number(m[2]); };
const STATUS = [['red', '위험'], ['orange', '주황'], ['yellow', '집중'], ['green', '초록'], ['blue', '좋음']];
const STATUS_NAME = Object.fromEntries(STATUS);
const ROLES = ['CM', 'TM', '원장', '코디', '특급인폼'];
const EV_TYPES = ['미등원', '여행', '시험기간', '조기하원', '기타'];
const CAL_CAT = { exam: '시험', briefing: '설명회', holiday: '휴원', vacation: '방학·특강', etc: '행사' };
const CAL_URL = '../';

// ---------- 공휴일 (지점달력과 같은 표) ----------
const FIXED_HOL = { '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절' };
const LUNAR_HOL = { 2025: ['2025-01-29', '2025-10-06', '2025-05-05'], 2026: ['2026-02-17', '2026-09-25', '2026-05-24'], 2027: ['2027-02-06', '2027-09-15', '2027-05-13'], 2028: ['2028-01-26', '2028-10-03', '2028-05-02'] };
const holCache = {};
function holidayName(k) {
  const y = k.slice(0, 4);
  if (!holCache[y]) {
    const m = {}; Object.entries(FIXED_HOL).forEach(([md, n]) => { m[y + '-' + md] = n; });
    const l = LUNAR_HOL[Number(y)];
    if (l) { m[shiftK(l[0], -1)] = '설날 연휴'; m[l[0]] = '설날'; m[shiftK(l[0], 1)] = '설날 연휴'; m[shiftK(l[1], -1)] = '추석 연휴'; m[l[1]] = '추석'; m[shiftK(l[1], 1)] = '추석 연휴'; m[l[2]] = '부처님오신날'; }
    holCache[y] = m;
  }
  return holCache[y][k] || null;
}

// ---------- 시간표 (좌석 시간표 앱, 읽기 전용) ----------
const BLOCKS = ['A', 'B', 'C'];
function mondayOf(k) { const d = parseKey(k); const dow = d.getDay(); return shiftK(k, -((dow + 6) % 7)); }
const ttCache = {};
/** 날짜별 시간표 요약: {has, closed, note, times[], byName: {이름: [{block, time, subject, teacher, manager, grade}]}} */
function ttFor(k) {
  const T = W.timetable; if (!T) return null;
  const ck = k + '|' + W.timetableAt; if (ttCache[ck]) return ttCache[ck];
  const ws = mondayOf(k); const di = (parseKey(k).getDay() + 6) % 7; const wk = (T.weeks || {})[ws];
  const st = T.settings || {}; const ds = (wk && wk.daySettings && wk.daySettings[di]) || {};
  const times = ds.times || (di === 5 ? st.saturdayTimes : st.weekdayTimes) || [];
  const res = { has: !!wk, closed: !!ds.closed || di === 6, note: ds.note || '', times, byName: {}, count: 0 };
  if (wk && !ds.closed) {
    const sm = {}; (T.students || []).forEach((x) => { sm[x.id] = x; });
    const tm = {}; (T.teachers || []).forEach((x) => { tm[x.id] = x; });
    const mm = {}; (T.managers || []).forEach((x) => { mm[x.id] = x; });
    const day = (wk.days || [])[di];
    ((day && day.blocks) || []).forEach((bl, bi) => { (bl.groups || []).forEach((g) => { (g.seats || []).forEach((seat) => {
      if (!seat || !seat.studentId || !sm[seat.studentId]) return; const stu = sm[seat.studentId];
      (res.byName[stu.name] = res.byName[stu.name] || []).push({ block: BLOCKS[bi], time: times[bi] || '', subject: seat.subject || '', teacher: (tm[g.teacherId] || {}).name || '', manager: (mm[seat.managerId] || {}).name || '', grade: stu.grade || '' });
    }); }); });
    res.count = Object.keys(res.byName).length;
  }
  ttCache[ck] = res; return res;
}
/** 이 학생의 그날 교시 목록 (이름으로 매칭, 동명이인은 학년으로) */
function ttSessions(k, s) {
  const t = ttFor(k); if (!t) return null; const list = t.byName[s.name]; if (!list) return [];
  const same = list.filter((x) => !x.grade || !s.grade || x.grade.replace(/\s/g, '') === s.grade.replace(/\s/g, ''));
  return same.length ? same : list;
}
const ttText = (list) => list.map((x) => x.block + ' ' + (x.subject || '') + (x.teacher ? '(' + esc(x.teacher) + ')' : '')).join(' · ');
/** 시간표 앱에 이 학생이 등록돼 있는지 (이름 기준) */
function ttKnown(s) { const T = W.timetable; return !!(T && (T.students || []).some((x) => x.name === s.name)); }
/** 개별지도 칸 자동값: 시간표 교시를 '5:00~6:30 수학' 형식으로. 교시 없으면 '수업X', 시간표에 없는 학생이면 '' */
function ttTutText(date, s) { const t = ttFor(date); if (!t || !t.has || t.closed) return ''; const ss = ttSessions(date, s) || []; if (ss.length) return ss.map((x) => (x.time ? x.time + ' ' : x.block + ' ') + (x.subject || '')).join(', '); return ttKnown(s) ? '수업X' : ''; }
/** 시간표 앱의 주간 보고서 (학생 이름으로) */
function ttReport(ws, s) {
  const T = W.timetable; if (!T || !T.reports || !T.reports[ws]) return null;
  const stu = (T.students || []).find((x) => x.name === s.name && (!x.grade || !s.grade || x.grade.replace(/\s/g, '') === s.grade.replace(/\s/g, ''))) || (T.students || []).find((x) => x.name === s.name);
  return stu ? T.reports[ws][stu.id] || null : null;
}
const ATT_LABEL = { excellent: '우수', good: '양호', normal: '보통', poor: '미흡' };

// ---------- state ----------
const VIEWS = ['board', 'dc', 'today', 'students', 'issues', 'requests', 'calendar', 'setup'];
const S = { staff: {}, students: {}, events: {}, requests: {},
  me: ls.get('academy-work/me') || '', view: (location.hash || '#board').slice(1), date: todayKey(), month: todayKey().slice(0, 7),
  sheet: null, range: 1, q: '', dcMgr: null, feedType: '', reqShowDone: false, stuShowInactive: false, mgrFilter: '', calSel: '' };
if (!VIEWS.includes(S.view)) S.view = 'board';
function refresh() { S.staff = W.live('staff'); S.students = W.live('students'); S.events = W.live('events'); S.requests = W.live('requests'); }
const days = () => W.days;

// ---------- derived ----------
const staffList = () => Object.values(S.staff).filter((x) => x.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'ko'));
const staffName = (id) => (S.staff[id] ? S.staff[id].name : (id || '?'));
const staffRole = (id) => (S.staff[id] ? S.staff[id].role : '');
const tag = (id) => { const s = S.staff[id]; if (!s) return '[?]'; return s.role === 'CM' ? '[' + s.name[0] + 'CM]' : '[' + s.role + ']'; };
const studentsActive = () => Object.values(S.students).filter((s) => s.active !== false);
const studentSort = (a, b) => gradeRank(b.grade) - gradeRank(a.grade) || a.name.localeCompare(b.name, 'ko');
/** 드래그로 정한 순서(order)가 있으면 그게 먼저, 없으면 학년·이름순 */
const orderSort = (a, b) => ((a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)) || studentSort(a, b);
const dayEntry = (date, sid) => W.entry(date, sid);
const getF = (e, field) => (field.startsWith('dc.') ? ((e.dc || {})[field.slice(3)] || '') : (e[field] || ''));
const DC_FIELDS = [['arr', '등원 약속'], ['dep', '하원 예정'], ['sc', 'SC 시간'], ['act', '실제 등원'], ['dc1t', '1차 DC 시간'], ['dc1p', '1차 DC 담당'], ['dc2t', '2차 DC 시간'], ['dc2p', '2차 DC 담당'], ['tut', '개별지도']];
const DC_TEXT = [['toDc', '매니저 → DC담당자'], ['fromDc', 'DC담당자 → 매니저'], ['note', 'NOTE'], ['perf', '수행평가']];
const activeEvents = (date, sid) => Object.values(S.events).filter((e) => (!sid || e.sid === sid) && e.from <= date && (e.to || e.from) >= date).sort((a, b) => a.from.localeCompare(b.from));
const me = () => S.staff[S.me] || null;
const roleOfTag = (t) => { const u = t.toUpperCase(); if (u.endsWith('CM')) return 'CM'; if (u === 'TM') return 'TM'; if (t.includes('원장')) return '원장'; if (t.includes('코디')) return '코디'; if (t.includes('인폼')) return '특급인폼'; return ''; };
const colorize = (text) => esc(text).replace(/\[([^\]\n]{1,10})\]/g, (m, t) => { const r = roleOfTag(t); return '<b class="' + (r ? 'role-' + r : '') + '">' + m + '</b>'; });
function withTag(oldT, newT) {
  const t = tag(S.me); newT = (newT || '').replace(/\s+$/, ''); oldT = (oldT || '').replace(/\s+$/, ''); if (!newT) return '';
  if (oldT && newT.startsWith(oldT)) { const add = newT.slice(oldT.length).replace(/^\s+/, ''); if (!add) return newT; return add.startsWith('[') ? oldT + '\n' + add : oldT + '\n' + t + ' ' + add; }
  if (!oldT && !newT.startsWith('[')) return t + ' ' + newT; return newT;
}
const entryAt = (e) => [(e.siAt || ''), (e.piAt || ''), (e.attAt || '')].sort().pop() || '';
const hasIssue = (e) => !!((e.si && e.si.trim()) || (e.pi && e.pi.trim()));
const evChips = (evs) => evs.map((ev) => '<span class="evc">' + esc(ev.type) + (ev.text ? '(' + esc(ev.text) + ')' : '') + ' <span class="num">' + fmtMD(ev.from) + (ev.to && ev.to !== ev.from ? '~' + fmtMD(ev.to) : '') + '</span></span>').join('');
function cellView(field, text, sid, date) {
  const t = (text || '').trim();
  if (field === 'm') { const chips = evChips(activeEvents(date, sid)); return (chips ? '<div class="evs">' + chips + '</div>' : '') + (t ? esc(t) : (chips ? '' : '<span class="add">클릭해서 입력</span>')); }
  if (field.startsWith('dc.')) return t ? esc(t) : '';
  return t ? colorize(t) : '<span class="add">클릭해서 입력</span>';
}
function allEntries() { const out = []; Object.values(days()).forEach((d) => { Object.entries(d.s || {}).forEach(([sid, e]) => { if (hasIssue(e)) out.push(Object.assign({ date: d.date, sid }, e)); }); }); return out.sort((a, b) => (b.date + entryAt(b)).localeCompare(a.date + entryAt(a))); }
const openReqs = () => Object.values(S.requests).filter((r) => !r.done);
function needMe() { if (me()) return true; openSheet({ kind: 'me' }); toast('먼저 본인을 선택해 주세요'); return false; }
const nowIso = () => new Date().toISOString();

// ---------- actions ----------
const A = {
  nav(v) { S.view = v; location.hash = v; S.sheet = null; render(); window.scrollTo(0, 0); },
  day(n) { S.date = n === 't' ? todayKey() : shiftK(S.date, Number(n)); render(); },
  month(n) { if (n === 't') { S.month = todayKey().slice(0, 7); S.calSel = todayKey(); } else { const d = parseKey(S.month + '-01'); d.setMonth(d.getMonth() + Number(n)); S.month = key(d).slice(0, 7); } render(); },
  att(sid, val, date) { if (!needMe()) return; date = date || S.date; const cur = dayEntry(date, sid).att || ''; const nv = cur === val ? '' : val; W.patchEntry(date, sid, 'att', nv, S.me); if (nv === 'O' && date === todayKey() && !getF(dayEntry(date, sid), 'dc.act')) saveDc(date, sid, 'act', nowHM()); },
  attCycle(sid, date) { if (!needMe()) return; const cur = dayEntry(date, sid).att || ''; const nv = cur === '' ? 'O' : cur === 'O' ? 'X' : ''; W.patchEntry(date, sid, 'att', nv, S.me); if (nv === 'O' && date === todayKey() && !getF(dayEntry(date, sid), 'dc.act')) saveDc(date, sid, 'act', nowHM()); },
  dcOff(sid, date) { if (!needMe()) return; const dc = Object.assign({}, dayEntry(date, sid).dc || {}); dc.off = !dc.off; W.patchEntry(date, sid, 'dc', dc, S.me); },
  dcMgr(id) { S.dcMgr = S.dcMgr === id ? '' : id; render(); },
  dcCopy() {
    if (!needMe()) return; const date = S.date; let n = 0;
    const prevDates = Object.keys(days()).filter((d) => d < date && d >= shiftK(date, -14)).sort().reverse();
    studentsActive().forEach((st) => {
      const cur = Object.assign({}, dayEntry(date, st.id).dc || {}); let changed = false;
      for (const d of prevDates) { const pe = dayEntry(d, st.id); if (!pe.dc || pe.dc.off) continue;
        const hasTT = !!ttTutText(date, st);
        ['arr', 'dep', 'sc', 'dc1t', 'dc1p', 'dc2t', 'dc2p', 'tut', 'note', 'perf'].forEach((k) => { if (k === 'tut' && hasTT) return; if (!cur[k] && pe.dc[k]) { cur[k] = pe.dc[k]; changed = true; } });
        break; }
      if (changed) { W.patchEntry(date, st.id, 'dc', cur, S.me); n++; }
    });
    const doc = days()[date] || {};
    for (const d of prevDates) { const pd = days()[d]; if (!pd) continue; if (!doc.hdr && pd.hdr) { W.patchDay(date, 'hdr', pd.hdr, S.me); } if (!doc.ftr && pd.ftr) { W.patchDay(date, 'ftr', pd.ftr, S.me); } if (pd.hdr || pd.ftr) break; }
    toast(n ? n + '명 값을 전날 기록에서 채웠어요' : '채울 값이 없어요 (이미 입력됐거나 전날 기록이 없음)');
  },
  print() { window.print(); },
  editIssue(sid, date, field, ev) {
    const td = (ev && ev.target.closest('td.issue')) || document.querySelector('td.issue[data-k="' + sid + '|' + date + '|' + field + '"]');
    if (!td || td.querySelector('textarea')) return;
    td.removeAttribute('tabindex');
    const raw = getF(dayEntry(date, sid), field);
    td.innerHTML = '<textarea class="cell-edit" id="ce-' + sid + '-' + date + '-' + field + '" data-issue="' + field + '" data-sid="' + sid + '" data-date="' + date + '"></textarea>';
    const ta = td.firstChild; ta.value = raw; ta.focus(); ta.setSelectionRange(raw.length, raw.length);
  },
  openDay(sid, date) { S.date = date; openSheet({ kind: 'sday', sid, date }); },
  range(n) { S.range = Number(n); render(); },
  openStudentDay(sid) { openSheet({ kind: 'sday', sid, date: S.date }); },
  openStudent(sid) { openSheet({ kind: 'student', sid }); },
  editStudent(sid) { openSheet({ kind: 'sedit', sid: sid || '' }); },
  newEvent(sid) { openSheet({ kind: 'event', sid: sid || '' }); },
  newRequest(sid) { openSheet({ kind: 'request', sid: sid || '' }); },
  openReq(id) { openSheet({ kind: 'request', id }); },
  pickMe() { openSheet({ kind: 'me' }); },
  setMe(id) { S.me = id; ls.set('academy-work/me', id); if (S.sheet && S.sheet.kind === 'me') S.sheet = null; render(); },
  editStaff(id) { openSheet({ kind: 'staff', id: id || '' }); },
  openSync() { openSheet({ kind: 'sync' }); },
  calDay(k) { S.calSel = k; openSheet({ kind: 'calday', date: k }); },
  gotoBoard(k) { S.date = k; S.sheet = null; A.nav('board'); },
  close() { S.sheet = null; render(); },
  filter(k, v) { S[k] = S[k] === v ? '' : v; render(); },
  toggle(k) { S[k] = !S[k]; render(); },
  mgr(id) { S.mgrFilter = S.mgrFilter === id ? '' : id; render(); },
  delEvent(id) { W.remove('events', id); },
  reqDone(id) { if (!needMe()) return; const r = S.requests[id]; if (!r) return; W.upsert('requests', id, r.done ? { done: false, doneAt: null, doneBy: null } : { done: true, doneAt: nowIso(), doneBy: S.me }); },
  delRequest(id) { W.remove('requests', id); S.sheet = null; render(); },
  archiveStudent(sid, on) { W.upsert('students', sid, { active: !(on === 'true') }); S.sheet = null; render(); },
  setStatus(sid, st) { if (!needMe()) return; const s = S.students[sid]; if (!s) return; W.upsert('students', sid, { status: s.status === st ? null : st, statusAt: nowIso(), statusBy: S.me }); },
  gotoDay(d, sid) { S.date = d; openSheet({ kind: 'sday', sid, date: d }); },
  submitSheet() { submitSheet(); },
  refreshSync() { W.refresh(); toast('새로고침'); },
  exportJson() {
    const blob = new Blob([W.exportJson()], { type: 'application/json' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '상계2점-업무관리-' + todayKey() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importJson() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then((t) => { try { W.importJson(t); toast('가져왔어요'); } catch (e) { toast(e.message); } }); }; i.click(); },
  async disconnect() { W.disconnect(); S.sheet = null; render(); },
  async connectSync() {
    const v = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
    const c = { url: v('sy-url') || W.DEFAULT_URL, anonKey: v('sy-key'), roomId: v('sy-room') };
    if (!c.anonKey || !c.roomId) { toast('anon 키와 학원 코드를 입력해 주세요'); return; }
    const b = $('#sy-go'); if (b) { b.disabled = true; b.textContent = '연결 중…'; }
    try { await W.connect(c); toast('연결됐어요. 이제 다른 기기에서도 같은 데이터를 봐요'); S.sheet = null; render(); }
    catch (e) { toast('연결 실패: ' + (e.message || '') + ' URL·키·학원 코드를 확인해 주세요'); if (b) { b.disabled = false; b.textContent = '연결하기'; } }
  },
  adoptSibling() { const c = W.siblingCfg(); if (!c) return; $('#sy-url').value = c.url; $('#sy-key').value = c.anonKey; $('#sy-room').value = c.roomId; toast('달력 앱 설정을 채웠어요. 연결하기를 누르세요'); },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act; const args = (b.dataset.args || '').split('|').filter((x, i, a) => !(a.length === 1 && x === ''));
  if (act === 'editIssue') { A.editIssue(args[0], args[1], args[2], e); return; }
  if (A[act]) A[act](...args);
});
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-issue]'); if (t) { saveIssue(t.dataset.date, t.dataset.sid, t.dataset.issue, t.value); return; }
  const tp = e.target.closest('[data-dct]'); if (tp) {
    const td = tp.closest('td'); const [key, part] = tp.dataset.dct.split('|'); const si = td.querySelector('[data-dct="' + key + '|s"]'), ei = td.querySelector('[data-dct="' + key + '|e"]');
    si.value = normT(si.value); ei.value = normT(ei.value);
    if (part === 's' && si.value && !ei.value) { const m = parseAcademy(si.value); if (m != null) ei.value = dispAcademy(m + 15); }
    const val = si.value ? si.value + (ei.value ? '-' + ei.value : '') : '';
    saveDc(tp.dataset.date, tp.dataset.sid, key, val); return;
  }
  const dc = e.target.closest('[data-dcf]'); if (dc) { if (dc.dataset.auto && dc.value.trim() === ttTutText(dc.dataset.date, S.students[dc.dataset.sid] || {})) return; saveDc(dc.dataset.date, dc.dataset.sid, dc.dataset.dcf, dc.value.trim()); return; }
  const sc = e.target.closest('[data-sched]'); if (sc) { const st = S.students[sc.dataset.sched]; if (st && (st.sched || '') !== sc.value.trim()) W.upsert('students', st.id, { sched: sc.value.trim() }); return; }
  const dr = e.target.closest('[data-dayroot]'); if (dr) { if (!needMe()) return; const cur = (days()[dr.dataset.date] || {})[dr.dataset.dayroot] || ''; if (cur !== dr.value.trim()) W.patchDay(dr.dataset.date, dr.dataset.dayroot, dr.value.trim(), S.me); return; }
  const f = e.target.closest('[data-field]'); if (!f) return;
  if (f.dataset.date && f.dataset.sid) { saveField(f.dataset.date, f.dataset.sid, f.dataset.field, f.value.trim()); return; }
  if (!S.sheet || S.sheet.kind !== 'sday') return;
  saveField(S.sheet.date, S.sheet.sid, f.dataset.field, f.value.trim());
});
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== S.view) { S.view = v; S.sheet = null; render(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) { S.sheet = null; render(); return; }
  const el = e.target; const nav = el.closest ? el.closest('[data-nav]') : null;
  if (!nav || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
  const isText = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'; const isTA = el.tagName === 'TEXTAREA';
  const force = e.ctrlKey || e.metaKey || e.altKey;
  let dr = 0, dc = 0;
  if (e.key === 'ArrowLeft') { if (!force && isText && !(el.selectionStart === 0 && el.selectionEnd === 0)) return; dc = -1; }
  else if (e.key === 'ArrowRight') { if (!force && isText && !(el.selectionStart === el.value.length && el.selectionEnd === el.value.length)) return; dc = 1; }
  else if (e.key === 'ArrowUp') { if (!force && isTA && el.value.slice(0, el.selectionStart).includes('\n')) return; dr = -1; }
  else if (e.key === 'ArrowDown') { if (!force && isTA && el.value.slice(el.selectionEnd).includes('\n')) return; dr = 1; }
  else if (e.key === 'Enter') { if (isTA && !(e.ctrlKey || e.metaKey)) return; if (!isText) return; dr = 1; }
  const [r, c] = nav.dataset.nav.split(',').map(Number);
  const t = document.querySelector('[data-nav="' + (r + dr) + ',' + (c + dc) + '"]'); if (!t) return;
  e.preventDefault(); focusCell(t);
});
function focusCell(t) {
  if (t.classList.contains('issue')) { const [sid, date, k] = t.dataset.k.split('|'); A.editIssue(sid, date, k); const ta = t.querySelector('textarea'); if (ta) ta.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
  t.focus(); if (t.tagName === 'INPUT') t.select(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
document.addEventListener('focusin', (e) => { const td = e.target; if (td.tagName === 'TD' && td.classList.contains('issue') && td.dataset.act) { const [sid, date, k] = td.dataset.k.split('|'); setTimeout(() => { if (document.activeElement === td) A.editIssue(sid, date, k); }, 0); } });
document.addEventListener('focusout', (e) => {
  const ta = e.target; if (!ta.classList || !ta.classList.contains('cell-edit')) return;
  const td = ta.closest('td.issue'); if (!td) return;
  const fld = ta.dataset.issue; const cur = getF(dayEntry(ta.dataset.date, ta.dataset.sid), fld); const merged = (fld === 'm' || fld.startsWith('dc.')) ? ta.value.replace(/\s+$/, '') : (withTag(cur, ta.value) || cur);
  setTimeout(() => { if (td.querySelector('textarea') === ta && document.activeElement !== ta) { td.setAttribute('tabindex', '0'); td.innerHTML = '<div class="view">' + cellView(fld, merged, ta.dataset.sid, ta.dataset.date) + '</div>'; } }, 0);
});
function saveIssue(date, sid, field, val) {
  if (!needMe()) return;
  if (field.startsWith('dc.')) { saveDc(date, sid, field.slice(3), val.replace(/\s+$/, '')); return; }
  const cur = dayEntry(date, sid)[field] || ''; const merged = field === 'm' ? val.replace(/\s+$/, '') : withTag(cur, val); if (merged === cur.replace(/\s+$/, '')) return; W.patchEntry(date, sid, field, merged, S.me);
}
function saveDc(date, sid, key, val) { if (!needMe()) return; const dc = Object.assign({}, dayEntry(date, sid).dc || {}); if ((dc[key] || '') === val) return; dc[key] = val; W.patchEntry(date, sid, 'dc', dc, S.me); }
/* 시간 해석: 학원 시계(1~10시는 오후, 11·12시는 그대로, 13시 이상은 24시간제) */
const hm = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const T_ONE = '(?:오전|오후|am|pm|AM|PM)?\\s*\\d{1,2}\\s*(?::\\s*\\d{1,2}|시\\s*(?:반|\\d{1,2}\\s*분?)?)?\\s*(?:분)?';
function parseAcademy(str) {
  let t = String(str == null ? '' : str).trim(); if (!t) return null;
  let ap = ''; t = t.replace(/^(오전|am|AM)\s*/, () => { ap = 'am'; return ''; }).replace(/^(오후|pm|PM)\s*/, () => { ap = 'pm'; return ''; });
  const m = /^(\d{1,2})\s*(?::\s*(\d{1,2})|시\s*(반|\d{1,2})?\s*분?)?\s*$/.exec(t); if (!m) return null;
  let h = Number(m[1]); let mi = m[2] != null ? Number(m[2]) : m[3] === '반' ? 30 : m[3] != null ? Number(m[3]) : 0;
  if (h > 24 || mi > 59) return null;
  if (ap === 'pm') { if (h < 12) h += 12; } else if (ap === 'am') { if (h === 12) h = 0; } else if (h >= 1 && h <= 10) h += 12;
  return h * 60 + mi;
}
const DASH = '[-~–—～〜]';
function rangesIn(text) { const out = []; const re = new RegExp('(' + T_ONE + ')\\s*' + DASH + '\\s*(' + T_ONE + ')', 'g'); let m; const src = String(text || ''); while ((m = re.exec(src))) { const a = parseAcademy(m[1]), b = parseAcademy(m[2]); if (a != null && b != null && b > a) out.push([a, b, m[0].trim()]); } return out; }
function parse24(str) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
/** DC 시간 문자열 → {s,e} (분). 24시간제('20:00-20:15')와 옛 표기('8:00-8:15') 둘 다 */
function dcRange(str) { if (!str) return null; const parts = String(str).split(/\s*[-~–—～〜]\s*/); const a = parse24(parts[0]) != null && /^\d{2}:\d{2}$/.test(parts[0].trim()) ? parse24(parts[0]) : parseAcademy(parts[0]); const b = parts[1] ? (/^\d{2}:\d{2}$/.test(parts[1].trim()) ? parse24(parts[1]) : parseAcademy(parts[1])) : null; if (a == null) return null; return { s: a, e: b != null && b > a ? b : a + 15 }; }
/** 그 학생의 그날 수업 구간: 개별지도 칸 + 시간표 교시 */
function classRanges(date, st, dc) {
  const out = []; const tut = (dc && dc.tut) || '';
  if (tut && !/수업\s*X/i.test(tut)) { const rs = rangesIn(tut); rs.forEach(([a, b, t]) => out.push({ s: a, e: b, label: '개별지도 ' + t })); if (!rs.length) out.unreadable = true; }
  const ss = ttSessions(date, st) || []; ss.forEach((x) => rangesIn(x.time).forEach(([a, b]) => out.push({ s: a, e: b, label: '시간표 ' + x.block + ' ' + (x.subject || '') + (x.time ? ' ' + x.time : '') })));
  return out;
}
const overlap = (a, b) => a.s < b.e && b.s < a.e;
/** 분 → 학원 표기 ('20:15' → '8:15', 11·12시는 그대로) */
const dispAcademy = (m) => { let h = Math.floor(m / 60); const mi = m % 60; if (h >= 13) h -= 12; return h + ':' + pad(mi); };
/** 손으로 친 시간 정리: '8' → 8:00, '815' → 8:15, '8시' → 8:00, '20:15' → 8:15 */
function normT(str) { let t = String(str || '').trim().replace(/\s+/g, ''); if (!t) return ''; let m;
  if ((m = /^(\d{1,2})시?$/.exec(t))) return Number(m[1]) + ':00';
  if ((m = /^(\d{1,2})(\d{2})$/.exec(t))) return Number(m[1]) + ':' + m[2];
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(t))) { let h = Number(m[1]); if (h >= 13) h -= 12; return h + ':' + m[2]; }
  return t; }
const personKey = (t) => String(t || '').trim().split(/\s+/)[0] || '';
const nowHM = () => { const d = new Date(); return d.getHours() + ':' + pad(d.getMinutes()); };
function saveField(date, sid, field, val) { if (!needMe()) return; const cur = dayEntry(date, sid); const f = Object.assign({}, cur.f || {}); if ((f[field] || '') === val) return; f[field] = val; W.patchEntry(date, sid, 'f', f, S.me); }

// ---------- toast ----------
let toastT; function toast(msg) { const t = $('#toasts'); t.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>'; clearTimeout(toastT); toastT = setTimeout(() => { t.innerHTML = ''; }, 3200); }

// ---------- render ----------
let raf = 0, pending = false;
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'search')) && $('#app').contains(a); };
function render() { if (typing() || drag) { pending = true; return; } if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (typing()) { pending = true; return; } draw(); }); }
document.addEventListener('focusout', (e) => { if (pending && $('#app').contains(e.target)) { pending = false; setTimeout(() => { if (!typing()) render(); else pending = true; }, 80); } });
function draw() {
  refresh();
  const app = $('#app'); const v = S.view;
  const ae = document.activeElement; const navEl = ae && app.contains(ae) && ae.closest ? ae.closest('[data-nav]') : null; const keep = navEl ? { nav: navEl.dataset.nav, ta: ae.tagName === 'TEXTAREA' } : null;
  app.classList.toggle('wide', v === 'board' || v === 'dc');
  app.innerHTML = (v === 'today' ? vToday() : v === 'board' ? vBoard() : v === 'dc' ? vDc() : v === 'students' ? vStudents() : v === 'issues' ? vIssues() : v === 'requests' ? vRequests() : v === 'calendar' ? vCalendar() : vSetup()) + nav();
  if (keep) { const t = app.querySelector('[data-nav="' + keep.nav + '"]'); if (t) { if (t.classList.contains('issue')) { if (keep.ta) focusCell(t); } else t.focus(); } }
  tickNow();
  drawLayer();
}
const ICONS = {
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>',
  dc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  today: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/></svg>',
  students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 5.5 2 5.5 5"/></svg>',
  issues: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/></svg>',
  requests: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  setup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
};
function nav() {
  const n = openReqs().length;
  const items = [['board', '표'], ['dc', '일정'], ['today', '오늘'], ['students', '학생'], ['issues', '이슈'], ['requests', '요청'], ['calendar', '달력'], ['setup', '설정']];
  return '<nav class="nav" aria-label="메뉴"><div class="nav-in">' + items.map(([k, l]) => '<button type="button" class="' + (S.view === k ? 'on' : '') + '" data-act="nav" data-args="' + k + '" aria-current="' + (S.view === k ? 'page' : 'false') + '">' + ICONS[k] + '<span>' + l + '</span>' + (k === 'requests' && n ? '<span class="badge num">' + n + '</span>' : '') + '</button>').join('') + '</div></nav>';
}
function syncChip() {
  const st = W.status; const label = st === 'ok' ? '공유중 ✓' : st === 'syncing' ? '저장중…' : st === 'error' ? '공유 오류' : '이 기기만';
  return '<button type="button" class="sync ' + st + '" data-act="openSync" title="' + esc(W.lastError || '여러 기기 공유 설정') + '">' + label + '</button>';
}
function statusBanner() {
  if (W.status === 'off') return '<div class="banner">아직 클라우드에 연결되지 않아 이 기기에만 저장돼요. <button type="button" class="btn sm" data-act="openSync">공유 연결</button></div>';
  if (W.status === 'error') return '<div class="banner err">클라우드 저장에 실패했어요: ' + esc(W.lastError || '') + ' <button type="button" class="btn sm" data-act="refreshSync">다시 시도</button></div>';
  return '';
}
function meChip() { const m = me(); return '<button type="button" class="me-chip ' + (m ? 'role-' + m.role : '') + '" data-act="pickMe" title="작성자 변경"><i></i>' + (m ? esc(m.name) + ' · ' + esc(m.role) : '작성자 선택') + '</button>'; }
function header(title, sub) { return '<header class="top"><h1>' + title + '</h1>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '<span class="spacer"></span>' + syncChip() + meChip() + '</header>' + statusBanner(); }
function dot(st) { return '<span class="dot" style="background:var(--st-' + (st || 'none') + ')" title="' + (STATUS_NAME[st] || '상태 미설정') + '"></span>'; }
function loadingOrEmpty(title, body) { return '<div class="card"><div class="empty"><strong>' + title + '</strong>' + body + '</div></div>'; }
function noStudents() { return loadingOrEmpty('아직 학생이 없어요', '설정 탭의 <b>백업 불러오기</b>로 명단 파일을 넣거나, 학생 탭의 + 버튼으로 직접 추가하세요.'); }
function fab(act, args) { return '<button type="button" class="fab" data-act="' + act + '" data-args="' + args + '" aria-label="추가">+</button>'; }

// ---- 오늘 ----
function vToday() {
  const date = S.date; const isToday = date === todayKey();
  const studs = studentsActive().sort(orderSort);
  const tt = ttFor(date);
  let o = 0, x = 0, blank = 0, due = 0;
  studs.forEach((s) => { const e = dayEntry(date, s.id); const ss = tt ? ttSessions(date, s) : null; const sched = !tt || (ss && ss.length); if (sched) due++; if (e.att === 'O') o++; else if (e.att === 'X') x++; else if (sched) blank++; });
  const evs = activeEvents(date);
  let html = header('상계2점 업무관리');
  html += '<div class="daybar"><button type="button" class="icon-btn" data-act="day" data-args="-1" aria-label="전날">‹</button><div class="d num">' + fmtK(date) + '</div><button type="button" class="icon-btn" data-act="day" data-args="1" aria-label="다음날">›</button>' + (isToday ? '<span class="today">오늘</span>' : '<button type="button" class="btn sm ghost" data-act="day" data-args="t">오늘로</button>') + '</div>';
  html += '<div class="stats"><div class="stat"><b class="num">' + (tt ? due : studs.length) + '</b><span>' + (tt ? '오늘 예정' : '관리 학생') + '</span></div><div class="stat"><b class="num" style="color:var(--accent)">' + o + '</b><span>등원 O</span></div><div class="stat"><b class="num" style="color:var(--danger)">' + x + '</b><span>등원 X</span></div><div class="stat"><b class="num">' + blank + '</b><span>미입력</span></div></div>';
  if (tt && (tt.closed || tt.note)) html += '<div class="banner">시간표: ' + esc(tt.note || '휴원') + (tt.closed ? ' (휴원)' : '') + '</div>';
  if (evs.length) html += '<div class="section"><div class="section-h">기간 이슈 <span class="cnt num">' + evs.length + '</span></div>' + evs.map((e) => '<div class="ev-item"><b>' + esc((S.students[e.sid] || {}).name || '?') + '</b> ' + esc(e.type) + (e.text ? ' · ' + esc(e.text) : '') + ' <span class="num">' + fmtMD(e.from) + (e.to && e.to !== e.from ? '~' + fmtMD(e.to) : '') + '</span></div>').join('') + '</div>';
  if (!studs.length) return html + '<div class="section">' + noStudents() + '</div>';
  const mgrs = Object.values(S.staff).sort((a, b) => (a.order || 0) - (b.order || 0)).filter((st) => studs.some((s) => s.manager === st.id));
  const groups = mgrs.map((m) => [m, studs.filter((s) => s.manager === m.id)]);
  const orphan = studs.filter((s) => !S.staff[s.manager]); if (orphan.length) groups.push([{ id: '', name: '담당 미지정' }, orphan]);
  groups.forEach(([m, list]) => {
    html += '<div class="section"><div class="section-h">' + esc(m.name) + (m.role ? ' ' + esc(m.role) : '') + ' <span class="cnt num">' + list.length + '</span></div><div class="card">';
    list.forEach((s) => {
      const e = dayEntry(date, s.id); const ev = activeEvents(date, s.id); const hi = hasIssue(e); const ss = tt ? ttSessions(date, s) : null;
      html += '<div class="row' + (tt && ss && !ss.length ? ' dim' : '') + '"><button type="button" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;text-align:left" data-act="openStudentDay" data-args="' + s.id + '">' + dot(s.status) + '<span class="name">' + esc(s.name) + '</span><span class="meta">' + esc(s.school || '') + ' ' + esc(s.grade || '') + (ss && ss.length ? ' · <span class="tt">' + ttText(ss) + '</span>' : tt && ss ? ' · <span class="tt none">예정 없음</span>' : '') + (ev.length ? ' · <span class="pill ev">' + esc(ev[0].type) + '</span>' : '') + (hi ? ' · <span class="pill n">이슈</span>' : '') + '</span></button>';
      html += '<span class="tail"><span class="seg"><button type="button" class="' + (e.att === 'O' ? 'on' : '') + '" data-act="att" data-args="' + s.id + '|O" aria-label="등원">O</button><button type="button" class="' + (e.att === 'X' ? 'on X' : '') + '" data-act="att" data-args="' + s.id + '|X" aria-label="미등원">X</button></span></span></div>';
    });
    html += '</div></div>';
  });
  return html;
}

// ---- 표 ----
function vBoard() {
  let html = header('표', '시트처럼 한 화면에');
  html += '<div class="daybar" style="flex-wrap:wrap"><button type="button" class="icon-btn" data-act="day" data-args="-1" aria-label="전날">‹</button><div class="d num">' + fmtK(S.date) + '</div><button type="button" class="icon-btn" data-act="day" data-args="1" aria-label="다음날">›</button>' + (S.date === todayKey() ? '<span class="today">오늘</span>' : '<button type="button" class="btn sm ghost" data-act="day" data-args="t">오늘로</button>') + '<span class="spacer"></span><span class="seg">' + [[1, '하루'], [7, '7일'], [30, '30일']].map(([n, l]) => '<button type="button" class="' + (S.range === n ? 'on' : '') + '" data-act="range" data-args="' + n + '">' + l + '</button>').join('') + '</span></div>';
  const studs = studentsActive();
  if (!studs.length) return html + '<div class="section">' + noStudents() + '</div>';
  const order = Object.values(S.staff).sort((a, b) => (a.order || 0) - (b.order || 0)).map((m) => m.id);
  studs.sort((a, b) => { const ia = order.indexOf(a.manager), ib = order.indexOf(b.manager); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || orderSort(a, b); });
  const dates = []; for (let i = 0; i < S.range; i++) dates.push(shiftK(S.date, -i));
  const multi = dates.length > 1;
  const ttAny = !!W.timetable;
  const th = ['<th class="c1">매니저</th>', '<th class="c2">학생</th>', '<th>학교</th>', '<th>학년</th>', ttAny ? '<th>시간표</th>' : '', multi ? '<th>기록일</th>' : '', '<th>등원</th>', '<th>졸음/전자기기</th>', '<th>학생 관리 이슈</th>', '<th>학부모 관리 이슈</th>', '<th>기간 이슈 / 메모</th>'].join('');
  let rows = ''; let ri = 0;
  dates.forEach((d, di) => {
    studs.forEach((s, si) => {
      const r = ri++; const e = dayEntry(d, s.id); const f = e.f || {}; const ss = ttAny ? ttSessions(d, s) : null;
      const issue = (k) => '<td class="issue' + (k === 'm' ? ' memo-cell' : '') + '" data-k="' + s.id + '|' + d + '|' + k + '" data-nav="' + r + ',' + (k === 'si' ? 2 : k === 'pi' ? 3 : 4) + '" tabindex="0" data-act="editIssue" data-args="' + s.id + '|' + d + '|' + k + '"><div class="view">' + cellView(k, e[k], s.id, d) + '</div></td>';
      rows += '<tr' + (multi && si === 0 && di > 0 ? ' class="daybreak"' : '') + '>'
        + '<td class="c1 sm">' + esc(staffName(s.manager)) + '</td>'
        + '<td class="c2 name ' + (s.status ? 'st-' + s.status : '') + '" data-act="openDay" data-args="' + s.id + '|' + d + '" title="' + (STATUS_NAME[s.status] || '상태 미설정') + '">' + esc(s.name) + '</td>'
        + '<td class="sm">' + esc(s.school || '') + '</td><td class="sm">' + esc(s.grade || '') + '</td>'
        + (ttAny ? '<td class="sm tt' + (ss && ss.length ? '' : ' none') + '">' + (ss && ss.length ? ttText(ss) : (ttFor(d) && ttFor(d).has ? '예정 없음' : '')) + '</td>' : '')
        + (multi ? '<td class="date num">' + fmtK(d) + '</td>' : '')
        + '<td class="att"><button type="button" class="' + (e.att || '') + '" data-nav="' + r + ',0" data-act="attCycle" data-args="' + s.id + '|' + d + '">' + (e.att || '–') + '</button></td>'
        + '<td class="f"><input data-nav="' + r + ',1" data-field="drowsy" data-sid="' + s.id + '" data-date="' + d + '" value="' + esc(f.drowsy || '') + '" aria-label="졸음/전자기기" placeholder=""></td>'
        + issue('si') + issue('pi') + issue('m')
        + '</tr>';
    });
  });
  const tt0 = ttAny ? ttFor(S.date) : null;
  if (tt0 && (tt0.closed || tt0.note)) html += '<div class="banner">시간표: ' + esc(tt0.note || '휴원') + (tt0.closed ? ' (휴원)' : '') + '</div>';
  html += '<div class="board-wrap"><table class="board"><thead><tr>' + th + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  html += '<p class="help" style="margin:8px 2px 0">등원 칸은 누를 때마다 O → X → 빈칸. 졸음/전자기기와 이슈 칸은 클릭해서 바로 쓰면 다른 칸으로 넘어갈 때 저장돼요. 새로 쓰기 시작하면 작성자 태그([이CM] 같은)가 자동으로 붙어요. 화살표 키로 옆 칸·다른 학생 칸으로 이동(글이 있는 칸에선 Ctrl+화살표), Tab도 돼요. 이슈·메모 칸에선 Ctrl+Enter로 아래 학생. 메모 칸은 태그 없이 자유롭게. 이름을 누르면 상세 창.</p>';
  return html;
}

// ---- 일정 (하루 시간표, DC관리 시트) ----
function vDc() {
  const date = S.date; const doc = days()[date] || {};
  let html = header('일정', '하루 시간표 · DC 관리');
  html += '<div class="daybar" style="flex-wrap:wrap"><button type="button" class="icon-btn" data-act="day" data-args="-1" aria-label="전날">‹</button><div class="d num">' + fmtK(date) + '</div><button type="button" class="icon-btn" data-act="day" data-args="1" aria-label="다음날">›</button>' + (date === todayKey() ? '<span class="today">오늘</span>' : '<button type="button" class="btn sm ghost" data-act="day" data-args="t">오늘로</button>') + '<span class="spacer"></span><button type="button" class="btn sm" data-act="dcCopy" title="등원 약속·하원·DC 시간·담당·개별지도·NOTE를 가장 최근 기록에서 빈 칸에만 채웁니다">전날 값 채우기</button><button type="button" class="btn sm" data-act="print">인쇄</button></div>';
  const studsAll = studentsActive();
  if (!studsAll.length) return html + '<div class="section">' + noStudents() + '</div>';
  if (S.dcMgr === null) S.dcMgr = (me() && me().role === 'CM' && studsAll.some((x) => x.manager === S.me)) ? S.me : '';
  const mgrs = Object.values(S.staff).sort((a, b) => (a.order || 0) - (b.order || 0)).filter((m) => studsAll.some((x) => x.manager === m.id));
  html += '<div class="filters" style="margin-top:6px"><button type="button" class="pill ' + (!S.dcMgr ? 'on' : '') + '" data-act="dcMgr" data-args="">전체</button>' + mgrs.map((m) => '<button type="button" class="pill ' + (S.dcMgr === m.id ? 'on' : '') + '" data-act="dcMgr" data-args="' + m.id + '">' + esc(m.name) + '</button>').join('') + '</div>';
  const studs = studsAll.filter((x) => !S.dcMgr || x.manager === S.dcMgr).sort(orderSort);
  const tt = ttFor(date);
  // 담당자 겹침: 전체 학생 기준으로 같은 담당자가 같은 시간에 두 명 이상
  const byPerson = {};
  studsAll.forEach((st) => { const dc = dayEntry(date, st.id).dc || {}; if (dc.off) return; [['dc1t', 'dc1p'], ['dc2t', 'dc2p']].forEach(([tk, pk]) => { const r = dcRange(dc[tk]); const who = personKey(dc[pk]); if (r && who) (byPerson[who] = byPerson[who] || []).push({ sid: st.id, name: st.name, key: tk, r }); }); });
  let clashN = 0, dupN = 0;
  // 상단 안내 / 하단 직원 일정 메모 (하루 단위)
  html += '<div class="dc-note"><label for="dc-hdr">상단 안내</label><textarea id="dc-hdr" data-dayroot="hdr" data-date="' + date + '" data-live="yes" rows="1">' + esc(doc.hdr || '') + '</textarea></div>';
  const cols = ['No', '학생', '학교', '학년', '등원<br>약속', '하원<br>예정', 'SC', '실제<br>등원', '등원', '1차 DC<br>시간', '1차 DC<br>담당', '2차 DC<br>시간', '2차 DC<br>담당', '개별지도', '등하원', '매니저 → DC담당자', 'DC담당자 → 매니저', 'NOTE', '수행평가', 'OFF'];
  let rows = '';
  studs.forEach((st, i) => {
    const e = dayEntry(date, st.id); const dc = e.dc || {}; const off = !!dc.off; const r = i;
    const cls = classRanges(date, st, dc);
    const tcell = (tk, pk, c) => {
      const r = dcRange(dc[tk]); const warn = []; let kind = '';
      if (r && !off) { cls.forEach((x) => { if (overlap(r, x)) { warn.push(x.label + '와 겹침'); kind = 'clash'; } });
        const who = personKey(dc[pk]); if (who) (byPerson[who] || []).forEach((o) => { if (o.sid !== st.id && overlap(r, o.r)) { warn.push(who + ' 같은 시간에 ' + o.name); if (!kind) kind = 'clash2'; } }); }
      if (kind === 'clash') clashN++; else if (kind === 'clash2') dupN++;
      const sv = r ? dispAcademy(r.s) : '', ev = r ? dispAcademy(r.e) : '';
      return '<td class="f tm ' + kind + '"' + (r ? ' data-rng="' + r.s + '-' + r.e + '"' : '') + ' title="' + esc(warn.join(' / ')) + '"><input type="text" inputmode="decimal" data-dct="' + tk + '|s" data-sid="' + st.id + '" data-date="' + date + '" data-nav="' + r0 + ',' + c + '" value="' + sv + '"' + (off ? ' disabled' : '') + '><span class="sep">~</span><input type="text" inputmode="decimal" data-dct="' + tk + '|e" data-sid="' + st.id + '" data-date="' + date + '" data-nav="' + r0 + ',' + (c + 1) + '" value="' + ev + '"' + (off ? ' disabled' : '') + '>' + (warn.length ? '<span class="wi" aria-label="겹침">!</span>' : '') + '</td>';
    };
    const r0 = r;
    const tutAuto = !dc.tut ? ttTutText(date, st) : '';
    const inp = (k, c, ph, wide) => { const auto = k === 'tut' && tutAuto; const rng = k === 'tut' ? rangesIn(auto ? tutAuto : (dc.tut || '')).map((x) => x[0] + '-' + x[1]).join(',') : ''; return '<td class="f' + (wide ? ' w' : '') + (k === 'dc1p' || k === 'dc2p' ? ' p' : '') + (k === 'tut' && cls.unreadable ? ' unread' : '') + (auto ? ' auto' : '') + '"' + (rng && !off ? ' data-rng="' + rng + '"' : '') + (k === 'tut' && cls.unreadable ? ' title="시간을 못 읽었어요. 6:35-8:05 처럼 적으면 겹침 검사가 돼요"' : auto ? ' title="시간표 앱에서 가져온 값. 직접 고치면 그게 우선이고, 지우면 다시 시간표 값이 떠요"' : '') + '><input data-dcf="' + k + '" data-sid="' + st.id + '" data-date="' + date + '" data-nav="' + r + ',' + c + '" value="' + esc(auto ? tutAuto : (dc[k] || '')) + '"' + (off ? ' disabled' : '') + (auto ? ' data-auto="1"' : '') + '>' + (k === 'tut' && cls.unreadable ? '<span class="wi q" aria-label="시간 못 읽음">?</span>' : '') + '</td>'; };
    const txt = (k, c) => '<td class="issue dcx" data-k="' + st.id + '|' + date + '|dc.' + k + '" data-nav="' + r + ',' + c + '" tabindex="0" data-act="editIssue" data-args="' + st.id + '|' + date + '|dc.' + k + '"><div class="view">' + cellView('dc.' + k, dc[k], st.id, date) + '</div></td>';
    rows += '<tr class="' + (off ? 'off' : '') + '" data-sid="' + st.id + '">'
      + '<td class="c1 num drag-h" title="끌어서 순서 바꾸기"><span class="grip">⋮⋮</span>' + (i + 1) + '</td>'
      + '<td class="c2 name ' + (st.status ? 'st-' + st.status : '') + '" data-act="openDay" data-args="' + st.id + '|' + date + '">' + esc(st.name) + '</td>'
      + '<td class="sm">' + esc(st.school || '') + '</td><td class="sm">' + esc(st.grade || '') + '</td>'
      + inp('arr', 0, '') + inp('dep', 1, '') + inp('sc', 2, '') + inp('act', 3, '')
      + '<td class="att"><button type="button" class="' + (e.att || '') + '" data-nav="' + r + ',4" data-act="attCycle" data-args="' + st.id + '|' + date + '"' + (off ? ' disabled' : '') + '>' + (e.att || '–') + '</button></td>'
      + tcell('dc1t', 'dc1p', 5) + inp('dc1p', 7, '') + tcell('dc2t', 'dc2p', 8) + inp('dc2p', 10, '')
      + inp('tut', 11, '', true)
      + '<td class="f w"><textarea data-sched="' + st.id + '" data-nav="' + r + ',12" rows="2">' + esc(st.sched || st.days || '') + '</textarea></td>'
      + txt('toDc', 13) + txt('fromDc', 14) + txt('note', 15) + txt('perf', 16)
      + '<td class="offc"><button type="button" class="ck ' + (off ? 'on' : '') + '" data-act="dcOff" data-args="' + st.id + '|' + date + '">' + (off ? 'OFF' : '–') + '</button></td>'
      + '</tr>';
  });
  if (clashN || dupN) html += '<div class="banner' + (clashN ? ' err' : '') + '">' + (clashN ? '수업과 겹치는 DC ' + clashN + '건 (빨강)' : '') + (clashN && dupN ? ' · ' : '') + (dupN ? '같은 담당자 같은 시간 ' + dupN + '건 (주황)' : '') + '. 칸 위에 마우스를 올리면 뭐랑 겹치는지 나와요.</div>';
  html += '<div class="board-wrap dc-wrap"><table class="board dc"><thead><tr>' + cols.map((c, i) => '<th class="' + (i === 0 ? 'c1' : i === 1 ? 'c2' : '') + '">' + c + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  html += '<div class="dc-note"><label for="dc-ftr">하단 메모</label><textarea id="dc-ftr" data-dayroot="ftr" data-date="' + date + '" data-live="yes" rows="2">' + esc(doc.ftr || '') + '</textarea></div>';
  html += '<p class="help" style="margin:8px 2px 0">예전 DC관리 시트와 같은 구성이에요. DC 시간은 8:00처럼 치면 돼요(800, 8시도 됨). 시작만 치면 끝은 15분 뒤로 자동(바꿔도 됨). 개별지도 칸은 시간표 앱 배정이 자동으로 들어오고(직접 고치면 그게 우선), DC가 그 시간과 겹치면 빨강, 같은 담당자가 같은 시간에 두 명이면 주황. 오늘 날짜에선 지금 진행 중인 DC·수업 칸에 초록불이 들어오고, 10분 안에 시작하면 연한 초록. 개별지도 시간을 못 읽으면 ?가 떠요. 전달사항·NOTE는 클릭해서 메모. 등원 O를 찍으면 실제 등원 시간이 자동으로 들어가요(오늘만). 등하원 칸은 학생 고정 정보라 한 번 적으면 매일 보여요. 전날 값 채우기는 빈 칸만 채우고 적힌 건 안 건드려요. 화살표·Tab으로 칸 이동, 인쇄는 가로 A4. 맨 왼쪽 번호 칸을 끌어서 학생 순서를 바꿀 수 있고(표·오늘 탭에도 같은 순서), 저장돼서 다른 기기에서도 같아요.</p>';
  return html;
}

// ---- 학생 ----
function vStudents() {
  let html = header('학생');
  const all = Object.values(S.students); const list = all.filter((s) => (S.stuShowInactive ? s.active === false : s.active !== false)).filter((s) => !S.q || s.name.includes(S.q) || (s.school || '').includes(S.q)).filter((s) => !S.mgrFilter || s.manager === S.mgrFilter).sort(studentSort);
  html += '<div class="section"><input class="search" id="stu-q" type="search" placeholder="이름·학교 검색" value="' + esc(S.q) + '" oninput="window.__q(this.value)"></div>';
  html += '<div class="filters" style="margin-top:8px">' + staffList().filter((m) => all.some((s) => s.manager === m.id)).map((m) => '<button type="button" class="pill ' + (S.mgrFilter === m.id ? 'on' : '') + '" data-act="mgr" data-args="' + m.id + '">' + esc(m.name) + '</button>').join('') + '<button type="button" class="pill ' + (S.stuShowInactive ? 'on' : '') + '" data-act="toggle" data-args="stuShowInactive">퇴원/보관</button></div>';
  const counts = {}; all.filter((s) => s.active !== false).forEach((s) => { counts[s.status || 'none'] = (counts[s.status || 'none'] || 0) + 1; });
  html += '<div class="statuses" style="margin-top:6px">' + STATUS.map(([k, n]) => '<span class="pill"><i style="width:9px;height:9px;border-radius:50%;background:var(--st-' + k + ')"></i>' + n + ' <span class="num">' + (counts[k] || 0) + '</span></span>').join('') + '<span class="pill"><i style="width:9px;height:9px;border-radius:50%;background:var(--st-none)"></i>미설정 <span class="num">' + (counts.none || 0) + '</span></span></div>';
  if (!list.length) return html + '<div class="section">' + (all.length ? loadingOrEmpty('조건에 맞는 학생이 없어요', '') : noStudents()) + '</div>' + fab('editStudent', '');
  html += '<div class="section"><div class="card">' + list.map((s) => { const ev = activeEvents(todayKey(), s.id); return '<button type="button" class="row" data-act="openStudent" data-args="' + s.id + '">' + dot(s.status) + '<span class="name">' + esc(s.name) + '</span><span class="meta">' + esc(s.school || '') + ' ' + esc(s.grade || '') + ' · ' + esc(staffName(s.manager)) + (s.days ? ' · ' + esc(s.days) : '') + '</span><span class="tail">' + (ev.length ? '<span class="pill ev">' + esc(ev[0].type) + '</span>' : '') + '<span style="color:var(--fg-3)">›</span></span></button>'; }).join('') + '</div></div>';
  return html + fab('editStudent', '');
}
window.__q = (v) => { S.q = v; render(); setTimeout(() => { const i = $('#stu-q'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };

// ---- 이슈 피드 ----
function vIssues() {
  let html = header('이슈 피드');
  let list = allEntries(); const total = list.length;
  if (S.feedType === 'student') list = list.filter((e) => e.si && e.si.trim());
  if (S.feedType === 'parent') list = list.filter((e) => e.pi && e.pi.trim());
  if (S.mgrFilter) list = list.filter((e) => (S.students[e.sid] || {}).manager === S.mgrFilter);
  html += '<div class="filters" style="margin-top:4px">' + [['student', '학생 이슈'], ['parent', '학부모 이슈']].map(([k, l]) => '<button type="button" class="pill ' + (S.feedType === k ? 'on' : '') + '" data-act="filter" data-args="feedType|' + k + '">' + l + '</button>').join('') + staffList().filter((m) => Object.values(S.students).some((s) => s.manager === m.id)).map((m) => '<button type="button" class="pill ' + (S.mgrFilter === m.id ? 'on' : '') + '" data-act="mgr" data-args="' + m.id + '">' + esc(m.name) + ' 담당</button>').join('') + '</div>';
  if (!list.length) return html + '<div class="section">' + loadingOrEmpty(total ? '조건에 맞는 이슈가 없어요' : '아직 기록된 이슈가 없어요', '표나 오늘 탭에서 이슈 칸에 적으면 최근 기록이 여기 시간순으로 모여요.') + '</div>';
  html += '<div class="section"><div class="section-h">최근 기록 <span class="cnt num">' + list.length + '</span></div><div class="card">' + list.slice(0, 300).map((e) => entryHTML(e, e.date, e.sid, true)).join('') + '</div></div>';
  return html;
}
function entryHTML(e, date, sid, showStudent) {
  const st = S.students[sid] || {};
  let h = '<div class="note"><div class="nh">' + (showStudent ? '<button type="button" class="feed-s" data-act="openDay" data-args="' + sid + '|' + date + '">' + esc(st.name || '?') + '</button><span class="feed-d num">' + fmtK(date) + '</span>' : '') + (e.att ? '<span class="pill att-' + e.att + '">' + (e.att === 'O' ? '등원' : '미등원') + '</span>' : '') + '<span class="num">' + fmtTime(entryAt(e)) + '</span></div>';
  if (e.si && e.si.trim()) h += '<div class="txt"><span class="type">학생</span> <span class="tagged">' + colorize(e.si) + '</span></div>';
  if (e.pi && e.pi.trim()) h += '<div class="txt"><span class="type parent">학부모</span> <span class="tagged">' + colorize(e.pi) + '</span></div>';
  return h + '</div>';
}

// ---- 요청 ----
function vRequests() {
  let html = header('요청');
  const all = Object.values(S.requests).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const list = all.filter((r) => (S.reqShowDone ? true : !r.done));
  html += '<div class="filters" style="margin-top:4px"><button type="button" class="pill ' + (S.reqShowDone ? 'on' : '') + '" data-act="toggle" data-args="reqShowDone">완료 포함</button>' + (me() ? '<span class="pill">나에게 온 요청 <span class="num">' + all.filter((r) => !r.done && (r.to === S.me || r.to === staffRole(S.me))).length + '</span></span>' : '') + '</div>';
  if (!list.length) return html + '<div class="section">' + loadingOrEmpty('처리할 요청이 없어요', '"@교실장님 확인 부탁드립니다" 같은 부탁을 메모에 묻어두지 말고 여기 등록하면, 받은 사람이 체크하고 끝낼 수 있어요.') + '</div>' + fab('newRequest', '');
  html += '<div class="section"><div class="card">' + list.map((r) => { const st = S.students[r.sid] || {}; return '<div class="req ' + (r.done ? 'done' : '') + '"><button type="button" class="box ' + (r.done ? 'on' : '') + '" data-act="reqDone" data-args="' + r.id + '" aria-label="완료 토글">' + (r.done ? '✓' : '') + '</button><div class="body"><div class="t">' + (st.name ? '<b>' + esc(st.name) + '</b> · ' : '') + esc(r.text) + '</div><div class="m"><span>' + esc(staffName(r.from)) + ' → <b>' + esc(S.staff[r.to] ? staffName(r.to) : r.to) + '</b></span><span class="num">' + fmtDT(r.at) + '</span>' + (r.done ? '<span>완료 ' + esc(staffName(r.doneBy)) + ' <span class="num">' + fmtDT(r.doneAt) + '</span></span>' : '') + '</div></div><button type="button" class="ck" data-act="openReq" data-args="' + r.id + '">수정</button></div>'; }).join('') + '</div></div>';
  return html + fab('newRequest', '');
}

// ---- 달력 ----
function calItems(k) {
  // 지점달력(읽기 전용) + 이 앱의 기간 이슈를 날짜별로 모은다.
  const out = []; const c = W.calendar;
  if (c) {
    const tname = (id) => ((c.teachers || []).find((t) => t.id === id) || {}).name || '';
    (c.events || []).forEach((e) => { if (e.startDate <= k && e.endDate >= k) out.push({ cls: e.category || 'etc', title: e.title, sub: (e.allDay ? '종일' : (e.startTime || '') + (e.endTime ? '~' + e.endTime : '')) + (e.startDate !== e.endDate ? ' · ' + fmtMD(e.startDate) + '~' + fmtMD(e.endDate) : ''), memo: e.memo, kind: CAL_CAT[e.category] || '행사' }); });
    (c.consultations || []).forEach((x) => { if (x.date === k && x.status !== 'canceled') out.push({ cls: 'consult', title: '상담 ' + x.studentName + (x.parentName ? ' (' + x.parentName + ')' : ''), sub: x.startTime + '~' + x.endTime + (x.counselorId ? ' · ' + tname(x.counselorId) : '') + (x.status === 'done' ? ' · 완료' : x.status === 'noshow' ? ' · 노쇼' : ''), memo: x.memo, kind: '상담' }); });
    (c.shifts || []).forEach((s) => { if (s.date !== k || s.type === 'work') return; out.push({ cls: 'shift', title: tname(s.teacherId) + (s.type === 'off' ? ' 휴무' : ' 대강' + (s.subForTeacherId ? '(' + tname(s.subForTeacherId) + ' 대신)' : '')), sub: s.startTime ? s.startTime + '~' + (s.endTime || '') : (s.leaveDays ? '연차 ' + s.leaveDays : ''), memo: s.memo, kind: '근무' }); });
    (c.misc || []).forEach((m) => { if (m.startDate <= k && m.endDate >= k) out.push({ cls: 'misc', title: m.title, sub: m.allDay ? '' : (m.startTime || ''), memo: m.memo, kind: '기타' }); });
  }
  const t = ttFor(k); if (t && t.has && t.closed && (parseKey(k).getDay() !== 0 || t.note)) out.push({ cls: 'holiday', title: '휴원' + (t.note ? ' · ' + t.note : ''), sub: '좌석 시간표', kind: '시간표' });
  else if (t && t.note) out.push({ cls: 'misc', title: t.note, sub: '좌석 시간표 메모', kind: '시간표' });
  activeEvents(k).forEach((e) => out.push({ cls: 'stu', title: ((S.students[e.sid] || {}).name || '?') + ' ' + e.type, sub: (e.text || '') + ' ' + fmtMD(e.from) + (e.to && e.to !== e.from ? '~' + fmtMD(e.to) : ''), kind: '학생' }));
  return out;
}
function attSummary(k) { const d = days()[k]; if (!d) return null; let o = 0, x = 0; Object.values(d.s || {}).forEach((e) => { if (e.att === 'O') o++; else if (e.att === 'X') x++; }); return o + x ? { o, x } : null; }
function vCalendar() {
  let html = header('달력', [W.calendar ? '지점달력' : '', W.timetable ? '시간표' : ''].filter(Boolean).join('·') + (W.calendar || W.timetable ? ' 연동' : ''));
  const [y, m] = S.month.split('-').map(Number); const first = S.month + '-01'; const d0 = parseKey(first); const startDow = d0.getDay();
  const dim = new Date(y, m, 0).getDate(); const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(shiftK(first, i - startDow));
  for (let i = 1; i <= dim; i++) cells.push(S.month + '-' + pad(i));
  while (cells.length % 7) cells.push(shiftK(cells[cells.length - 1], 1));
  html += '<div class="cal-head"><button type="button" class="icon-btn" data-act="month" data-args="-1" aria-label="전달">‹</button><div class="m num">' + y + '년 ' + m + '월</div><button type="button" class="icon-btn" data-act="month" data-args="1" aria-label="다음달">›</button><button type="button" class="btn sm ghost" data-act="month" data-args="t">오늘</button><span class="spacer"></span><a class="btn sm" href="' + CAL_URL + '" target="_blank" rel="noopener">지점달력 열기 ↗</a></div>';
  if (!W.calendar) html += '<div class="banner">' + (W.status === 'off' ? '클라우드에 연결하면 지점달력의 행사·휴원·상담 일정이 여기 함께 떠요.' : '지점달력 데이터가 아직 없어요. 지점달력 앱에서 같은 학원 코드로 공유를 켜면 여기 자동으로 떠요.') + '</div>';
  html += '<div class="cal-legend">' + [['exam', '시험'], ['briefing', '설명회'], ['holiday', '휴원'], ['vacation', '방학·특강'], ['etc', '행사'], ['consult', '상담'], ['shift', '근무']].map(([c, l]) => '<span><i style="background:var(--cal-' + c + ')"></i>' + l + '</span>').join('') + '<span><i style="background:var(--warn-soft);border:1px solid var(--warn)"></i>학생 기간 이슈</span><span><b style="color:var(--accent)">O</b>/<b style="color:var(--danger)">X</b> 그날 출결</span></div>';
  html += '<div class="cal">' + WD.split('').map((w, i) => '<div class="wd ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>').join('');
  const today = todayKey();
  cells.forEach((k) => {
    const dow = parseKey(k).getDay(); const hol = holidayName(k); const items = calItems(k); const att = attSummary(k);
    const cls = ['day', k.slice(0, 7) !== S.month ? 'out' : '', k === today ? 'today' : '', k === S.calSel ? 'sel' : '', dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''].filter(Boolean).join(' ');
    html += '<button type="button" class="' + cls + '" data-act="calDay" data-args="' + k + '"><div class="dn ' + (hol ? 'hol' : '') + '"><span class="num">' + Number(k.slice(8)) + '</span></div>' + (hol ? '<div class="hol-n">' + esc(hol) + '</div>' : '')
      + items.slice(0, 3).map((it) => '<div class="it ' + it.cls + '">' + esc(it.title) + '</div>').join('') + (items.length > 3 ? '<div class="it more">+' + (items.length - 3) + '</div>' : '')
      + (att ? '<div class="att"><b>O' + att.o + '</b> <em>X' + att.x + '</em></div>' : '') + '</button>';
  });
  html += '</div>';
  return html;
}

// ---- 설정 ----
function vSetup() {
  let html = header('설정');
  const cfg = W.cfg; const st = W.status;
  html += '<div class="section"><div class="section-h">여러 기기 공유</div><div class="card"><div class="row">' + syncChip() + '<span class="meta">' + (cfg ? '학원 코드 <b>' + esc(cfg.roomId) + '</b>' + (W.dirtyCount ? ' · 올릴 변경 ' + W.dirtyCount : '') : '연결하면 매니저·원장 모두 같은 데이터를 봐요') + '</span><button type="button" class="btn sm" data-act="openSync">' + (cfg ? '설정' : '연결') + '</button></div></div></div>';
  html += '<div class="section"><div class="section-h">내 이름</div><div class="card"><div class="row">' + meChip() + '<span class="meta">이 기기에서 기록할 때 작성자로 표시됩니다</span></div></div></div>';
  const staff = Object.values(S.staff).sort((a, b) => (a.order || 0) - (b.order || 0));
  html += '<div class="section"><div class="section-h">직원 <span class="cnt num">' + staff.filter((x) => x.active !== false).length + '</span><span class="spacer"></span><button type="button" class="btn sm" data-act="editStaff" data-args="">+ 추가</button></div><div class="card">' + (staff.length ? staff.map((x) => '<button type="button" class="row" data-act="editStaff" data-args="' + x.id + '"><span class="name role-' + esc(x.role) + '">' + esc(x.name) + '</span><span class="meta">' + esc(x.role) + (x.active === false ? ' · 비활성' : '') + '</span><span class="tail">' + esc(tag(x.id)) + '</span></button>').join('') : '<div class="empty">직원을 추가하세요. CM, TM, 원장, 코디 역할별로 글씨 색이 구분됩니다.</div>') + '</div></div>';
  const nDays = Object.keys(days()).length, nNotes = allEntries().length;
  html += '<div class="section"><div class="section-h">데이터</div><div class="card"><div class="row"><span class="meta">학생 ' + Object.keys(S.students).length + ' · 일지 ' + nDays + '일 · 이슈 기록 ' + nNotes + ' · 기간이슈 ' + Object.keys(S.events).length + ' · 요청 ' + Object.keys(S.requests).length + '</span></div><div class="row" style="flex-wrap:wrap;gap:8px">' + '<button type="button" class="btn sm" data-act="exportJson">백업 내려받기</button><button type="button" class="btn sm" data-act="importJson">백업 불러오기</button></div></div></div>';
  html += '<div class="section"><div class="section-h">사용 안내</div><div class="card" style="padding:12px 14px"><ul class="help" style="margin:0;padding-left:18px"><li><b>표</b>: 시트처럼 한 화면. 등원 칸 클릭, 이슈 칸은 바로 타이핑.</li><li><b>일정</b>: 예전 DC관리 시트. 하루 치 등원 약속·SC·DC·개별지도·전달사항을 한 장에. 매니저별로 걸러 보고 인쇄도 돼요.</li><li><b>작성자 태그</b>는 자동으로 붙어요. CM은 [이CM]처럼 성+CM, 나머지는 [TM]·[원장]·[코디].</li><li><b>기간 이슈</b>(여행·시험·장기 미등원)는 한 번만 등록하면 해당 기간 내내 표시됩니다.</li><li><b>요청</b>은 받는 사람을 지정해 등록하고, 처리되면 체크.</li><li><b>달력</b>은 지점달력 앱의 일정을 읽어와 보여줘요. 행사·상담 등록은 지점달력에서.</li><li><b>시간표</b>는 좌석 시간표 앱의 배정을 학생 이름으로 맞춰 보여줘요(오늘 교시·과목·강사, 예정 없는 학생은 흐리게). 배정 변경은 시간표 앱에서.</li><li>학생 <b>상태색</b>(위험·주황·집중·초록·좋음)은 학생 상세에서 바꿉니다.</li></ul></div></div>';
  return html;
}

// ---------- sheets ----------
function openSheet(sh) { S.sheet = sh; render(); }
function drawLayer() {
  const L = $('#layer'); const sh = S.sheet;
  if (!sh) { L.innerHTML = ''; document.body.style.overflow = ''; return; }
  document.body.style.overflow = 'hidden';
  const body = sh.kind === 'sday' ? shDay(sh) : sh.kind === 'student' ? shStudent(sh) : sh.kind === 'sedit' ? shStudentEdit(sh) : sh.kind === 'event' ? shEvent(sh) : sh.kind === 'request' ? shRequest(sh) : sh.kind === 'me' ? shMe(sh) : sh.kind === 'calday' ? shCalDay(sh) : sh.kind === 'sync' ? shSync(sh) : shStaff(sh);
  const prev = {}; L.querySelectorAll('input,textarea,select').forEach((i) => { if (i.id) prev[i.id] = { v: i.value, f: document.activeElement === i, s: i.selectionStart }; });
  const scroll = (L.querySelector('.sheet-b') || {}).scrollTop || 0;
  L.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in"><div class="grab"></div>' + body + '</div></div>';
  Object.entries(prev).forEach(([id, p]) => { const i = document.getElementById(id); if (i) { if (i.value !== p.v && (i.dataset.live !== 'yes' || p.f)) i.value = p.v; if (p.f) { i.focus(); try { i.setSelectionRange(p.s, p.s); } catch (e) { /* noop */ } } } });
  const b = L.querySelector('.sheet-b'); if (b) b.scrollTop = scroll;
}
function head(title, sub, extra) { return '<div class="sheet-h"><div style="min-width:0;flex:1"><h2>' + title + '</h2>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' + (extra || '') + '<button type="button" class="icon-btn" data-act="close" aria-label="닫기">×</button></div>'; }
function sel(id, opts, val, label) { return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '" ' + (v === val ? 'selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>'; }
function inp(id, label, val, ph, type) { return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }

function shDay(sh) {
  const s = S.students[sh.sid] || { name: '?' }; const e = dayEntry(sh.date, sh.sid); const evs = activeEvents(sh.date, sh.sid);
  let h = head(esc(s.name) + ' <span style="color:var(--fg-3);font-weight:500;font-size:14px">' + esc(s.school || '') + ' ' + esc(s.grade || '') + '</span>', '<span class="num">' + fmtK(sh.date) + '</span> · 담당 ' + esc(staffName(s.manager)), '<button type="button" class="btn sm" data-act="openStudent" data-args="' + sh.sid + '">상세</button>');
  h += '<div class="sheet-b">';
  h += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="seg big"><button type="button" class="' + (e.att === 'O' ? 'on' : '') + '" data-act="att" data-args="' + sh.sid + '|O|' + sh.date + '">등원 O</button><button type="button" class="' + (e.att === 'X' ? 'on X' : '') + '" data-act="att" data-args="' + sh.sid + '|X|' + sh.date + '">미등원 X</button></span>' + (e.attBy ? '<span style="font-size:12.5px;color:var(--fg-3)">' + esc(staffName(e.attBy)) + ' <span class="num">' + fmtTime(e.attAt) + '</span></span>' : '') + '</div>';
  if (evs.length) h += '<div>' + evs.map((ev) => '<div class="ev-item"><span><b>' + esc(ev.type) + '</b> ' + esc(ev.text || '') + ' <span class="num">' + fmtMD(ev.from) + (ev.to && ev.to !== ev.from ? '~' + fmtMD(ev.to) : '') + '</span></span><button type="button" class="x" data-act="delEvent" data-args="' + ev.id + '" aria-label="삭제">×</button></div>').join('') + '</div>';
  const f = e.f || {}; const dc = Object.assign({}, e.dc || {});
  if (!dc.tut) { const a = ttTutText(sh.date, s); if (a) dc.tut = a; }
  if (DC_FIELDS.some(([k]) => dc[k]) || dc.off) h += '<div class="block"><h3>일정 ' + (dc.off ? '<span class="pill n">OFF</span>' : '') + '</h3><div class="kv">' + DC_FIELDS.filter(([k]) => dc[k]).map(([k, l]) => '<span>' + l + ' <b style="color:var(--fg-2)">' + esc(dc[k]) + '</b></span>').join('') + '</div>' + DC_TEXT.filter(([k]) => dc[k]).map(([k, l]) => '<div class="kv" style="margin-top:4px"><span>' + l + ' <b style="color:var(--fg-2);white-space:pre-wrap">' + esc(dc[k]) + '</b></span></div>').join('') + '</div>';
  h += '<div class="block"><div class="field"><label for="f-drowsy">졸음/전자기기</label><input id="f-drowsy" data-field="drowsy" data-live="yes" value="' + esc(f.drowsy || '') + '" placeholder="예 졸음 2회, 폰 1회"></div></div>';
  const memo = (k, l, ph) => '<div class="block memo-box"><h3>' + l + (e[k + 'By'] ? ' <span style="font-weight:500;color:var(--fg-3)">· ' + esc(staffName(e[k + 'By'])) + ' <span class="num">' + fmtDT(e[k + 'At']) + '</span></span>' : '') + '</h3><textarea id="mi-' + k + '" data-issue="' + k + '" data-sid="' + sh.sid + '" data-date="' + sh.date + '" data-live="yes" placeholder="' + ph + '">' + esc(e[k] || '') + '</textarea><div class="hint">' + (k === 'm' ? '자유 메모. 며칠 이어지는 일은 아래 기간 이슈 등록이 편해요.' : me() ? '새로 쓰면 ' + esc(tag(S.me)) + ' 태그가 자동으로 붙어요. 다른 곳을 누르면 저장.' : '작성자를 먼저 선택하세요.') + '</div></div>';
  h += memo('si', '학생 관리 이슈', '태도 · 컨디션 · 학습 이슈 · 지각 · SC/DC · 상담 내용…');
  h += memo('pi', '학부모 관리 이슈', '학부모 연락 내용 · 이슈 관리 · 요청사항 · 카톡 내용…');
  h += memo('m', '기간 이슈 / 메모', '예 11/5~8 미등원(여행), 책 두고 감…');
  h += '<div class="block" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="newEvent" data-args="' + sh.sid + '">기간 이슈 등록</button><button type="button" class="btn" data-act="newRequest" data-args="' + sh.sid + '">요청 보내기</button></div>';
  return h + '</div>';
}
function shStudent(sh) {
  const s = S.students[sh.sid]; if (!s) return head('학생 없음', '') + '<div class="sheet-b"></div>';
  const dates = Object.keys(days()).sort().reverse();
  let h = head(esc(s.name) + ' <span style="color:var(--fg-3);font-weight:500;font-size:14px">' + esc(s.school || '') + ' ' + esc(s.grade || '') + '</span>', '담당 ' + esc(staffName(s.manager)) + (s.days ? ' · ' + esc(s.days) : '') + (s.active === false ? ' · 보관됨' : ''), '<button type="button" class="btn sm" data-act="editStudent" data-args="' + s.id + '">편집</button>');
  h += '<div class="sheet-b">';
  h += '<div class="block" style="margin-top:0"><h3>상태 ' + (s.statusAt ? '<span style="font-weight:500">· ' + esc(staffName(s.statusBy)) + ' <span class="num">' + fmtDT(s.statusAt) + '</span></span>' : '') + '</h3><div class="statuses">' + STATUS.map(([k, n]) => '<button type="button" class="' + (s.status === k ? 'on' : '') + '" data-act="setStatus" data-args="' + s.id + '|' + k + '"><i style="background:var(--st-' + k + ')"></i>' + n + '</button>').join('') + '</div></div>';
  if (s.memo) h += '<div class="block"><h3>특이사항</h3><div style="white-space:pre-wrap">' + esc(s.memo) + '</div></div>';
  if (W.timetable) {
    const ws = mondayOf(todayKey()); const cells = [];
    for (let i = 0; i < 6; i++) { const k = shiftK(ws, i); const ss = ttSessions(k, s) || []; const t = ttFor(k); cells.push('<div class="ttd' + (k === todayKey() ? ' today' : '') + (t && t.closed ? ' closed' : '') + '"><b>' + '월화수목금토'[i] + ' <span class="num">' + Number(k.slice(8)) + '</span></b>' + (t && t.closed ? '<span>휴원</span>' : ss.length ? ss.map((x) => '<span>' + x.block + ' ' + esc(x.subject) + (x.teacher ? '<i>' + esc(x.teacher) + '</i>' : '') + (x.time ? '<em class="num">' + esc(x.time) + '</em>' : '') + '</span>').join('') : '<span class="none">–</span>') + '</div>'); }
    h += '<div class="block"><h3>이번 주 시간표 <span style="font-weight:500;color:var(--fg-3)">· 좌석 시간표 앱</span></h3><div class="ttw">' + cells.join('') + '</div></div>';
    const rp = ttReport(ws, s);
    if (rp) h += '<div class="block"><h3>이번 주 보고서 <span style="font-weight:500;color:var(--fg-3)">· 시간표 앱에 적은 것</span></h3><div class="card">' + Object.entries(rp.days || {}).sort().map(([di, d]) => '<div class="tl-day"><div class="dh"><span>' + '월화수목금토일'[Number(di)] + '</span>' + (d.attitude ? '<span class="pill n">' + (ATT_LABEL[d.attitude] || d.attitude) + '</span>' : '') + '</div><div class="kv">' + (d.arrival ? '<span>등원 <b>' + esc(d.arrival) + '</b></span>' : '') + (d.departure ? '<span>하원 <b>' + esc(d.departure) + '</b></span>' : '') + (d.bedtime ? '<span>취침 <b>' + esc(d.bedtime) + '</b></span>' : '') + (d.note ? '<span>' + esc(d.note) + '</span>' : '') + '</div></div>').join('') + (rp.comment ? '<div class="tl-day"><div class="kv"><span>종합 <b>' + esc(rp.comment) + '</b></span></div></div>' : '') + '</div></div>';
  }
  const evs = Object.values(S.events).filter((e) => e.sid === s.id).sort((a, b) => b.from.localeCompare(a.from));
  h += '<div class="block"><h3>기간 이슈</h3>' + (evs.length ? evs.map((ev) => '<div class="ev-item"><span><b>' + esc(ev.type) + '</b> ' + esc(ev.text || '') + ' <span class="num">' + fmtMD(ev.from) + (ev.to && ev.to !== ev.from ? '~' + fmtMD(ev.to) : '') + '</span></span><button type="button" class="x" data-act="delEvent" data-args="' + ev.id + '" aria-label="삭제">×</button></div>').join('') : '<div style="color:var(--fg-3);font-size:13.5px">없음</div>') + '<div style="margin-top:8px"><button type="button" class="btn sm" data-act="newEvent" data-args="' + s.id + '">+ 기간 이슈</button> <button type="button" class="btn sm" data-act="newRequest" data-args="' + s.id + '">+ 요청</button></div></div>';
  const rows = []; let o = 0, x = 0;
  dates.forEach((d) => { const e = ((days()[d] || {}).s || {})[s.id]; if (!e) return; if (e.att === 'O') o++; if (e.att === 'X') x++; const hi = hasIssue(e); const f = e.f || {}; if (!e.att && !hi && !f.drowsy && !(e.m && e.m.trim())) return; rows.push('<div class="tl-day"><div class="dh"><span class="num">' + fmtK(d) + '</span>' + (e.att ? '<span class="pill att-' + e.att + '">' + (e.att === 'O' ? '등원' : '미등원') + '</span>' : '') + '<button type="button" class="btn sm ghost" style="margin-left:auto" data-act="gotoDay" data-args="' + d + '|' + s.id + '">열기</button></div>' + (f.drowsy || (e.m && e.m.trim()) ? '<div class="kv">' + (f.drowsy ? '<span>졸음/전자기기 <b style="color:var(--fg-2)">' + esc(f.drowsy) + '</b></span>' : '') + (e.m && e.m.trim() ? '<span>메모 <b style="color:var(--fg-2)">' + esc(e.m) + '</b></span>' : '') + '</div>' : '') + (hi ? '<div class="card" style="margin-top:6px">' + entryHTML(e, d, s.id, false) + '</div>' : '') + '</div>'); });
  h += '<div class="block"><h3>기록 <span style="font-weight:500;color:var(--fg-3)">최근 ' + dates.length + '일 중 등원 <span class="num">' + o + '</span> · 미등원 <span class="num">' + x + '</span></span></h3><div class="card">' + (rows.length ? rows.join('') : '<div class="empty" style="padding:14px">아직 기록이 없어요.</div>') + '</div></div>';
  return h + '</div>';
}
function shStudentEdit(sh) {
  const s = S.students[sh.sid] || {}; const isNew = !sh.sid;
  const mg = staffList().map((m) => [m.id, m.name + ' (' + m.role + ')']); mg.unshift(['', '미지정']);
  let h = head(isNew ? '학생 추가' : '학생 편집', '');
  h += '<div class="sheet-b"><div class="grid2">' + inp('se-name', '이름', s.name, '학생 이름') + inp('se-school', '학교', s.school, '예 상계고') + inp('se-grade', '학년', s.grade, '예 고1') + sel('se-mgr', mg, s.manager || '', '담당 매니저') + inp('se-days', '등원 요일(짧게)', s.days, '예 월수금') + inp('se-sched', '등하원 시간(일정 탭에 표시)', s.sched, '예 월수금 4:30 등원, 토 11-2시') + inp('se-phone', '학부모 연락처', s.phone, '선택') + '</div><div class="field" style="margin-top:10px"><label for="se-memo">특이사항</label><textarea id="se-memo">' + esc(s.memo || '') + '</textarea></div>';
  if (!isNew) h += '<div class="block"><button type="button" class="btn sm ' + (s.active === false ? '' : 'danger') + '" data-act="archiveStudent" data-args="' + sh.sid + '|' + (s.active !== false) + '">' + (s.active === false ? '다시 활성화' : '퇴원/보관 처리') + '</button> <span style="font-size:12.5px;color:var(--fg-3)">기록은 남고 오늘 목록에서만 빠집니다</span></div>';
  h += '</div><div class="sheet-f"><button type="button" class="btn" data-act="close">취소</button><span class="spacer"></span><button type="button" class="btn pri" data-act="submitSheet">저장</button></div>';
  return h;
}
function shEvent(sh) {
  const ev = sh.id ? S.events[sh.id] || {} : {}; const sid = sh.sid || ev.sid || '';
  const studs = studentsActive().sort(studentSort).map((s) => [s.id, s.name + ' ' + (s.grade || '')]); studs.unshift(['', '학생 선택']);
  let h = head('기간 이슈', '여행·시험·장기 미등원처럼 며칠 이어지는 일을 한 번만 등록');
  h += '<div class="sheet-b"><div class="grid2">' + sel('ev-sid', studs, sid, '학생') + sel('ev-type', EV_TYPES.map((t) => [t, t]), ev.type || '미등원', '종류') + inp('ev-from', '시작', ev.from || S.date, '', 'date') + inp('ev-to', '끝(같은 날이면 비워도 됨)', ev.to || '', '', 'date') + '</div><div class="field" style="margin-top:10px"><label for="ev-text">메모</label><input id="ev-text" value="' + esc(ev.text || '') + '" placeholder="예 일본 여행, 중간고사"></div></div>';
  h += '<div class="sheet-f"><button type="button" class="btn" data-act="close">취소</button><span class="spacer"></span><button type="button" class="btn pri" data-act="submitSheet">저장</button></div>';
  return h;
}
function shRequest(sh) {
  const r = sh.id ? S.requests[sh.id] || {} : {}; const sid = sh.sid || r.sid || '';
  const studs = studentsActive().sort(studentSort).map((s) => [s.id, s.name + ' ' + (s.grade || '')]); studs.unshift(['', '(학생 무관)']);
  const to = staffList().filter((m) => m.id !== S.me).map((m) => [m.id, m.name + ' (' + m.role + ')']); ROLES.forEach((rl) => to.push([rl, rl + ' 전체']));
  let h = head(sh.id ? '요청 수정' : '요청 보내기', '받는 사람이 확인하고 체크하면 끝');
  h += '<div class="sheet-b"><div class="grid2">' + sel('rq-to', to, r.to || '', '받는 사람') + sel('rq-sid', studs, sid, '관련 학생') + '</div><div class="field" style="margin-top:10px"><label for="rq-text">내용</label><textarea id="rq-text" placeholder="예 다음 주 보충 가능한지 확인 부탁드립니다">' + esc(r.text || '') + '</textarea></div>' + (sh.id ? '<div class="block"><button type="button" class="btn sm danger" data-act="delRequest" data-args="' + sh.id + '">요청 삭제</button></div>' : '') + '</div>';
  h += '<div class="sheet-f"><button type="button" class="btn" data-act="close">취소</button><span class="spacer"></span><button type="button" class="btn pri" data-act="submitSheet">저장</button></div>';
  return h;
}
function shMe() {
  const list = staffList();
  let h = head('누구세요?', '이 기기에서 기록할 때 작성자로 표시됩니다');
  h += '<div class="sheet-b"><div class="card">' + (list.length ? list.map((m) => '<button type="button" class="row" data-act="setMe" data-args="' + m.id + '"><span class="name role-' + esc(m.role) + '">' + esc(m.name) + '</span><span class="meta">' + esc(m.role) + ' · ' + esc(tag(m.id)) + '</span><span class="tail">' + (S.me === m.id ? '<span class="pill att-O">선택됨</span>' : '') + '</span></button>').join('') : '<div class="empty">아직 직원이 없어요. 설정 탭에서 명단을 불러오거나 직원을 추가하세요.</div>') + '</div><div class="block"><button type="button" class="btn sm" data-act="editStaff" data-args="">+ 직원 추가</button></div></div>';
  return h;
}
function shStaff(sh) {
  const m = S.staff[sh.id] || {};
  let h = head(sh.id ? '직원 편집' : '직원 추가', '');
  h += '<div class="sheet-b"><div class="grid2">' + inp('st-name', '이름', m.name, '예 홍길동') + sel('st-role', ROLES.map((r) => [r, r]), m.role || 'CM', '역할') + inp('st-order', '정렬 순서', m.order == null ? '' : m.order, '숫자', 'number') + sel('st-active', [['1', '활성'], ['0', '비활성(퇴사 등)']], m.active === false ? '0' : '1', '상태') + '</div><p class="help" style="margin:10px 0 0">태그 미리보기: CM이면 성+CM(예 [이CM]), 그 외는 [역할].</p></div>';
  h += '<div class="sheet-f"><button type="button" class="btn" data-act="close">취소</button><span class="spacer"></span><button type="button" class="btn pri" data-act="submitSheet">저장</button></div>';
  return h;
}
function shCalDay(sh) {
  const k = sh.date; const items = calItems(k); const hol = holidayName(k); const att = attSummary(k);
  const studs = studentsActive(); const d = days()[k] || { s: {} };
  const xs = studs.filter((s) => (d.s[s.id] || {}).att === 'X');
  const t = ttFor(k);
  let h = head('<span class="num">' + fmtK(k) + '</span>' + (hol ? ' <span style="color:var(--danger);font-size:14px">' + esc(hol) + '</span>' : ''), (t && t.has && !t.closed ? '시간표 예정 ' + t.count + '명 · ' : '') + (att ? '등원 ' + att.o + ' · 미등원 ' + att.x : '출결 기록 없음'), '<button type="button" class="btn sm" data-act="gotoBoard" data-args="' + k + '">이날 표 보기</button>');
  h += '<div class="sheet-b"><div class="card">' + (items.length ? items.map((it) => '<div class="cal-item"><i style="background:var(--cal-' + (it.cls === 'stu' ? 'etc' : it.cls) + ')' + (it.cls === 'stu' ? ';background:var(--warn)' : '') + '"></i><div class="b"><div class="t">' + esc(it.title) + ' <span style="font-weight:500;color:var(--fg-3);font-size:12px">' + esc(it.kind) + '</span></div>' + (it.sub ? '<div class="m">' + esc(it.sub) + '</div>' : '') + (it.memo ? '<div class="m" style="white-space:pre-wrap">' + esc(it.memo) + '</div>' : '') + '</div></div>').join('') : '<div class="empty" style="padding:14px">이날 등록된 일정이 없어요.</div>') + '</div>';
  if (xs.length) h += '<div class="block"><h3>미등원 <span class="num" style="color:var(--fg-3)">' + xs.length + '</span></h3><div class="card">' + xs.map((s) => '<button type="button" class="row" data-act="openDay" data-args="' + s.id + '|' + k + '">' + dot(s.status) + '<span class="name">' + esc(s.name) + '</span><span class="meta">' + esc(s.school || '') + ' ' + esc(s.grade || '') + ' · ' + esc(staffName(s.manager)) + '</span></button>').join('') + '</div></div>';
  h += '<div class="block"><button type="button" class="btn sm" data-act="newEvent" data-args="">+ 학생 기간 이슈</button> <a class="btn sm" href="' + CAL_URL + '" target="_blank" rel="noopener">행사·상담은 지점달력에서 ↗</a></div>';
  return h + '</div>';
}
function shSync() {
  const cfg = W.cfg || {}; const sib = W.siblingCfg();
  let h = head('여러 기기 공유', '달력·급여명세서와 같은 Supabase, 같은 학원 코드');
  h += '<div class="sheet-b">';
  if (W.cfg) h += '<p class="help" style="margin:0 0 10px">현재 학원 코드 <b>' + esc(cfg.roomId) + '</b>로 공유 중 · 상태: ' + (W.status === 'ok' ? '정상 ✓' : W.status === 'syncing' ? '저장 중…' : '오류 (' + esc(W.lastError) + ')') + '</p>';
  else h += '<p class="help" style="margin:0 0 10px">연결하면 매니저·원장이 각자 폰이나 PC에서 <b>같은 데이터</b>를 보고, 지점달력의 일정과 좌석 시간표의 배정도 함께 떠요.' + (sib ? ' 이 브라우저의 달력 앱 설정을 그대로 가져올 수 있어요.' : '') + '</p>';
  if (sib && !W.cfg) h += '<div style="margin-bottom:10px"><button type="button" class="btn sm" data-act="adoptSibling">달력 앱 설정 가져오기</button></div>';
  h += inp('sy-url', 'Supabase 프로젝트 URL', cfg.url || W.DEFAULT_URL, 'https://xxxx.supabase.co') + '<div style="height:10px"></div>' + inp('sy-key', 'anon 공개 키', cfg.anonKey || '', 'eyJhbGci…') + '<div style="height:10px"></div>' + inp('sy-room', '학원 코드 (달력 앱과 같은 코드)', cfg.roomId || '', '예: 우리학원');
  h += '<div class="block" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn pri" id="sy-go" data-act="connectSync">' + (W.cfg ? '설정 다시 연결' : '연결하기') + '</button>' + (W.cfg ? '<button type="button" class="btn" data-act="refreshSync">지금 새로고침</button><button type="button" class="btn danger" data-act="disconnect">공유 끊기</button>' : '') + '</div>';
  h += '<details class="help" style="margin-top:14px"><summary>Supabase 처음 설정하는 방법</summary><ol style="padding-left:18px"><li>supabase.com 가입 후 새 프로젝트 (무료).</li><li>SQL Editor에서 한 번 실행 (달력에서 이미 했다면 생략):<pre>create table boards (\n  id text primary key,\n  data jsonb not null,\n  updated_at timestamptz not null default now()\n);\nalter table boards enable row level security;\ncreate policy "open access" on boards\n  for all using (true) with check (true);</pre></li><li>Project Settings → API에서 URL과 anon public 키 복사.</li><li>학원 코드는 달력 앱과 똑같이. 다른 기기에도 같은 세 값을 넣으면 공유돼요.</li></ol></details>';
  return h + '</div>';
}
function submitSheet() {
  const sh = S.sheet; if (!sh) return;
  const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const now = nowIso();
  if (sh.kind === 'sedit') {
    const name = v('se-name'); if (!name) { toast('이름을 입력해 주세요'); return; }
    const data = { name, school: v('se-school'), grade: v('se-grade'), manager: v('se-mgr'), days: v('se-days'), sched: v('se-sched'), phone: v('se-phone'), memo: v('se-memo') };
    if (!sh.sid) Object.assign(data, { active: true, status: null, createdAt: now });
    W.upsert('students', sh.sid || null, data);
  } else if (sh.kind === 'event') {
    if (!needMe()) return; const sid = v('ev-sid'), from = v('ev-from'); if (!sid || !from) { toast('학생과 시작일을 선택해 주세요'); return; }
    W.upsert('events', sh.id || null, { sid, type: v('ev-type'), from, to: v('ev-to') || from, text: v('ev-text'), by: S.me, at: now });
  } else if (sh.kind === 'request') {
    if (!needMe()) return; const to = v('rq-to'), text = v('rq-text'); if (!to || !text) { toast('받는 사람과 내용을 입력해 주세요'); return; }
    const data = { to, sid: v('rq-sid'), text }; if (!sh.id) Object.assign(data, { from: S.me, at: now, done: false });
    W.upsert('requests', sh.id || null, data);
  } else if (sh.kind === 'staff') {
    const name = v('st-name'); if (!name) { toast('이름을 입력해 주세요'); return; }
    W.upsert('staff', sh.id || null, { name, role: v('st-role'), order: Number(v('st-order') || 0), active: v('st-active') === '1' });
  }
  toast('저장했어요'); S.sheet = null; render();
}

// ---------- 드래그로 학생 순서 바꾸기 (일정 탭) ----------
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.drag-h'); if (!h || e.button) return;
  const tr = h.closest('tr[data-sid]'); if (!tr) return;
  drag = { tr, tbody: tr.parentElement, sid: tr.dataset.sid, moved: false, h };
  tr.classList.add('dragging'); try { h.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return; e.preventDefault();
  const el = document.elementFromPoint(e.clientX, e.clientY); const tr = el && el.closest ? el.closest('tr[data-sid]') : null;
  if (!tr || tr === drag.tr || tr.parentElement !== drag.tbody) return;
  const rect = tr.getBoundingClientRect(); const after = e.clientY > rect.top + rect.height / 2;
  drag.tbody.insertBefore(drag.tr, after ? tr.nextSibling : tr); drag.moved = true;
});
function endDrag() {
  if (!drag) return; const d = drag; drag = null; d.tr.classList.remove('dragging');
  if (d.moved) commitOrder([...d.tbody.querySelectorAll('tr[data-sid]')].map((t) => t.dataset.sid));
  if (pending) { pending = false; render(); }
}
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
/** 화면에 보이는 학생들의 새 순서를 전체 순서에 끼워 넣고 번호를 다시 매긴다 */
function commitOrder(visible) {
  if (!needMe()) return;
  const full = studentsActive().sort(orderSort); const ids = full.map((x) => x.id);
  const slots = ids.map((id, i) => (visible.includes(id) ? i : -1)).filter((i) => i >= 0);
  const next = ids.slice(); slots.forEach((pos, j) => { next[pos] = visible[j]; });
  let n = 0; next.forEach((id, i) => { const o = (i + 1) * 10; if (S.students[id] && S.students[id].order !== o) { W.upsert('students', id, { order: o }); n++; } });
  [...document.querySelectorAll('table.dc tbody tr[data-sid]')].forEach((tr, i) => { const c = tr.querySelector('td.c1'); if (c) c.lastChild.nodeValue = String(i + 1); });
  if (n) toast('순서를 저장했어요');
}

// ---------- 지금 시간 표시 (일정 탭) ----------
function tickNow() {
  const cells = document.querySelectorAll('[data-rng]'); if (!cells.length) return;
  const live = S.view === 'dc' && S.date === todayKey(); const d = new Date(); const now = d.getHours() * 60 + d.getMinutes();
  cells.forEach((td) => {
    let on = false, soon = false;
    if (live) td.dataset.rng.split(',').forEach((p) => { const [a, b] = p.split('-').map(Number); if (now >= a && now < b) on = true; else if (a > now && a - now <= 10) soon = true; });
    td.classList.toggle('now', on); td.classList.toggle('soon', !on && soon);
    const tr = td.closest('tr'); if (tr && on) tr.classList.add('live');
  });
  document.querySelectorAll('table.dc tr.live').forEach((tr) => { if (!tr.querySelector('.now')) tr.classList.remove('live'); });
}
setInterval(tickNow, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickNow(); });

// ---------- boot ----------
W.onChange(render);
W.init();
render();
})();
