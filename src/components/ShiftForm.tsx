import { useState } from 'react';
import type { Branch, DateStr, Shift, ShiftType, Teacher } from '../types';
import { Modal } from './Modal';
import { SHIFT_TYPE_LABEL } from '../lib/schedule';
import { newId } from '../lib/id';

interface ShiftFormProps {
  initial?: Shift;
  defaultDate: DateStr;
  teachers: Teacher[];
  branches: Branch[];
  onSave: (s: Shift) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function ShiftForm({ initial, defaultDate, teachers, branches, onSave, onDelete, onClose }: ShiftFormProps) {
  const activeTeachers = teachers.filter((t) => !t.archived);
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? activeTeachers[0]?.id ?? '');
  const [type, setType] = useState<ShiftType>(initial?.type ?? 'work');
  const [branchId, setBranchId] = useState(initial?.branchId ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [hasTime, setHasTime] = useState(Boolean(initial?.startTime));
  const [startTime, setStartTime] = useState(initial?.startTime ?? '14:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '22:00');
  const [subForTeacherId, setSubForTeacherId] = useState(initial?.subForTeacherId ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [error, setError] = useState('');

  function submit() {
    if (!teacherId) return setError('강사를 선택해 주세요.');
    if (!date) return setError('날짜를 입력해 주세요.');
    if (hasTime && endTime <= startTime) return setError('종료 시각이 시작 시각보다 빠릅니다.');
    if (type === 'sub' && subForTeacherId === teacherId)
      return setError('대강 대상과 담당 강사가 같습니다.');
    onSave({
      id: initial?.id ?? newId('s'),
      teacherId,
      type,
      branchId: branchId || undefined,
      date,
      startTime: hasTime ? startTime : undefined,
      endTime: hasTime ? endTime : undefined,
      subForTeacherId: type === 'sub' ? subForTeacherId || undefined : undefined,
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
          <label>강사</label>
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
      <div className="field-row">
        <div className="field">
          <label>지점</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">지정 안 함</option>
            {branches.filter((b) => !b.archived).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
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
