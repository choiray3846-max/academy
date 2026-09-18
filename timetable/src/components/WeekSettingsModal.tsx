import { useState } from 'react';
import type { DaySetting, Settings, Student, Teacher, WeekBoard } from '../types';
import { BLOCKS_PER_DAY, DAYS_PER_WEEK, DAY_LABELS, BLOCK_NAMES, SUNDAY, compareStudents, slotKey } from '../types';
import { addDays, shortDate, weekTitle } from '../lib/date';
import { defaultTimesFor, isDayClosed, shownDays, timesFor, weekAvailability } from '../lib/board';
import { Modal } from './Modal';

interface WeekSettingsModalProps {
  week: WeekBoard;
  weekStart: string;
  settings: Settings;
  /** 요일 설정을 바꾼다. closed로 바꿀 때 그 날 배정이 있으면 비울지 물어본다. */
  onChange: (dayIndex: number, patch: Partial<DaySetting>) => void;
  onClearDay: (dayIndex: number) => void;
  students: Student[];
  teachers: Teacher[];
  /** 이번 주만 쓰는 가능 시간. undefined면 명단 기본값으로 되돌린다 */
  onSetAvailability: (personId: string, next: string[] | undefined) => void;
  onClose: () => void;
}

type Tab = 'days' | 'teachers' | 'students';

/**
 * 이번 주 운영 설정: 요일별 휴원·교시 시간 변경·메모.
 * 추석 연휴처럼 평소와 다르게 운영하는 주에 쓴다. 이 주에만 적용된다.
 */
export function WeekSettingsModal({
  week,
  weekStart,
  settings,
  onChange,
  onClearDay,
  students,
  teachers,
  onSetAvailability,
  onClose,
}: WeekSettingsModalProps) {
  const daySettings = week.daySettings ?? {};
  const [tab, setTab] = useState<Tab>('days');
  const changedCount = Object.keys(week.availability ?? {}).length;

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
      <div className="tabs">
        <button className={tab === 'days' ? 'active' : ''} onClick={() => setTab('days')}>요일·시간</button>
        <button className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>강사 가능 시간</button>
        <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>학생 가능 시간</button>
        {changedCount > 0 && <span className="tabs-note">이번 주 변경 {changedCount}명</span>}
      </div>
      {tab === 'days' && (
      <>
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
      </>
      )}
      {tab === 'teachers' && (
        <WeekAvailabilityTable
          kind="teacher"
          people={teachers.filter((t) => !t.archived)}
          week={week}
          settings={settings}
          onSet={onSetAvailability}
        />
      )}
      {tab === 'students' && (
        <WeekAvailabilityTable
          kind="student"
          people={[...students].filter((s) => !s.archived).sort(compareStudents)}
          week={week}
          settings={settings}
          onSet={onSetAvailability}
        />
      )}
    </Modal>
  );
}

interface WeekAvailabilityTableProps {
  kind: 'teacher' | 'student';
  people: Array<{ id: string; name: string; grade?: string; availability?: string[] }>;
  week: WeekBoard;
  settings: Settings;
  onSet: (personId: string, next: string[] | undefined) => void;
}

/**
 * 이번 주 가능 시간 표: 사람마다 요일별 A/B/C 칩을 눌러 켜고 끈다.
 * 명단의 기본 가능 시간에서 출발하고, 바꾼 사람만 이번 주 값으로 저장된다.
 */
function WeekAvailabilityTable({ kind, people, week, settings, onSet }: WeekAvailabilityTableProps) {
  const days = shownDays(week);
  const overrides = week.availability ?? {};
  const label = kind === 'teacher' ? '강사' : '학생';

  function toggle(person: WeekAvailabilityTableProps['people'][number], key: string) {
    const cur = new Set(weekAvailability(week, person));
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    onSet(person.id, [...cur].sort());
  }

  function clearDayForAll(d: number) {
    const keys = Array.from({ length: BLOCKS_PER_DAY }, (_, b) => slotKey(d, b));
    for (const p of people) {
      const cur = weekAvailability(week, p);
      const next = cur.filter((k) => !keys.includes(k));
      if (next.length !== cur.length) onSet(p.id, next);
    }
  }

  function resetAll() {
    if (!window.confirm(`${label} 전원의 이번 주 가능 시간을 명단 기본값으로 되돌릴까요?`)) return;
    for (const p of people) if (overrides[p.id]) onSet(p.id, undefined);
  }

  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        {label}마다 <b>이번 주에만</b> 가능한 요일·교시를 누릅니다. 명단의 기본 가능 시간에서 시작하며, 바꾼 사람은
        <span className="wa-changed">이번 주</span> 표시가 붙고 [기본] 버튼으로 되돌릴 수 있습니다. 휴원일은 회색으로 잠깁니다.
      </p>
      {people.length === 0 ? (
        <p className="hint">등록된 {label}이 없습니다. [명단·설정]에서 먼저 추가해 주세요.</p>
      ) : (
        <table className="wa-table">
          <thead>
            <tr>
              <th className="wa-name">{label}</th>
              {days.map((d) => {
                const closed = isDayClosed(week, d);
                const times = timesFor(week, settings, d);
                return (
                  <th key={d} className={closed ? 'wa-closed' : ''} title={times.map((t, b) => `${BLOCK_NAMES[b]} ${t}`).join('\n')}>
                    {DAY_LABELS[d]} <small>{shortDate(addDays(week.weekStart, d))}</small>
                    {closed ? (
                      <small className="wa-closed-tag">휴원</small>
                    ) : (
                      <button className="mini wa-clear" title="이 요일 전원 해제" onClick={() => clearDayForAll(d)}>
                        전원 해제
                      </button>
                    )}
                  </th>
                );
              })}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const set = new Set(weekAvailability(week, p));
              const changed = Boolean(overrides[p.id]);
              return (
                <tr key={p.id} className={changed ? 'changed' : ''}>
                  <td className="wa-name">
                    <b>{p.name}</b> {p.grade && <small>{p.grade}</small>}
                    {changed && <span className="wa-changed">이번 주</span>}
                  </td>
                  {days.map((d) => {
                    const closed = isDayClosed(week, d);
                    return (
                      <td key={d} className={closed ? 'wa-closed' : ''}>
                        <div className="wa-chips">
                          {BLOCK_NAMES.map((name, b) => {
                            const key = slotKey(d, b);
                            const on = set.has(key);
                            return (
                              <button
                                key={b}
                                className={`wa-chip${on ? ' on' : ''}`}
                                disabled={closed}
                                aria-pressed={on}
                                onClick={() => toggle(p, key)}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                  <td className="wa-actions">
                    {changed && (
                      <button className="mini" title="명단의 기본 가능 시간으로" onClick={() => onSet(p.id, undefined)}>
                        기본
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {Object.keys(overrides).some((id) => people.some((p) => p.id === id)) && (
        <p className="hint" style={{ textAlign: 'right' }}>
          <button className="mini" onClick={resetAll}>{label} 전원 기본으로</button>
        </p>
      )}
    </>
  );
}
