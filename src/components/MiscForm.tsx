import { useState } from 'react';
import type { DateStr, MiscItem } from '../types';
import { Modal } from './Modal';
import { KindSwitcher } from './KindSwitcher';
import { newId } from '../lib/id';

interface MiscFormProps {
  /** 수정이면 기존 값, 새로 만들면 undefined */
  initial?: MiscItem;
  /** 다른 종류에서 옮겨 올 때 미리 채울 값 (새 항목 취급) */
  draft?: Partial<MiscItem>;
  defaultDate: DateStr;
  /** 종류 바꾸기 (수정 모드에서만 표시) */
  onChangeKind?: (kind: 'event' | 'shift' | 'consult' | 'misc') => void;
  onSave: (m: MiscItem) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

/** 행사·근무·상담 어디에도 안 들어가는 '기타' 항목 등록·수정 */
export function MiscForm({ initial, draft, defaultDate, onChangeKind, onSave, onDelete, onClose }: MiscFormProps) {
  const seed = initial ?? draft;
  const [title, setTitle] = useState(seed?.title ?? '');
  const [startDate, setStartDate] = useState(seed?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(seed?.endDate ?? seed?.startDate ?? defaultDate);
  const [allDay, setAllDay] = useState(seed?.allDay ?? true);
  const [startTime, setStartTime] = useState(seed?.startTime ?? '18:00');
  const [endTime, setEndTime] = useState(seed?.endTime ?? '20:00');
  const [publicVisible, setPublicVisible] = useState(seed?.publicVisible !== false);
  const [memo, setMemo] = useState(seed?.memo ?? '');
  const [error, setError] = useState('');

  function submit() {
    if (!title.trim()) return setError('제목을 입력해 주세요.');
    if (!startDate || !endDate) return setError('날짜를 입력해 주세요.');
    if (endDate < startDate) return setError('종료일이 시작일보다 빠릅니다.');
    if (!allDay && endTime <= startTime) return setError('종료 시각이 시작 시각보다 빠릅니다.');
    onSave({
      id: initial?.id ?? newId('x'),
      title: title.trim(),
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
      title={initial ? '기타 항목 수정' : '기타 항목 등록'}
      onClose={onClose}
      footer={
        <>
          {initial && onDelete && (
            <button
              className="danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm(`'${initial.title}' 항목을 삭제할까요?`)) {
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
      {initial && onChangeKind && <KindSwitcher current="misc" onChange={onChangeKind} />}
      <div className="field">
        <label>제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 교재 주문, 청소 점검" autoFocus />
      </div>
      <div className="field-row">
        <div className="field">
          <label>시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label>종료일</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="check-row">
        <label>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          종일
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
          <input type="checkbox" checked={publicVisible} onChange={(e) => setPublicVisible(e.target.checked)} />
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
