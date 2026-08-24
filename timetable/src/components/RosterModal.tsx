import { useRef, useState } from 'react';
import type { Manager, Student, Teacher, TimetableData } from '../types';
import { Modal } from './Modal';
import { AvailabilityEditor } from './AvailabilityEditor';
import { TeacherPrefEditor } from './TeacherPrefEditor';
import { newId } from '../lib/id';
import { exportToJson, importFromJson } from '../lib/storage';
import { today } from '../lib/date';

type Tab = 'students' | 'teachers' | 'managers' | 'settings' | 'backup';

interface RosterModalProps {
  data: TimetableData;
  update: (updater: (prev: TimetableData) => TimetableData) => void;
  replaceAll: (next: TimetableData) => void;
  onClose: () => void;
}

/** 학생·강사·관리 담당 명단과 설정, 백업을 관리한다. */
export function RosterModal({ data, update, replaceAll, onClose }: RosterModalProps) {
  const [tab, setTab] = useState<Tab>('students');
  const [message, setMessage] = useState('');
  /** 가능 시간 편집 대상: 학생 또는 강사 */
  const [availTarget, setAvailTarget] = useState<{ kind: 'student' | 'teacher'; id: string } | null>(null);
  /** 담당 강사 관계 편집 대상 학생 */
  const [prefTarget, setPrefTarget] = useState<string | null>(null);
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
                <input
                  value={s.defaultSubject ?? ''}
                  placeholder="기본 과목"
                  onChange={(e) => patchStudent(s.id, { defaultSubject: e.target.value })}
                  style={{ width: 80 }}
                />
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  주
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={s.weeklyCount ?? ''}
                    placeholder="-"
                    onChange={(e) =>
                      patchStudent(s.id, { weeklyCount: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                    style={{ width: 50 }}
                  />
                  회
                </label>
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
            '주 n회'는 등록 회차, '시간'은 올 수 있는 시간대입니다.
            둘 다 입력된 학생만 자동 배치 대상이 됩니다.
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
