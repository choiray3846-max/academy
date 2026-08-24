import { useRef, useState } from 'react';
import type { AcademyData, Branch, Teacher } from '../types';
import { Modal } from './Modal';
import { newId } from '../lib/id';
import { exportToJson, importFromJson } from '../lib/storage';
import { createEmptyData } from '../data/seed';
import { today } from '../lib/date';

type Tab = 'branches' | 'teachers' | 'settings' | 'backup';

interface ManageModalProps {
  data: AcademyData;
  update: (updater: (prev: AcademyData) => AcademyData) => void;
  replaceAll: (next: AcademyData) => void;
  onClose: () => void;
}

const PALETTE = ['#2f6fed', '#0e9f6e', '#d9480f', '#7048e8', '#d6336c', '#1c7ed6', '#e8590c', '#0ca678'];

/** 지점·강사·설정·백업을 한 모달에서 관리한다. (원장 모드 전용) */
export function ManageModal({ data, update, replaceAll, onClose }: ManageModalProps) {
  const [tab, setTab] = useState<Tab>('branches');
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  /* ----- 지점 ----- */
  function addBranch() {
    const name = window.prompt('새 지점 이름을 입력하세요.');
    if (!name?.trim()) return;
    update((prev) => ({
      ...prev,
      branches: [
        ...prev.branches,
        {
          id: newId('b'),
          name: name.trim(),
          color: PALETTE[prev.branches.length % PALETTE.length],
        },
      ],
    }));
  }

  function patchBranch(id: string, patch: Partial<Branch>) {
    update((prev) => ({
      ...prev,
      branches: prev.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  function removeBranch(b: Branch) {
    const used =
      data.events.some((e) => e.branchIds.includes(b.id)) ||
      data.consultations.some((k) => k.branchId === b.id) ||
      data.shifts.some((s) => s.branchId === b.id);
    if (used) {
      window.alert(
        `'${b.name}' 지점에 연결된 일정이 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요. (기존 일정은 유지됩니다)`,
      );
      return;
    }
    if (!window.confirm(`'${b.name}' 지점을 삭제할까요?`)) return;
    update((prev) => ({ ...prev, branches: prev.branches.filter((x) => x.id !== b.id) }));
  }

  /* ----- 강사 ----- */
  function addTeacher() {
    const name = window.prompt('새 강사 이름을 입력하세요.');
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
        `'${t.name}' 강사에게 연결된 일정이 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요.`,
      );
      return;
    }
    if (!window.confirm(`'${t.name}' 강사를 삭제할까요?`)) return;
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
        <button className={tab === 'branches' ? 'active' : ''} onClick={() => setTab('branches')}>지점</button>
        <button className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>강사</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>설정</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>백업·초기화</button>
      </div>

      {message && (
        <div className="form-error" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {message}
        </div>
      )}

      {tab === 'branches' && (
        <>
          <div className="manage-list">
            {data.branches.map((b) => (
              <div key={b.id} className="manage-item" style={{ opacity: b.archived ? 0.5 : 1 }}>
                <input
                  type="color"
                  value={b.color}
                  onChange={(e) => patchBranch(b.id, { color: e.target.value })}
                  style={{ width: 34, height: 30, padding: 2 }}
                  title="지점 색"
                />
                <div className="grow">
                  <input
                    className="name"
                    value={b.name}
                    onChange={(e) => patchBranch(b.id, { name: e.target.value })}
                    style={{ border: 'none', background: 'transparent', fontWeight: 600, width: '100%', padding: 0 }}
                  />
                  <input
                    value={b.phone ?? ''}
                    placeholder="전화번호"
                    onChange={(e) => patchBranch(b.id, { phone: e.target.value })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-3)', width: '100%', padding: 0 }}
                  />
                </div>
                <button onClick={() => patchBranch(b.id, { archived: !b.archived })}>
                  {b.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeBranch(b)}>삭제</button>
              </div>
            ))}
            {data.branches.length === 0 && (
              <div className="empty" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                아직 지점이 없습니다.
              </div>
            )}
          </div>
          <button className="primary" onClick={addBranch}>+ 지점 추가</button>
        </>
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
                <div className="check-row" style={{ fontSize: 12 }}>
                  {data.branches.filter((b) => !b.archived).map((b) => (
                    <label key={b.id}>
                      <input
                        type="checkbox"
                        checked={t.branchIds.includes(b.id)}
                        onChange={(e) =>
                          patchTeacher(t.id, {
                            branchIds: e.target.checked
                              ? [...t.branchIds, b.id]
                              : t.branchIds.filter((x) => x !== b.id),
                          })
                        }
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
                <button onClick={() => patchTeacher(t.id, { archived: !t.archived })}>
                  {t.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeTeacher(t)}>삭제</button>
              </div>
            ))}
            {data.teachers.length === 0 && (
              <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                아직 강사가 없습니다.
              </div>
            )}
          </div>
          <button className="primary" onClick={addTeacher}>+ 강사 추가</button>
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
