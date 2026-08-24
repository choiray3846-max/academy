import { useState } from 'react';
import type { AcademyEvent, Branch, DateStr, EventCategory } from '../types';
import { Modal } from './Modal';
import { EVENT_CATEGORY_LABEL } from '../lib/schedule';
import { newId } from '../lib/id';

interface EventFormProps {
  /** 수정이면 기존 값, 새로 만들면 undefined */
  initial?: AcademyEvent;
  defaultDate: DateStr;
  branches: Branch[];
  onSave: (ev: AcademyEvent) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function EventForm({ initial, defaultDate, branches, onSave, onDelete, onClose }: EventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? 'etc');
  const [branchIds, setBranchIds] = useState<string[]>(initial?.branchIds ?? []);
  const [startDate, setStartDate] = useState(initial?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(initial?.endDate ?? defaultDate);
  const [allDay, setAllDay] = useState(initial?.allDay ?? true);
  const [startTime, setStartTime] = useState(initial?.startTime ?? '18:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '20:00');
  const [publicVisible, setPublicVisible] = useState(initial?.publicVisible !== false);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [error, setError] = useState('');

  function toggleBranch(id: string) {
    setBranchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  }

  function submit() {
    if (!title.trim()) return setError('제목을 입력해 주세요.');
    if (!startDate || !endDate) return setError('날짜를 입력해 주세요.');
    if (endDate < startDate) return setError('종료일이 시작일보다 빠릅니다.');
    if (!allDay && endTime <= startTime) return setError('종료 시각이 시작 시각보다 빠릅니다.');
    onSave({
      id: initial?.id ?? newId('e'),
      title: title.trim(),
      category,
      branchIds,
      startDate,
      endDate,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      memo: memo.trim() || undefined,
      publicVisible,
    });
    onClose();
  }

  return (
    <Modal
      title={initial ? '행사·일정 수정' : '행사·일정 등록'}
      onClose={onClose}
      footer={
        <>
          {initial && onDelete && (
            <button
              className="danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm(`'${initial.title}' 일정을 삭제할까요?`)) {
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
      <div className="field">
        <label>제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 전 지점 모의고사"
          autoFocus
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>분류</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
            {Object.entries(EVENT_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {category === 'holiday' && (
        <div className="form-error" style={{ background: 'var(--today)', color: 'var(--warn)' }}>
          휴원 일정은 해당 지점의 이 날짜 일정 위에 표시되어 휴원임을 알립니다.
        </div>
      )}
      <div className="field">
        <label>대상 지점 (아무것도 선택하지 않으면 전 지점 공통)</label>
        <div className="check-row">
          {branches.map((b) => (
            <label key={b.id}>
              <input
                type="checkbox"
                checked={branchIds.includes(b.id)}
                onChange={() => toggleBranch(b.id)}
              />
              <span className="color-dot" style={{ background: b.color }} />
              {b.name}
            </label>
          ))}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>시작일</label>
          <input type="date" value={startDate} onChange={(e) => {
            setStartDate(e.target.value);
            if (endDate < e.target.value) setEndDate(e.target.value);
          }} />
        </div>
        <div className="field">
          <label>종료일</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="check-row">
        <label>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          종일 일정
        </label>
      </div>
      {!allDay && (
        <div className="field-row">
          <div className="field">
            <label>시작 시각</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>종료 시각</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      )}
      <div className="check-row">
        <label>
          <input
            type="checkbox"
            checked={publicVisible}
            onChange={(e) => setPublicVisible(e.target.checked)}
          />
          학부모·학생 화면에도 표시
        </label>
      </div>
      <div className="field">
        <label>메모</label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
    </Modal>
  );
}
