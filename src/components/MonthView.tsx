import { useMemo } from 'react';
import type { DateStr, Occurrence } from '../types';
import {
  WEEKDAY_LABELS,
  isSameMonth,
  monthGrid,
  today,
  weekdayOf,
} from '../lib/date';
import { holidayName } from '../lib/holidays';

interface MonthViewProps {
  anchor: DateStr;
  weekStartsOn: 0 | 1;
  occurrences: Map<DateStr, Occurrence[]>;
  selectedDate: DateStr;
  onSelectDate: (d: DateStr) => void;
  onOpenOccurrence: (occ: Occurrence) => void;
}

const MAX_PILLS = 4;

export function MonthView({
  anchor,
  weekStartsOn,
  occurrences,
  selectedDate,
  onSelectDate,
  onOpenOccurrence,
}: MonthViewProps) {
  const days = useMemo(() => monthGrid(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const todayStr = today();

  const headLabels = useMemo(() => {
    const base = [...WEEKDAY_LABELS];
    return weekStartsOn === 1 ? [...base.slice(1), base[0]] : base;
  }, [weekStartsOn]);

  return (
    <div className="month-grid" style={{ gridTemplateRows: `auto repeat(${days.length / 7}, 1fr)` }}>
      {headLabels.map((label) => (
        <div key={label} className="weekday-head">
          {label}
        </div>
      ))}
      {days.map((date) => {
        const list = occurrences.get(date) ?? [];
        const dow = weekdayOf(date);
        const holiday = holidayName(date);
        const classNames = ['day-cell'];
        if (!isSameMonth(date, anchor)) classNames.push('other-month');
        if (date === todayStr) classNames.push('today');
        const overflow = list.length - MAX_PILLS;
        return (
          <button
            key={date}
            type="button"
            className={classNames.join(' ')}
            onClick={() => onSelectDate(date)}
            style={date === selectedDate ? { outline: '2px solid var(--accent)', outlineOffset: -2 } : undefined}
          >
            <span className="day-head">
              <span className={`day-num ${dow === 0 || holiday ? 'sun' : dow === 6 ? 'sat' : ''}`}>
                {Number(date.slice(8))}
              </span>
              {holiday && <span className="holiday-name">{holiday}</span>}
            </span>
            {list.slice(0, MAX_PILLS).map((occ) => (
              <span
                key={occ.key}
                className={`pill${occ.canceled ? ' canceled' : ''}`}
                style={{ background: occ.color }}
                title={`${occ.title}${occ.subtitle ? ` (${occ.subtitle})` : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenOccurrence(occ);
                }}
              >
                {!occ.allDay && occ.startTime && (
                  <span className="pill-time">
                    {occ.startTime}
                    {occ.endTime ? `~${occ.endTime}` : ''}
                  </span>
                )}
                <span className="pill-title">{occ.title}</span>
              </span>
            ))}
            {overflow > 0 && <span className="more">+{overflow}개 더</span>}
          </button>
        );
      })}
    </div>
  );
}
