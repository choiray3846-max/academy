import { useRef, useState } from 'react';
import type { Manager, Student, Teacher, TimetableData } from '../types';
import { studentEnrollments } from '../types';
import { EnrollmentEditor } from './EnrollmentEditor';
import { Modal } from './Modal';
import { AvailabilityEditor } from './AvailabilityEditor';
import { TeacherPrefEditor } from './TeacherPrefEditor';
import { newId } from '../lib/id';
import { exportToJson, importFromJson } from '../lib/storage';
import { fetchRemote, pushRemote, type SyncConfig } from '../lib/sync';
import { today } from '../lib/date';

type Tab = 'students' | 'teachers' | 'managers' | 'settings' | 'share' | 'backup';

interface RosterModalProps {
  data: TimetableData;
  update: (updater: (prev: TimetableData) => TimetableData) => void;
  replaceAll: (next: TimetableData) => void;
  syncCfg: SyncConfig | null;
  syncStatus: 'off' | 'ok' | 'syncing' | 'error';
  onChangeSyncConfig: (cfg: SyncConfig | null) => void;
  onClose: () => void;
}

/** 학생·강사·관리 담당 명단과 설정, 백업을 관리한다. */
export function RosterModal({
  data,
  update,
  replaceAll,
  syncCfg,
  syncStatus,
  onChangeSyncConfig,
  onClose,
}: RosterModalProps) {
  const [tab, setTab] = useState<Tab>('students');
  const [message, setMessage] = useState('');
  /* 공유 설정 입력 칸 */
  const [shareUrl, setShareUrl] = useState(syncCfg?.url ?? '');
  const [shareKey, setShareKey] = useState(syncCfg?.anonKey ?? '');
  const [shareRoom, setShareRoom] = useState(syncCfg?.roomId ?? '');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  /** 가능 시간 편집 대상: 학생 또는 강사 */
  const [availTarget, setAvailTarget] = useState<{ kind: 'student' | 'teacher'; id: string } | null>(null);
  /** 담당 강사 관계 편집 대상 학생 */
  const [prefTarget, setPrefTarget] = useState<string | null>(null);
  /** 과목·회차 편집 대상 학생 */
  const [enrollTarget, setEnrollTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* 명단에 있는 사람이 판에 배정돼 있는지 검사 */
  function studentUsed(id: string): boolean {
    return Object.values(data.weeks).some((w) =>
      w.days.some((d) => d.blocks.some((b) => b.groups.some((g) => g.seats.some((s) => s.studentId === id)))),
    );
  }
  function teacherUsed(id: string): boolean {
    return Object.values(data.weeks).some((w) =>
      w.days.some((d) => d.blocks.some((b) => b.groups.some((g) => g.teacherId === id))),
    );
  }
  function managerUsed(id: string): boolean {
    return Object.values(data.weeks).some((w) =>
      w.days.some((d) => d.blocks.some((b) => b.groups.some((g) => g.seats.some((s) => s.managerId === id)))),
    );
  }

  function addStudent() {
    const name = window.prompt('학생 이름을 입력하세요.');
    if (!name?.trim()) return;
    update((prev) => ({
      ...prev,
      students: [...prev.students, { id: newId('st'), name: name.trim(), grade: '' }],
    }));
  }
  function patchStudent(id: string, patch: Partial<Student>) {
    update((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }
  function removeStudent(s: Student) {
    if (studentUsed(s.id)) {
      window.alert(`'${s.name}' 학생이 시간표에 배정되어 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요.`);
      return;
    }
    if (window.confirm(`'${s.name}' 학생을 삭제할까요?`)) {
      update((prev) => ({ ...prev, students: prev.students.filter((x) => x.id !== s.id) }));
    }
  }

  function addTeacher() {
    const name = window.prompt('강사 이름을 입력하세요.');
    if (!name?.trim()) return;
    update((prev) => ({
      ...prev,
      teachers: [...prev.teachers, { id: newId('t'), name: name.trim() }],
    }));
  }
  function patchTeacher(id: string, patch: Partial<Teacher>) {
    update((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }
  function removeTeacher(t: Teacher) {
    if (teacherUsed(t.id)) {
      window.alert(`'${t.name}' 강사가 시간표에 배정되어 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요.`);
      return;
    }
    if (window.confirm(`'${t.name}' 강사를 삭제할까요?`)) {
      update((prev) => ({ ...prev, teachers: prev.teachers.filter((x) => x.id !== t.id) }));
    }
  }

  function addManager() {
    const name = window.prompt('관리 담당 이름을 입력하세요.');
    if (!name?.trim()) return;
    update((prev) => ({
      ...prev,
      managers: [...prev.managers, { id: newId('m'), name: name.trim() }],
    }));
  }
  function patchManager(id: string, patch: Partial<Manager>) {
    update((prev) => ({
      ...prev,
      managers: prev.managers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }
  function removeManager(m: Manager) {
    if (managerUsed(m.id)) {
      window.alert(`'${m.name}' 님이 시간표에 배정되어 있어 삭제할 수 없습니다.\n대신 '숨김' 처리해 주세요.`);
      return;
    }
    if (window.confirm(`'${m.name}' 님을 삭제할까요?`)) {
      update((prev) => ({ ...prev, managers: prev.managers.filter((x) => x.id !== m.id) }));
    }
  }

  function downloadBackup() {
    const blob = new Blob([exportToJson(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `시간표-백업-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('백업 파일을 내려받았습니다.');
  }

  function onImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importFromJson(String(reader.result));
        if (window.confirm('백업 파일의 내용으로 현재 데이터를 모두 교체합니다. 계속할까요?')) {
          replaceAll(next);
          setMessage('백업을 불러왔습니다.');
        }
      } catch (e) {
        setMessage(`불러오기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      }
    };
    reader.readAsText(file);
  }

  const inputStyle = { border: 'none', background: 'transparent', width: '100%', padding: 0 } as const;

  return (
    <Modal title="명단·설정" onClose={onClose} wide>
      <div className="tabs">
        <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>학생</button>
        <button className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>강사</button>
        <button className={tab === 'managers' ? 'active' : ''} onClick={() => setTab('managers')}>관리 담당</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>설정</button>
        <button className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>공유</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>백업</button>
      </div>

      {message && <div className="notice">{message}</div>}

      {tab === 'students' && (
        <>
          <div className="manage-list">
            {data.students.map((s) => (
              <div key={s.id} className="manage-item" style={{ opacity: s.archived ? 0.5 : 1 }}>
                <input
                  value={s.name}
                  onChange={(e) => patchStudent(s.id, { name: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 600, width: 90 }}
                />
                <input
                  value={s.grade}
                  placeholder="학년"
                  onChange={(e) => patchStudent(s.id, { grade: e.target.value })}
                  style={{ width: 60 }}
                />
                <button onClick={() => setEnrollTarget(s.id)}>
                  {studentEnrollments(s).filter((e) => e.weeklyCount > 0).length > 0
                    ? studentEnrollments(s)
                        .filter((e) => e.weeklyCount > 0)
                        .map((e) => `${e.subject || '과목?'} ${e.weeklyCount}회`)
                        .join(' · ')
                    : '과목·회차 입력'}
                </button>
                <button onClick={() => setAvailTarget({ kind: 'student', id: s.id })}>
                  시간 {s.availability?.length ?? 0}칸
                </button>
                <button onClick={() => setPrefTarget(s.id)}>
                  강사
                  {Object.values(s.teacherPrefs ?? {}).some((v) => v === 'must')
                    ? ' 지정'
                    : Object.keys(s.teacherPrefs ?? {}).length
                      ? ' 선호'
                      : ''}
                </button>
                <div className="grow" />
                <button onClick={() => patchStudent(s.id, { archived: !s.archived })}>
                  {s.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeStudent(s)}>삭제</button>
              </div>
            ))}
            {data.students.length === 0 && <div className="empty-note">아직 학생이 없습니다.</div>}
          </div>
          <button className="primary" onClick={addStudent}>+ 학생 추가</button>
          <p className="hint">
            과목·회차(예: 수학 3회 + 영어 1회)와 가능 시간이 모두 입력된 학생만 자동 배치 대상이 됩니다.
          </p>
        </>
      )}

      {tab === 'teachers' && (
        <>
          <div className="manage-list">
            {data.teachers.map((t) => (
              <div key={t.id} className="manage-item" style={{ opacity: t.archived ? 0.5 : 1 }}>
                <input
                  value={t.name}
                  onChange={(e) => patchTeacher(t.id, { name: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 600, width: 90 }}
                />
                <input
                  value={t.subject ?? ''}
                  placeholder="과목 (쉼표로 여러 개)"
                  onChange={(e) => patchTeacher(t.id, { subject: e.target.value })}
                  style={{ width: 140 }}
                />
                <button onClick={() => setAvailTarget({ kind: 'teacher', id: t.id })}>
                  시간 {t.availability?.length ?? 0}칸
                </button>
                <div className="grow" />
                <button onClick={() => patchTeacher(t.id, { archived: !t.archived })}>
                  {t.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeTeacher(t)}>삭제</button>
              </div>
            ))}
            {data.teachers.length === 0 && <div className="empty-note">아직 강사가 없습니다.</div>}
          </div>
          <button className="primary" onClick={addTeacher}>+ 강사 추가</button>
          <p className="hint">
            과목은 쉼표로 여러 개 적을 수 있습니다 (예: '수학, 물리').
            자동 배치는 그중 하나라도 학생 과목과 맞으면 배치합니다.
          </p>
        </>
      )}

      {tab === 'managers' && (
        <>
          <div className="manage-list">
            {data.managers.map((m) => (
              <div key={m.id} className="manage-item" style={{ opacity: m.archived ? 0.5 : 1 }}>
                <input
                  value={m.name}
                  onChange={(e) => patchManager(m.id, { name: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 600, width: 120 }}
                />
                <div className="grow" />
                <button onClick={() => patchManager(m.id, { archived: !m.archived })}>
                  {m.archived ? '숨김 해제' : '숨김'}
                </button>
                <button className="danger" onClick={() => removeManager(m)}>삭제</button>
              </div>
            ))}
            {data.managers.length === 0 && <div className="empty-note">아직 관리 담당이 없습니다.</div>}
          </div>
          <button className="primary" onClick={addManager}>+ 관리 담당 추가</button>
          <div className="field" style={{ marginTop: 10 }}>
            <label>학생 배정 시 기본 관리 담당</label>
            <select
              value={data.settings.defaultManagerId ?? ''}
              onChange={(e) =>
                update((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, defaultManagerId: e.target.value || undefined },
                }))
              }
            >
              <option value="">없음</option>
              {data.managers.filter((m) => !m.archived).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
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
            {(['weekdayTimes', 'saturdayTimes'] as const).map((key) => (
              <div className="field" key={key}>
                <label>{key === 'weekdayTimes' ? '평일 교시 시간' : '토요일 교시 시간'}</label>
                {data.settings[key].map((t, i) => (
                  <input
                    key={i}
                    value={t}
                    onChange={(e) =>
                      update((prev) => {
                        const next = [...prev.settings[key]];
                        next[i] = e.target.value;
                        return { ...prev, settings: { ...prev.settings, [key]: next } };
                      })
                    }
                    style={{ marginBottom: 4 }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="hint">시간은 표시용 텍스트입니다. 'A 5:00~6:30'처럼 인쇄물과 화면에 그대로 나옵니다.</p>
        </>
      )}

      {tab === 'share' && (
        <>
          {syncCfg ? (
            <div className="notice">
              현재 공유 중입니다 — 학원 코드 '<b>{syncCfg.roomId}</b>' · 상태:{' '}
              {syncStatus === 'ok' ? '정상 ✓' : syncStatus === 'syncing' ? '저장 중…' : '오류 (인터넷·설정 확인)'}
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-2)' }}>
              여러 컴퓨터에서 <b>같은 시간표를 실시간으로</b> 보고 편집하려면 무료 클라우드 저장소
              (Supabase)를 연결하세요. 한 번만 설정하면 됩니다.
            </p>
          )}

          <div className="field-col">
            <label>Supabase 프로젝트 URL</label>
            <input value={shareUrl} placeholder="https://xxxx.supabase.co" onChange={(e) => setShareUrl(e.target.value.trim())} />
            <label>anon 공개 키</label>
            <input value={shareKey} placeholder="eyJhbGci…" onChange={(e) => setShareKey(e.target.value.trim())} />
            <label>학원 코드 (같은 코드를 쓰는 기기끼리 공유됩니다)</label>
            <input value={shareRoom} placeholder="예: 우리학원-본원" onChange={(e) => setShareRoom(e.target.value.trim())} />
          </div>

          {shareMsg && <div className="notice">{shareMsg}</div>}

          <div className="btn-row">
            <button
              className="primary"
              disabled={shareBusy || !shareUrl || !shareKey || !shareRoom}
              onClick={async () => {
                setShareBusy(true);
                setShareMsg('');
                const cfg: SyncConfig = { url: shareUrl, anonKey: shareKey, roomId: shareRoom };
                try {
                  const remote = await fetchRemote(cfg);
                  if (remote) {
                    const useRemote = window.confirm(
                      '클라우드에 이미 이 학원 코드의 데이터가 있습니다.\n\n' +
                        '[확인] = 클라우드 데이터를 가져와서 씁니다 (이 컴퓨터의 현재 데이터는 대체됨)\n' +
                        '[취소] = 이 컴퓨터의 데이터를 클라우드에 올려 덮어씁니다',
                    );
                    if (!useRemote) await pushRemote(cfg, data);
                  } else {
                    await pushRemote(cfg, data);
                  }
                  onChangeSyncConfig(cfg);
                  setShareMsg('연결 완료! 이제 이 설정을 다른 컴퓨터에도 똑같이 입력하면 공유됩니다.');
                } catch (e) {
                  setShareMsg(
                    `연결 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}. URL·키와 테이블 생성(아래 안내)을 확인해 주세요.`,
                  );
                } finally {
                  setShareBusy(false);
                }
              }}
            >
              {shareBusy ? '연결 중…' : syncCfg ? '설정 다시 연결' : '연결하기'}
            </button>
            {syncCfg && (
              <button
                onClick={() => {
                  if (window.confirm('공유를 끊을까요? 이 컴퓨터의 데이터는 그대로 남습니다.')) {
                    onChangeSyncConfig(null);
                    setShareMsg('공유를 끊었습니다.');
                  }
                }}
              >
                공유 끊기
              </button>
            )}
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>처음 설정하는 방법 (5분, 무료)</summary>
            <ol className="setup-steps">
              <li>
                <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>에서 무료 가입 후
                <b> New project</b>를 만듭니다 (이름·DB 비밀번호는 아무거나).
              </li>
              <li>
                왼쪽 메뉴 <b>SQL Editor</b>에서 아래 내용을 붙여넣고 <b>Run</b>:
                <pre className="sql-box">{`create table boards (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table boards enable row level security;
create policy "open access" on boards
  for all using (true) with check (true);`}</pre>
              </li>
              <li>
                왼쪽 메뉴 <b>Project Settings → API</b>에서 <b>Project URL</b>과 <b>anon public</b> 키를 복사해
                위 칸에 붙여넣습니다.
              </li>
              <li>학원 코드는 마음대로 정하고 (예: 우리학원-본원), <b>[연결하기]</b>를 누릅니다.</li>
              <li>다른 컴퓨터에서도 같은 URL·키·학원 코드를 입력하면 같은 시간표를 공유합니다.</li>
            </ol>
            <p className="hint">
              주의: URL·키·학원 코드를 아는 사람은 누구나 이 데이터를 볼 수 있습니다.
              학원 내부에서만 공유하세요.
            </p>
          </details>
        </>
      )}

      {tab === 'backup' && (
        <>
          <p className="hint" style={{ fontSize: 13 }}>
            모든 데이터는 이 브라우저에만 저장됩니다. 다른 컴퓨터와 공유하거나 만일에 대비하려면 백업 파일을 보관하세요.
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
        </>
      )}
      {enrollTarget && (() => {
        const student = data.students.find((x) => x.id === enrollTarget);
        if (!student) return null;
        return (
          <EnrollmentEditor
            student={student}
            onChange={(next) =>
              patchStudent(enrollTarget, {
                enrollments: next,
                // 옛 필드는 혼동을 막기 위해 함께 비운다.
                defaultSubject: undefined,
                weeklyCount: undefined,
              })
            }
            onClose={() => setEnrollTarget(null)}
          />
        );
      })()}
      {prefTarget && (() => {
        const student = data.students.find((x) => x.id === prefTarget);
        if (!student) return null;
        return (
          <TeacherPrefEditor
            student={student}
            teachers={data.teachers}
            onChange={(next) => patchStudent(prefTarget, { teacherPrefs: next })}
            onClose={() => setPrefTarget(null)}
          />
        );
      })()}
      {availTarget && (() => {
        const person =
          availTarget.kind === 'student'
            ? data.students.find((x) => x.id === availTarget.id)
            : data.teachers.find((x) => x.id === availTarget.id);
        if (!person) return null;
        return (
          <AvailabilityEditor
            title={`${person.name} ${availTarget.kind === 'student' ? '가능 시간' : '근무 가능 시간'}`}
            value={person.availability ?? []}
            weekdayTimes={data.settings.weekdayTimes}
            saturdayTimes={data.settings.saturdayTimes}
            onChange={(next) =>
              availTarget.kind === 'student'
                ? patchStudent(availTarget.id, { availability: next })
                : patchTeacher(availTarget.id, { availability: next })
            }
            onClose={() => setAvailTarget(null)}
          />
        );
      })()}
    </Modal>
  );
}
