import type { DateStr, Occurrence, Role } from '../types';
import { formatFullDate } from '../lib/date';
import { KIND_LABEL, canEdit, occurrenceTimeLabel } from '../lib/schedule';
import { holidayName } from '../lib/holidays';

interface DayPanelProps {
  date: DateStr;
  occurrences: Occurrence[];
  role: Role;
  onOpenOccurrence: (occ: Occurrence) => void;
  onAddEvent: () => void;
  onAddShift: () => void;
  onAddConsult: () => void;
}

/** 오른쪽에 붙는 '선택한 날짜' 상세 패널 */
export function DayPanel({
  date,
  occurrences,
  role,
  onOpenOccurrence,
  onAddEvent,
  onAddShift,
  onAddConsult,
}: DayPanelProps) {
  const holiday = holidayName(date);
  const editable = canEdit(role);

  return (
    <aside className="day-panel">
      <header>
        <h2>{formatFullDate(date)}</h2>
        {holiday && <span style={{ color: 'var(--sun)', fontSize: 12, fontWeight: 600 }}>{holiday}</span>}
      </header>
      <div className="list">
        {occurrences.length === 0 && <div className="empty">등록된 일정이 없습니다.</div>}
        {occurrences.map((occ) => (
          <button
            key={occ.key}
            type="button"
            className={`occ-card${occ.canceled ? ' canceled' : ''}`}
            style={{ borderLeftColor: occ.color }}
            onClick={() => onOpenOccurrence(occ)}
          >
            <div className="occ-top">
              <span className="badge" style={{ background: occ.color }}>
                {KIND_LABEL[occ.kind]}
              </span>
              <span>{occurrenceTimeLabel(occ)}</span>
              {occ.spanTotal && occ.spanTotal > 1 && (
                <span style={{ color: 'var(--text-3)' }}>
                  ({occ.spanIndex}/{occ.spanTotal}일차)
                </span>
              )}
            </div>
            <div className="occ-title">{occ.title}</div>
            {occ.subtitle && <div className="occ-sub">{occ.subtitle}</div>}
            {occ.canceled && occ.cancelReason && (
              <div className="occ-sub" style={{ color: 'var(--danger)' }}>
                휴강: {occ.cancelReason}
              </div>
            )}
          </button>
        ))}
      </div>
      {editable && (
        <footer>
          <button onClick={onAddEvent}>+ 행사·일정</button>
          <button onClick={onAddShift}>+ 근무·휴무</button>
          <button onClick={onAddConsult}>+ 상담 예약</button>
        </footer>
      )}
    </aside>
  );
}
