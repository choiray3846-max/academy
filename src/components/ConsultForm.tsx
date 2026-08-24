import { useState } from 'react';
import type { Branch, Consultation, ConsultStatus, DateStr, Teacher } from '../types';
import { Modal } from './Modal';
import { CONSULT_STATUS_LABEL } from '../lib/schedule';
import { minutesToTime, timeToMinutes } from '../lib/date';
import { newId } from '../lib/id';

interface ConsultFormProps {
  initial?: Consultation;
  defaultDate: DateStr;
  branches: Branch[];
  teachers: Teacher[];
  /** 같은 지점·같은 시간대에 이미 잡힌 상담이 있는지 알려 주는 검사기 */
  findClash: (candidate: Consultation) => Consultation | null;
  onSave: (c: Consultation) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function ConsultForm({
  initial,
  defaultDate,
  branches,
  teachers,
  findClash,
  onSave,
  onDelete,
  onClose,
}: ConsultFormProps) {
  const activeBranches = branches.filter((b) => !b.archived);
  const [branchId, setBranchId] = useState(initial?.branchId ?? activeBranches[0]?.id ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initial?.startTime ?? '15:00');
  const [duration, setDuration] = useState(
    initial ? timeToMinutes(initial.endTime) - timeToMinutes(initial.startTime) : 40,
  );
  const [studentName, setStudentName] = useState(initial?.studentName ?? '');
  const [parentName, setParentName] = useState(initial?.parentName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [counselorId, setCounselorId] = useState(initial?.counselorId ?? '');
  const [status, setStatus] = useState<ConsultStatus>(initial?.status ?? 'booked');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [error, setError] = useState('');

  function submit() {
    if (!branchId) return setError('지점을 선택해 주세요.');
    if (!studentName.trim()) return setError('학생 이름을 입력해 주세요.');
    if (!date || !startTime) return setError('날짜와 시각을 입력해 주세요.');
    const candidate: Consultation = {
      id: initial?.id ?? newId('k'),
      branchId,
      date,
      startTime,
      endTime: minutesToTime(timeToMinutes(startTime) + duration),
      studentName: studentName.trim(),
      parentName: parentName.trim() || undefined,
      phone: phone.trim() || undefined,
      counselorId: counselorId || undefined,
      status,
      memo: memo.trim() || undefined,
    };
    const clash = findClash(candidate);
    if (clash && status === 'booked') {
      const ok = window.confirm(
        `같은 시간대에 이미 '${clash.studentName}' 상담이 잡혀 있습니다 (${clash.startTime}–${clash.endTime}).\n그래도 저장할까요?`,
      );
      if (!ok) return;
    }
    onSave(candidate);
    onClose();
  }

  return (
    <Modal
      title={initial ? '상담 예약 수정' : '상담 예약 등록'}
      onClose={onClose}
      footer={
        <>
          {initial && onDelete && (
            <button
              className="danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm(`'${initial.studentName}' 상담 예약을 삭제할까요?`)) {
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
          <label>지점</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {activeBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>상태</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ConsultStatus)}>
            {Object.entries(CONSULT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>시작 시각</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label>소요 시간</label>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={20}>20분</option>
            <option value={30}>30분</option>
            <option value={40}>40분</option>
            <option value={60}>1시간</option>
            <option value={90}>1시간 30분</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>학생 이름</label>
          <input value={studentName} onChange={(e) => setStudentName(e.target.value)} autoFocus={!initial} />
        </div>
        <div className="field">
          <label>학부모 이름</label>
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>연락처</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
        </div>
        <div className="field">
          <label>상담 담당</label>
          <select value={counselorId} onChange={(e) => setCounselorId(e.target.value)}>
            <option value="">미지정</option>
            {teachers.filter((t) => !t.archived).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>메모</label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="상담 주제, 특이사항 등" />
      </div>
    </Modal>
  );
}
