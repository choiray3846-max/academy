import { useRef, useState } from 'react';
import type { AcademyData, Teacher } from '../types';
import { Modal } from './Modal';
import { newId } from '../lib/id';
import { exportToJson, importFromJson } from '../lib/storage';
import { leaveEntriesInYear, leaveUsedInYear } from '../lib/schedule';
import { createEmptyData } from '../data/seed';
import { today } from '../lib/date';

type Tab = 'teachers' | 'leave' | 'settings' | 'backup';

interface ManageModalProps {
  data: AcademyData;
  update: (updater: (prev: AcademyData) => AcademyData) => void;
  replaceAll: (next: AcademyData) => void;
  onClose: () => void;
}

const PALETTE = ['#2f6fed', '#0e9f6e', '#d9480f', '#7048e8', '#d6336c', '#1c7ed6', '#e8590c', '#0ca678'];

/** 지점·강사·설정·백업을 한 모달에서 관리한다. (원장 모드 전용) */
export function ManageModal({ data, update, replaceAll, onClose }: ManageModalProps) {
  const [tab, setTab] = useState<Tab>('teachers');
  const [leaveYear, setLeaveYear] = useState(() => Number(today().slice(0, 4)));
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  /* ----- 직원 ----- */
  function addTeacher() {
    const name = window.prompt('새 직원 이름을 입력하세요.');
    if (!name?.trim()) return;
    update((prev) => ({
      ...prev,
      teachers: [
        ...prev.teachers,
        {
          id: newId('t'),
          name: name.trim(),
          branchIds: [],
          color: PALETTE[(prev.teachers.length + 3) % PALETTE.length],
          annualLeaveTotal: 15,
        },
      ],
    }));
  }

  function patchTeacher(id: string, patch: Partial<Teacher>) {
    update((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function removeTeacher(t: Teacher) {
    const used =
      data.shifts.some((s) => s.teacherId === t.id || s.subForTeacherId === t.id) ||
      data.consultations.some((k) => k.counselorId === t.id);
    if (used) {
      window.alert(
        `'${t.name}' 님에게 연결된 일정이 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요.`,
      );
      return;
    }
    if (!window.confirm(`'${t.name}' 님을 삭제할까요?`)) return;
    update((prev) => ({ ...prev, teachers: prev.teachers.filter((x) => x.id !== t.id) }));
  }

  /* ----- 백업 ----- */
  function downloadBackup() {
    const blob = new Blob([exportToJson(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `학원달력-백업-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('백업 파일을 내려받았습니다. 다른 컴퓨터에서 [불러오기]로 열면 됩니다.');
  }

  function onImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importFromJson(String(reader.result));
        if (
          window.confirm(
            '백업 파일의 내용으로 현재 데이터를 모두 교체합니다.\n(지금 브라우저에 있는 일정은 사라집니다) 계속할까요?',
          )
        ) {
          replaceAll(next);
          setMessage('백업을 불러왔습니다.');
        }
      } catch (e) {
        setMessage(`불러오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (
      window.confirm(
        '모든 지점·강사·일정 데이터를 지우고 빈 상태에서 새로 시작합니다.\n먼저 백업을 내려받아 두는 것을 권장합니다. 계속할까요?',
      )
    ) {
      replaceAll(createEmptyData());
      setMessage('초기화했습니다. 지점과 강사부터 등록해 주세요.');
    }
  }

  return (
    <Modal title="학원 관리" onClose={onClose} wide>
      <div className="tabs" style={{ margin: '-16px -18px 0', paddingTop: 0 }}>
        <button className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>직원</button>
        <button className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>연차 현황</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>설정</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>백업·초기화</button>
      </div>

      {message && (
        <div className="form-error" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {message}
        </div>
      )}

      {tab === 'teachers' && (
        <>
          <div className="manage-list">
            {data.teachers.map((t) => (
              <div key={t.id} className="manage-item" style={{ opacity: t.archived ? 0.5 : 1 }}>
                <input
                  type="color"
                  value={t.color ?? '#868e96'}
                  onChange={(e) => patchTeacher(t.id, { color: e.target.value })}
                  style={{ width: 34, height: 30, padding: 2 }}
                  title="강사 색"
                />
                <div className="grow">
                  <input
                    value={t.name}
                    onChange={(e) => patchTeacher(t.id, { name: e.target.value })}
                    style={{ border: 'none', background: 'transparent', fontWeight: 600, width: '100%', padding: 0 }}
                  />
                  <input
                    value={t.subject ?? ''}
                    placeholder="담당 과목"
                    onChange={(e) => patchTeacher(t.id, { subject: e.target.value })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-3)', width: '100%', padding: 0 }}
                  />
                </div>
                <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  연차
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={0.25}
                    value={t.annualLeaveTotal ?? ''}
                    placeholder="-"
                    onChange={(e) =>
                      patchTeacher(t.id, {
                        annualLeaveTotal: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    style={{ width: 62 }}
                  />
                  일/년
                </label>
                <button onClick={() => patchTeacher(t.id, { archived: !t.archived })}>
                  {t.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeTeacher(t)}>삭제</button>
              </div>
            ))}
            {data.teachers.length === 0 && (
              <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                아직 직원이 없습니다.
              </div>
            )}
          </div>
          <button className="primary" onClick={addTeacher}>+ 직원 추가</button>
        </>
      )}

      {tab === 'leave' && (
        <>
          <div className="check-row" style={{ justifyContent: 'center' }}>
            <button onClick={() => setLeaveYear((y) => y - 1)}>◀</button>
            <b style={{ fontSize: 15 }}>{leaveYear}년</b>
            <button onClick={() => setLeaveYear((y) => y + 1)}>▶</button>
          </div>
          <table className="leave-table">
            <thead>
              <tr>
                <th>직원</th>
                <th>총 연차</th>
                <th>사용</th>
                <th>잔여</th>
                <th>사용일</th>
              </tr>
            </thead>
            <tbody>
              {data.teachers.filter((t) => !t.archived).map((t) => {
                const used = leaveUsedInYear(data, t.id, leaveYear);
                const entries = leaveEntriesInYear(data, t.id, leaveYear);
                const remain = t.annualLeaveTotal != null ? t.annualLeaveTotal - used : null;
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="color-dot" style={{ background: t.color ?? '#868e96' }} />
                      {t.name}
                    </td>
                    <td>{t.annualLeaveTotal ?? <span className="muted">미설정</span>}</td>
                    <td>{used}</td>
                    <td>
                      {remain == null ? (
                        <span className="muted">-</span>
                      ) : (
                        <b className={remain < 0 ? 'over' : remain <= 2 ? 'low' : ''}>{remain}일</b>
                      )}
                    </td>
                    <td className="dates">
                      {entries.length === 0
                        ? <span className="muted">-</span>
                        : entries.map((e) => `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8, 10))}${e.leaveDays === 0.25 ? '(반반차)' : e.leaveDays === 0.5 ? '(반차)' : ''}`).join(', ')}
                    </td>
                  </tr>
                );
              })}
              {data.teachers.filter((t) => !t.archived).length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)' }}>등록된 직원이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            달력에서 [+ 근무·휴무]로 휴무를 등록할 때 '연차에서 차감'을 켜면 여기에 자동으로 집계됩니다.
            총 연차는 [직원] 탭에서 입력합니다.
          </p>
        </>
      )}

      {tab === 'settings' && (
        <>
          <div className="field">
            <label>학원 이름</label>
            <input
              value={data.settings.academyName}
              onChange={(e) =>
                update((prev) => ({ ...prev, settings: { ...prev.settings, academyName: e.target.value } }))
              }
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>주간 뷰 시작 시각</label>
              <input
                type="time"
                value={data.settings.dayStartTime}
                onChange={(e) =>
                  update((prev) => ({ ...prev, settings: { ...prev.settings, dayStartTime: e.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>주간 뷰 종료 시각</label>
              <input
                type="time"
                value={data.settings.dayEndTime}
                onChange={(e) =>
                  update((prev) => ({ ...prev, settings: { ...prev.settings, dayEndTime: e.target.value } }))
                }
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>주 시작 요일</label>
              <select
                value={data.settings.weekStartsOn}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, weekStartsOn: Number(e.target.value) as 0 | 1 },
                  }))
                }
              >
                <option value={0}>일요일</option>
                <option value={1}>월요일</option>
              </select>
            </div>
            <div className="field">
              <label>테마</label>
              <select
                value={data.settings.theme}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, theme: e.target.value as 'light' | 'dark' | 'system' },
                  }))
                }
              >
                <option value="system">시스템 따라가기</option>
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>관리자 PIN (선택)</label>
            <input
              type="password"
              value={data.settings.adminPin}
              placeholder="비워 두면 PIN 없이 모드 전환"
              onChange={(e) =>
                update((prev) => ({ ...prev, settings: { ...prev.settings, adminPin: e.target.value } }))
              }
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              안내 태블릿 등을 학부모 모드로 두고, 관리자 모드로 돌아올 때 PIN을 요구하게 합니다.
              (브라우저 저장 기반이므로 보안 장치가 아닌 실수 방지용입니다)
            </span>
          </div>
        </>
      )}

      {tab === 'backup' && (
        <>
          <p style={{ margin: 0, color: 'var(--text-2)' }}>
            이 달력의 모든 데이터는 <b>지금 쓰고 있는 이 브라우저에만</b> 저장됩니다.
            다른 컴퓨터와 공유하거나 만일에 대비하려면 백업 파일을 내려받아 보관하세요.
          </p>
          <div className="check-row">
            <button className="primary" onClick={downloadBackup}>백업 내려받기 (.json)</button>
            <button onClick={() => fileRef.current?.click()}>백업 불러오기…</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', width: '100%' }} />
          <p style={{ margin: 0, color: 'var(--text-2)' }}>
            예시 데이터를 지우고 우리 학원 정보로 새로 시작하려면:
          </p>
          <div>
            <button className="danger" onClick={resetAll}>전체 초기화</button>
          </div>
        </>
      )}
    </Modal>
  );
}
