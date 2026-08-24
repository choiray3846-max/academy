import { useEffect, useState } from 'react';
import type { PayslipData } from './types';
import { addMonths, monthTitle, thisMonth } from './lib/date';
import { loadData, saveData } from './lib/storage';
import { EmployeesTab } from './components/EmployeesTab';
import { WorkTab } from './components/WorkTab';
import { PayslipTab } from './components/PayslipTab';
import { SettingsModal } from './components/SettingsModal';
import { BackupModal } from './components/BackupModal';

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
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const result = saveData(data);
    setSaveError(result.ok ? '' : result.error ?? '');
  }, [data]);

  function update(updater: (prev: PayslipData) => PayslipData) {
    setData((prev) => updater(prev));
  }

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
    </div>
  );
}
