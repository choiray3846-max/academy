import { useMemo } from 'react';
import type { DateStr, Occurrence, TimeStr } from '../types';
import {
  WEEKDAY_LABELS,
  addDays,
  fromDateStr,
  timeToMinutes,
  today,
} from '../lib/date';
import { holidayName } from '../lib/holidays';

interface WeekViewProps {
  /** 주 시작일 */
  weekStart: DateStr;
  dayStartTime: TimeStr;
  dayEndTime: TimeStr;
  occurrences: Map<DateStr, Occurrence[]>;
  onSelectDate: (d: DateStr) => void;
  onOpenOccurrence: (occ: Occurrence) => void;
}

const SLOT_HEIGHT = 48; // 1시간 = 48px (CSS와 맞춰야 함)

export function WeekView({
  weekStart,
  dayStartTime,
  dayEndTime,
  occurrences,
  onSelectDate,
  onOpenOccurrence,
}: WeekViewProps) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayStr = today();

  const startMin = timeToMinutes(dayStartTime);
  const endMin = Math.max(startMin + 60, timeToMinutes(dayEndTime));
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = startMin; m < endMin; m += 60) out.push(m);
    return out;
  }, [startMin, endMin]);

  /** 시간 겹침이 있으면 좌우로 나눠 그린다. */
  function layoutDay(list: Occurrence[]) {
    const timed = list.filter((o) => !o.allDay && o.startTime && o.endTime);
    const sorted = [...timed].sort(
      (a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!),
    );
    // 간단한 컬럼 배정: 겹치는 항목끼리 다른 컬럼으로.
    const cols: { end: number }[] = [];
    const placed = sorted.map((occ) => {
      const s = timeToMinutes(occ.startTime!);
      const e = Math.max(s + 20, timeToMinutes(occ.endTime!));
      let col = cols.findIndex((c) => c.end <= s);
      if (col === -1) {
        cols.push({ end: e });
        col = cols.length - 1;
      } else {
        cols[col].end = e;
      }
      return { occ, s, e, col };
    });
    const colCount = Math.max(1, cols.length);
    return { placed, colCount };
  }

  return (
    <div className="week-view">
      <div className="week-head">
        <div />
        {days.map((date) => {
          const d = fromDateStr(date);
          const holiday = holidayName(date);
          return (
            <button
              key={date}
              type="button"
              className={`cell${date === todayStr ? ' today' : ''}`}
              onClick={() => onSelectDate(date)}
              style={holiday || d.getDay() === 0 ? { color: 'var(--sun)' } : d.getDay() === 6 ? { color: 'var(--sat)' } : undefined}
            >
              {d.getMonth() + 1}/{d.getDate()} ({WEEKDAY_LABELS[d.getDay()]})
              {holiday && <div style={{ fontSize: 10, fontWeight: 400 }}>{holiday}</div>}
            </button>
          );
        })}
      </div>

      <div className="week-allday">
        <div className="label">종일</div>
        {days.map((date) => {
          const list = (occurrences.get(date) ?? []).filter((o) => o.allDay);
          return (
            <div key={date} className="cell">
              {list.map((occ) => (
                <span
                  key={occ.key}
                  className={`pill${occ.canceled ? ' canceled' : ''}`}
                  style={{ background: occ.color, cursor: 'pointer' }}
                  onClick={() => onOpenOccurrence(occ)}
                  title={occ.title}
                >
                  <span className="pill-title">{occ.title}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="week-body">
        <div className="week-grid">
          <div className="time-col">
            {hours.map((m) => (
              <div key={m} className="slot">
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((date) => {
            const list = occurrences.get(date) ?? [];
            const { placed, colCount } = layoutDay(list);
            return (
              <div key={date} className={`day-col${date === todayStr ? ' today' : ''}`}>
                {hours.map((m) => (
                  <div key={m} className="hour-line" />
                ))}
                {placed.map(({ occ, s, e, col }) => {
                  const top = ((s - startMin) / 60) * SLOT_HEIGHT;
                  const height = Math.max(18, ((e - s) / 60) * SLOT_HEIGHT - 2);
                  const width = 100 / colCount;
                  return (
                    <button
                      key={occ.key}
                      type="button"
                      className={`week-event${occ.canceled ? ' canceled' : ''}`}
                      style={{
                        top,
                        height,
                        left: `calc(${col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        background: occ.color,
                      }}
                      onClick={() => onOpenOccurrence(occ)}
                      title={`${occ.title}${occ.subtitle ? ` (${occ.subtitle})` : ''}`}
                    >
                      <div className="we-time">
                        {occ.startTime} – {occ.endTime}
                      </div>
                      <div>{occ.title}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
