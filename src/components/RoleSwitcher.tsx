import { useState } from 'react';
import type { Branch, Role, Session, Teacher } from '../types';
import { Modal } from './Modal';

interface RoleSwitcherProps {
  session: Session;
  branches: Branch[];
  teachers: Teacher[];
  adminPin: string;
  onChange: (s: Session) => void;
  onClose: () => void;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: '원장·본사',
  manager: '지점 관리자',
  teacher: '강사',
  public: '학부모·학생',
};

/**
 * 화면 모드 전환.
 *
 * 이 앱은 서버 없이 브라우저에 저장되므로 진짜 로그인은 아니고,
 * 데스크 컴퓨터·강사실 컴퓨터·안내 태블릿에서 각각 알맞은 화면만
 * 보이게 하는 용도다. 관리자 모드 전환 시 PIN을 설정해 둘 수 있다.
 */
export function RoleSwitcher({ session, branches, teachers, adminPin, onChange, onClose }: RoleSwitcherProps) {
  const [role, setRole] = useState<Role>(session.role);
  const [branchId, setBranchId] = useState(session.branchId ?? branches[0]?.id ?? '');
  const [teacherId, setTeacherId] = useState(session.teacherId ?? teachers[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const needsPin =
    adminPin !== '' &&
    (role === 'owner' || role === 'manager') &&
    session.role !== 'owner' &&
    session.role !== 'manager';

  function apply() {
    if (role === 'manager' && !branchId) return setError('지점을 선택해 주세요.');
    if (role === 'teacher' && !teacherId) return setError('강사를 선택해 주세요.');
    if (needsPin && pin !== adminPin) return setError('PIN이 일치하지 않습니다.');
    onChange({
      role,
      branchId: role === 'manager' ? branchId : undefined,
      teacherId: role === 'teacher' ? teacherId : undefined,
    });
    onClose();
  }

  return (
    <Modal
      title="화면 모드 전환"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={apply}>전환</button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label>모드</label>
        <div className="check-row">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${role === r ? ' active' : ''}`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {role === 'manager' && (
        <div className="field">
          <label>담당 지점</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.filter((b) => !b.archived).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      {role === 'teacher' && (
        <div className="field">
          <label>강사 선택</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {teachers.filter((t) => !t.archived).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      {needsPin && (
        <div className="field">
          <label>관리자 PIN</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="설정에서 정한 PIN"
          />
        </div>
      )}
      <p style={{ color: 'var(--text-3)', fontSize: 12, margin: 0 }}>
        학부모·학생 모드에서는 '공개 표시'로 지정된 행사·일정만 보이고, 등록·수정 버튼이 숨겨집니다.
        강사 모드에서는 본인의 근무·휴무와 지점 행사만 보입니다.
      </p>
    </Modal>
  );
}
