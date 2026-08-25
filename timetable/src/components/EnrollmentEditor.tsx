import { Modal } from './Modal';
import type { Enrollment, Student } from '../types';
import { studentEnrollments } from '../types';

interface EnrollmentEditorProps {
  student: Student;
  onChange: (next: Enrollment[]) => void;
  onClose: () => void;
}

/** 학생의 과목별 등록(과목 + 주 회차) 편집. 예: 수학 3회, 영어 1회 */
export function EnrollmentEditor({ student, onChange, onClose }: EnrollmentEditorProps) {
  const list = studentEnrollments(student);

  function patch(index: number, patchValue: Partial<Enrollment>) {
    onChange(list.map((e, i) => (i === index ? { ...e, ...patchValue } : e)));
  }
  function add() {
    onChange([...list, { subject: '', weeklyCount: 1 }]);
  }
  function remove(index: number) {
    onChange(list.filter((_, i) => i !== index));
  }

  return (
    <Modal
      title={`${student.name} 과목·회차`}
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>완료</button>}
    >
      <div className="enroll-list">
        {list.map((e, i) => (
          <div key={i} className="enroll-item">
            <input
              value={e.subject}
              placeholder="과목 (예: 수학)"
              onChange={(ev) => patch(i, { subject: ev.target.value })}
              autoFocus={i === list.length - 1 && e.subject === ''}
            />
            <label>
              주
              <input
                type="number"
                min={0}
                max={12}
                value={e.weeklyCount}
                onChange={(ev) => patch(i, { weeklyCount: Number(ev.target.value) })}
                style={{ width: 56 }}
              />
              회
            </label>
            <button className="danger" onClick={() => remove(i)}>삭제</button>
          </div>
        ))}
        {list.length === 0 && <div className="empty-note">등록된 과목이 없습니다.</div>}
      </div>
      <button onClick={add}>+ 과목 추가</button>
      <p className="hint">
        과목 이름은 강사의 과목과 똑같이 적어야 자동 배치가 연결합니다 (예: 둘 다 '수학').
        하루 최대 2회 제한은 과목 합산 기준입니다.
      </p>
    </Modal>
  );
}
