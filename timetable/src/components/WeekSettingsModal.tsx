import type { DaySetting, Settings, WeekBoard } from '../types';
import { DAYS_PER_WEEK, DAY_LABELS, BLOCK_NAMES, SUNDAY } from '../types';
import { addDays, shortDate, weekTitle } from '../lib/date';
import { defaultTimesFor, isDayClosed } from '../lib/board';
import { Modal } from './Modal';

interface WeekSettingsModalProps {
  week: WeekBoard;
  weekStart: string;
  settings: Settings;
  /** 요일 설정을 바꾼다. closed로 바꿀 때 그 날 배정이 있으면 비울지 물어본다. */
  onChange: (dayIndex: number, patch: Partial<DaySetting>) => void;
  onClearDay: (dayIndex: number) => void;
  onClose: () => void;
}

/**
 * 이번 주 운영 설정: 요일별 휴원·교시 시간 변경·메모.
 * 추석 연휴처럼 평소와 다르게 운영하는 주에 쓴다. 이 주에만 적용된다.
 */
export function WeekSettingsModal({ week, weekStart, settings, onChange, onClearDay, onClose }: WeekSettingsModalProps) {
  const daySettings = week.daySettings ?? {};

  function seatCount(d: number): number {
    return week.days[d].blocks.reduce(
      (n, block) => n + block.groups.reduce((m, g) => m + g.seats.filter((s) => s.studentId).length, 0),
      0,
    );
  }

  return (
    <Modal
      title={`이번 주 운영 설정 · ${weekTitle(weekStart, isDayClosed(week, SUNDAY) ? 5 : 6)}`}
      onClose={onClose}
      wide
      footer={<button className="primary" onClick={onClose}>완료</button>}
    >
      <p className="hint" style={{ marginTop: 0 }}>
        이 설정은 <b>이번 주에만</b> 적용됩니다. 휴원으로 표시한 날은 자동 배치에서 제외되고 화면·인쇄·엑셀에 휴원으로 표시됩니다.
        교시 시간을 바꾸면 그날만 다른 시간대로 운영합니다 (예: 연휴 중 토요일 시간대로).
        <br />
        <b>일요일</b>은 평소 휴원이라 숨겨져 있고, <b>운영</b>에 체크하면 이번 주에만 일요일 판이 열립니다 (기본 시간은 토요일 시간대).
      </p>
      <table className="ws-table">
        <thead>
          <tr>
            <th>요일</th>
            <th>휴원 / 운영</th>
            <th>메모</th>
            <th>{BLOCK_NAMES[0]}교시</th>
            <th>{BLOCK_NAMES[1]}교시</th>
            <th>{BLOCK_NAMES[2]}교시</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: DAYS_PER_WEEK }, (_, d) => {
            const ds = daySettings[d] ?? {};
            const baseTimes = defaultTimesFor(settings, d);
            const times = ds.times ?? baseTimes;
            const customized = Boolean(ds.times);
            const seats = seatCount(d);
            const closed = isDayClosed(week, d);
            const isSunday = d === SUNDAY;
            return (
              <tr key={d} className={closed ? 'closed' : ''}>
                <td className="ws-day">
                  <b>{DAY_LABELS[d]}</b> <small>{shortDate(addDays(weekStart, d))}</small>
                </td>
                <td>
                  <label className="ws-check">
                    <input
                      type="checkbox"
                      checked={isSunday ? !closed : closed}
                      onChange={(e) => {
                        const nextClosed = isSunday ? !e.target.checked : e.target.checked;
                        onChange(d, { closed: nextClosed });
                        if (nextClosed && seats > 0 && window.confirm(`${DAY_LABELS[d]}요일에 배정된 좌석 ${seats}개가 있습니다. 함께 비울까요?`)) {
                          onClearDay(d);
                        }
                      }}
                    />
                    {isSunday ? '운영' : '휴원'}
                  </label>
                </td>
                <td>
                  <input
                    value={ds.note ?? ''}
                    placeholder="예: 추석 연휴"
                    onChange={(e) => onChange(d, { note: e.target.value || undefined })}
                  />
                </td>
                {times.map((t, b) => (
                  <td key={b}>
                    <input
                      className={customized ? 'ws-custom' : ''}
                      value={t}
                      disabled={closed}
                      onChange={(e) => {
                        const next = [...times];
                        next[b] = e.target.value;
                        onChange(d, { times: next });
                      }}
                    />
                  </td>
                ))}
                <td className="ws-actions">
                  {!closed && (
                    <>
                      <button
                        className="mini"
                        title="토요일 시간대로"
                        onClick={() => onChange(d, { times: [...settings.saturdayTimes] })}
                      >
                        토요일 시간
                      </button>
                      {customized && (
                        <button className="mini" onClick={() => onChange(d, { times: undefined })}>
                          기본으로
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        시간 칸은 '5:00~6:30'처럼 적습니다. [토요일 시간]을 누르면 그날을 토요일 시간대로 바꿉니다.
      </p>
    </Modal>
  );
}
