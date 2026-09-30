import { useEffect, useRef, useState } from 'react';
import type { PayslipData } from './types';
import { addMonths, monthTitle, thisMonth } from './lib/date';
import { loadData, normalizeData, saveData } from './lib/storage';
import {
  fetchRemote,
  fetchRemoteStamp,
  loadSyncConfig,
  pushRemote,
  saveSyncConfig,
  type SyncConfig,
} from './lib/sync';
import { EmployeesTab } from './components/EmployeesTab';
import { WorkTab } from './components/WorkTab';
import { PayslipTab } from './components/PayslipTab';
import { SettingsModal } from './components/SettingsModal';
import { BackupModal } from './components/BackupModal';
import { SyncModal } from './components/SyncModal';

type Tab = 'work' | 'payslip' | 'employees';

const TAB_LABELS: Record<Tab, string> = {
  work: '근무 기록',
  payslip: '명세서',
  employees: '직원',
};

export default function App() {
  const [data, setData] = useState<PayslipData>(loadData);
  const [tab, setTab] = useState<Tab>('work');
  const [month, setMonth] = useState(thisMonth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [saveError, setSaveError] = useState('');

  /* ----- 여러 컴퓨터 공유 (Supabase) — 달력·시간표 앱과 같은 구조 ----- */
  const [syncCfg, setSyncCfg] = useState<SyncConfig | null>(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState<'off' | 'ok' | 'syncing' | 'error'>(
    loadSyncConfig() ? 'syncing' : 'off',
  );
  /** 우리가 마지막으로 알고 있는 서버 버전. 이 값과 다르면 새 데이터가 온 것 */
  const remoteStampRef = useRef<string | null>(null);
  /** 서버에서 받은 데이터를 적용하는 중이면 true → 다시 올리지 않는다 */
  const applyingRemoteRef = useRef(false);
  /** 아직 서버에 안 올라간 로컬 변경이 있는지 */
  const dirtyRef = useRef(false);

  useEffect(() => {
    const result = saveData(data);
    setSaveError(result.ok ? '' : result.error ?? '');
  }, [data]);

  function update(updater: (prev: PayslipData) => PayslipData) {
    setData((prev) => updater(prev));
  }

  function applyRemote(remoteData: PayslipData, stamp: string) {
    applyingRemoteRef.current = true;
    remoteStampRef.current = stamp;
    dirtyRef.current = false;
    // 클라우드의 옛 데이터에 새 설정이 없을 수 있으므로 보정해서 적용한다.
    setData(normalizeData(remoteData));
    // setData 반영 뒤 플래그를 풀어야 업로드 이펙트가 건너뛴다.
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }

  function changeSyncConfig(cfg: SyncConfig | null) {
    saveSyncConfig(cfg);
    setSyncCfg(cfg);
    remoteStampRef.current = null;
    setSyncStatus(cfg ? 'syncing' : 'off');
  }

  // 처음 연결됐을 때: 서버에 데이터가 있으면 내려받는다.
  useEffect(() => {
    if (!syncCfg) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemote(syncCfg);
        if (cancelled) return;
        if (remote) {
          applyRemote(remote.data, remote.updatedAt);
        } else {
          // 서버가 비어 있으면 지금 데이터를 올린다.
          remoteStampRef.current = await pushRemote(syncCfg, data);
        }
        setSyncStatus('ok');
      } catch {
        if (!cancelled) setSyncStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg]);

  // 로컬 변경 → 1.5초 디바운스 후 서버에 올리기
  useEffect(() => {
    if (!syncCfg) return;
    if (applyingRemoteRef.current) return;
    dirtyRef.current = true;
    const timer = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        remoteStampRef.current = await pushRemote(syncCfg, data);
        dirtyRef.current = false;
        setSyncStatus('ok');
      } catch {
        setSyncStatus('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, syncCfg]);

  // 8초마다 서버에 새 버전이 있는지 확인해서 내려받기
  useEffect(() => {
    if (!syncCfg) return;
    const interval = setInterval(async () => {
      try {
        const stamp = await fetchRemoteStamp(syncCfg);
        if (stamp && stamp !== remoteStampRef.current && !dirtyRef.current) {
          const remote = await fetchRemote(syncCfg);
          if (remote) applyRemote(remote.data, remote.updatedAt);
        }
        setSyncStatus((prev) => (prev === 'syncing' ? prev : 'ok'));
      } catch {
        setSyncStatus('error');
      }
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg]);

  return (
    <div className="app">
      <header className="topbar no-print">
        <h1>{data.settings.businessName} 급여</h1>
        <nav className="tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              className={`chip${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {syncStatus !== 'off' && (
          <span className={`sync-badge ${syncStatus}`} title="여러 컴퓨터 공유 상태">
            {syncStatus === 'ok' ? '공유중 ✓' : syncStatus === 'syncing' ? '저장중…' : '공유 오류'}
          </span>
        )}
        <button onClick={() => setSyncOpen(true)}>공유</button>
        <button onClick={() => setSettingsOpen(true)}>설정</button>
        <button onClick={() => setBackupOpen(true)}>백업</button>
      </header>

      {tab !== 'employees' && (
        <div className="toolbar no-print">
          <button onClick={() => setMonth((m) => addMonths(m, -1))}>◀ 이전 달</button>
          <span className="month-title">{monthTitle(month)}</span>
          <button onClick={() => setMonth((m) => addMonths(m, 1))}>다음 달 ▶</button>
          <button className="chip" onClick={() => setMonth(thisMonth())}>이번 달</button>
        </div>
      )}

      {saveError && <div className="banner danger no-print">{saveError}</div>}

      <main className="content">
        {tab === 'work' && <WorkTab data={data} month={month} update={update} />}
        {tab === 'payslip' && <PayslipTab data={data} month={month} update={update} />}
        {tab === 'employees' && <EmployeesTab data={data} update={update} />}
      </main>

      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          update={update}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {backupOpen && (
        <BackupModal data={data} update={update} onClose={() => setBackupOpen(false)} />
      )}
      {syncOpen && (
        <SyncModal
          data={data}
          syncCfg={syncCfg}
          syncStatus={syncStatus}
          onChangeSyncConfig={changeSyncConfig}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </div>
  );
}
