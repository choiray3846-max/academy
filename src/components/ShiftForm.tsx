import { useMemo, useState } from 'react';
import type { AcademyData, DateStr, Shift, ShiftType, Teacher } from '../types';
import { Modal } from './Modal';
import { SHIFT_TYPE_LABEL, leaveUsedInYear } from '../lib/schedule';
import { newId } from '../lib/id';

interface ShiftFormProps {
  initial?: Shift;
  defaultDate: DateStr;
  teachers: Teacher[];
  /** 연차 잔여 계산에 전체 근무 기록이 필요하다 */
  data: AcademyData;
  onSave: (s: Shift) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function ShiftForm({ initial, defaultDate, teachers, data, onSave, onDelete, onClose }: ShiftFormProps) {
  const activeTeachers = teachers.filter((t) => !t.archived);
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? activeTeachers[0]?.id ?? '');
  const [type, setType] = useState<ShiftType>(initial?.type ?? 'work');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [hasTime, setHasTime] = useState(Boolean(initial?.startTime));
  const [startTime, setStartTime] = useState(initial?.startTime ?? '14:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '22:00');
  const [subForTeacherId, setSubForTeacherId] = useState(initial?.subForTeacherId ?? '');
  // 휴무일 때 연차 차감 여부·일수. 새로 만들 땐 기본으로 연차 1일 차감.
  const [useLeave, setUseLeave] = useState(initial ? Boolean(initial.leaveDays) : true);
  const [leaveDays, setLeaveDays] = useState(initial?.leaveDays ?? 1);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [error, setError] = useState('');

  const teacher = activeTeachers.find((t) => t.id === teacherId);
  const year = Number((date || defaultDate).slice(0, 4));

  /** 이 폼에서 수정 중인 기록을 뺀 사용량 → 저장 후 잔여를 미리 보여 주기 위함 */
  const leaveInfo = useMemo(() => {
    if (!teacher) return null;
    let used = leaveUsedInYear(data, teacher.id, year);
    if (initial && initial.teacherId === teacher.id && initial.type === 'off' && initial.leaveDays
        && initial.date.startsWith(`${year}-`)) {
      used -= initial.leaveDays;
    }
    const total = teacher.annualLeaveTotal;
    return { used, total };
  }, [teacher, data, year, initial]);

  const willUse = type === 'off' && useLeave ? leaveDays : 0;
  const remainAfter =
    leaveInfo && leaveInfo.total != null ? leaveInfo.total - leaveInfo.used - willUse : null;

  function submit() {
    if (!teacherId) return setError('직원을 선택해 주세요.');
    if (!date) return setError('날짜를 입력해 주세요.');
    if (hasTime && endTime <= startTime) return setError('종료 시각이 시작 시각보다 빠릅니다.');
    if (type === 'sub' && subForTeacherId === teacherId)
      return setError('대강 대상과 담당 직원이 같습니다.');
    if (type === 'off' && useLeave && remainAfter != null && remainAfter < 0) {
      const ok = window.confirm(
        `저장하면 ${teacher?.name}님의 연차가 ${Math.abs(remainAfter)}일 초과됩니다.\n그래도 저장할까요?`,
      );
      if (!ok) return;
    }
    onSave({
      id: initial?.id ?? newId('s'),
      teacherId,
      type,
      date,
      startTime: hasTime ? startTime : undefined,
      endTime: hasTime ? endTime : undefined,
      subForTeacherId: type === 'sub' ? subForTeacherId || undefined : undefined,
      leaveDays: type === 'off' && useLeave ? leaveDays : undefined,
      memo: memo.trim() || undefined,
    });
    onClose();
  }

  return (
    <Modal
      title={initial ? '근무·휴무 수정' : '근무·휴무 등록'}
      onClose={onClose}
      footer={
        <>
          {initial && onDelete && (
            <button
              className="danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm('이 근무·휴무 기록을 삭제할까요?')) {
                  onDelete(initial.id);
                  onClose();
                }
              }}
            >
              삭제
            </button>
          )}
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={submit}>저장</button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="field-row">
        <div className="field">
          <label>직원</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">선택…</option>
            {activeTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.subject ? ` (${t.subject})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>구분</label>
          <select value={type} onChange={(e) => setType(e.target.value as ShiftType)}>
            {Object.entries(SHIFT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {type === 'sub' && (
        <div className="field">
          <label>누구 대신인가요?</label>
          <select value={subForTeacherId} onChange={(e) => setSubForTeacherId(e.target.value)}>
            <option value="">선택…</option>
            {activeTeachers
              .filter((t) => t.id !== teacherId)
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        </div>
      )}
      {type === 'off' && (
        <div className="leave-box">
          <div className="check-row">
            <label>
              <input type="checkbox" checked={useLeave} onChange={(e) => setUseLeave(e.target.checked)} />
              연차에서 차감
            </label>
            {useLeave && (
              <select value={leaveDays} onChange={(e) => setLeaveDays(Number(e.target.value))} style={{ width: 110 }}>
                <option value={1}>1일 (연차)</option>
                <option value={0.5}>0.5일 (반차)</option>
              </select>
            )}
          </div>
          {teacher && (
            leaveInfo?.total != null ? (
              <div className="leave-summary">
                {year}년 연차 {leaveInfo.total}일 중 {leaveInfo.used}일 사용
                {' → '}
                저장 후 잔여{' '}
                <b className={remainAfter != null && remainAfter < 0 ? 'over' : ''}>
                  {remainAfter}일
                </b>
              </div>
            ) : (
              <div className="leave-summary muted">
                {teacher.name}님의 연차 일수가 설정되어 있지 않습니다.
                [학원 관리 → 직원]에서 연차를 입력하면 잔여가 계산됩니다.
              </div>
            )
          )}
        </div>
      )}
      <div className="check-row">
        <label>
          <input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} />
          시간 지정 (해제하면 종일)
        </label>
      </div>
      {hasTime && (
        <div className="field-row">
          <div className="field">
            <label>시작</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>종료</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      )}
      <div className="field">
        <label>메모</label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
    </Modal>
  );
}
