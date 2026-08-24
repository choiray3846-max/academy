import { Modal } from './Modal';
import type { Student, Teacher } from '../types';

interface TeacherPrefEditorProps {
  student: Student;
  teachers: Teacher[];
  onChange: (next: Record<string, 'must' | 'prefer'> | undefined) => void;
  onClose: () => void;
}

/** 학생-강사 관계(무관/선호/지정) 편집 */
export function TeacherPrefEditor({ student, teachers, onChange, onClose }: TeacherPrefEditorProps) {
  const prefs = student.teacherPrefs ?? {};
  const active = teachers.filter((t) => !t.archived);
  const mustCount = Object.values(prefs).filter((v) => v === 'must').length;

  function setLevel(teacherId: string, level: '' | 'must' | 'prefer') {
    const next = { ...prefs };
    if (level === '') delete next[teacherId];
    else next[teacherId] = level;
    onChange(Object.keys(next).length ? next : undefined);
  }

  return (
    <Modal
      title={`${student.name} 담당 강사 설정`}
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>완료</button>}
    >
      {active.length === 0 ? (
        <p className="hint">먼저 강사를 등록해 주세요.</p>
      ) : (
        <div className="pref-list">
          {active.map((t) => (
            <div key={t.id} className="pref-item">
              <span className="pref-name">
                {t.name}
                {t.subject ? <small> ({t.subject})</small> : null}
              </span>
              <div className="pref-choices">
                {([['', '무관'], ['prefer', '선호'], ['must', '지정']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={`chip${(prefs[t.id] ?? '') === value ? ' active' : ''}${value === 'must' ? ' must' : ''}`}
                    onClick={() => setLevel(t.id, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint">
        <b>지정</b>: 이 학생은 지정한 강사에게만 배치됩니다 (여러 명 지정 시 그중 아무나).
        <br />
        <b>선호</b>: 자리가 있으면 이 강사에게 먼저 배치하고, 없으면 과목이 맞는 다른 강사에게 갑니다.
        {mustCount > 0 && (
          <>
            <br />
            <span style={{ color: 'var(--warn)' }}>
              현재 지정 {mustCount}명 — 지정 강사의 가능 시간이 좁으면 배치가 안 될 수 있습니다.
            </span>
          </>
        )}
      </p>
    </Modal>
  );
}
