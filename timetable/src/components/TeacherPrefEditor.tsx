import { Modal } from './Modal';
import type { Student, Teacher } from '../types';
import { prefsForSubject, studentEnrollments, teacherSubjects } from '../types';

interface TeacherPrefEditorProps {
  student: Student;
  teachers: Teacher[];
  onChange: (next: Student['subjectTeacherPrefs']) => void;
  onClose: () => void;
}

/**
 * 학생의 과목별 강사 관계(무관/선호/지정) 편집.
 * 예: 수학은 강두현 지정, 영어는 유수연 선호.
 */
export function TeacherPrefEditor({ student, teachers, onChange, onClose }: TeacherPrefEditorProps) {
  const active = teachers.filter((t) => !t.archived);
  const subjects = [...new Set(studentEnrollments(student).map((e) => e.subject.trim()))];

  function setLevel(subject: string, teacherId: string, level: '' | 'must' | 'prefer') {
    const current = { ...prefsForSubject(student, subject) };
    if (level === '') delete current[teacherId];
    else current[teacherId] = level;

    const next: NonNullable<Student['subjectTeacherPrefs']> = {};
    for (const subj of subjects) {
      const prefs = subj === subject ? current : prefsForSubject(student, subj);
      if (Object.keys(prefs).length > 0) next[subj] = prefs;
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  /** 이 과목을 가르칠 수 있는 강사만 보여 준다 (과목 미입력 강사는 항상 표시) */
  function teachersFor(subject: string): Teacher[] {
    return active.filter((t) => {
      const list = teacherSubjects(t);
      return list.length === 0 || subject === '' || list.includes(subject);
    });
  }

  return (
    <Modal
      title={`${student.name} 과목별 담당 강사`}
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>완료</button>}
    >
      {subjects.length === 0 ? (
        <p className="hint">먼저 [과목·회차 입력]에서 이 학생의 과목을 등록해 주세요.</p>
      ) : (
        subjects.map((subject) => {
          const list = teachersFor(subject);
          const prefs = prefsForSubject(student, subject);
          const mustCount = Object.values(prefs).filter((v) => v === 'must').length;
          return (
            <div key={subject || '(none)'} className="pref-subject">
              <h4 className="pref-subject-title">
                {subject || '과목 미지정'}
                {mustCount > 0 && <span className="pref-must-note"> · 지정 {mustCount}명</span>}
              </h4>
              {list.length === 0 ? (
                <p className="hint">이 과목을 가르치는 강사가 없습니다. [강사] 탭에서 과목을 확인해 주세요.</p>
              ) : (
                <div className="pref-list">
                  {list.map((t) => (
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
                            onClick={() => setLevel(subject, t.id, value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
      <p className="hint">
        <b>지정</b>: 그 과목은 지정한 강사에게만 배치됩니다. <b>선호</b>: 자리가 있으면 먼저 배치합니다.
        과목마다 다르게 설정할 수 있습니다 (예: 수학은 지정, 영어는 무관).
      </p>
    </Modal>
  );
}
