import { useEffect, useMemo, useState } from 'react';
import type { SeatAssign, TimetableData, WeekBoard } from './types';
import { DAY_LABELS } from './types';
import { addDays, mondayOf, shortDate, today, weekTitle } from './lib/date';
import { loadData, saveData } from './lib/storage';
import {
  emptyWeek,
  findConflicts,
  isWeekEmpty,
  studentWeekCounts,
  weekOf,
} from './lib/board';
import { autoFill, type FillResult } from './lib/autofill';
import { Modal } from './components/Modal';
import { DayGrid } from './components/DayGrid';
import { WeekPrint } from './components/WeekPrint';
import { RosterModal } from './components/RosterModal';

type View = 'edit' | 'week';

export default function App() {
  const [data, setData] = useState<TimetableData>(loadData);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today()));
  const [dayIndex, setDayIndex] = useState(() => {
    const dow = new Date().getDay();
    return dow === 0 ? 0 : dow - 1; // 일요일이면 월요일 판을 보여 준다
  });
  const [view, setView] = useState<View>('edit');
  const [rosterOpen, setRosterOpen] = useState(false);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const result = saveData(data);
    setSaveError(result.ok ? '' : result.error ?? '');
  }, [data]);

  function update(updater: (prev: TimetableData) => TimetableData) {
    setData((prev) => updater(prev));
  }

  const week: WeekBoard = useMemo(() => weekOf(data, weekStart), [data, weekStart]);
  const conflicts = useMemo(() => findConflicts(week), [week]);
  const counts = useMemo(() => studentWeekCounts(week), [week]);

  /** 현재 주 판을 수정한다. 판이 없으면 빈 판에서 시작한다. */
  function updateWeek(mutator: (draft: WeekBoard) => void) {
    update((prev) => {
      const draft = structuredClone(prev.weeks[weekStart] ?? emptyWeek(weekStart));
      mutator(draft);
      return { ...prev, weeks: { ...prev.weeks, [weekStart]: draft } };
    });
  }

  function setTeacher(blockIndex: number, groupIndex: number, teacherId: string | undefined) {
    updateWeek((draft) => {
      draft.days[dayIndex].blocks[blockIndex].groups[groupIndex].teacherId = teacherId;
    });
  }

  function setSeat(blockIndex: number, groupIndex: number, seatIndex: number, patch: Partial<SeatAssign>) {
    updateWeek((draft) => {
      const seat = draft.days[dayIndex].blocks[blockIndex].groups[groupIndex].seats[seatIndex];
      Object.assign(seat, patch);
      // 학생을 새로 고르면 기본 과목·기본 관리 담당을 채워 준다.
      if (patch.studentId) {
        const student = data.students.find((s) => s.id === patch.studentId);
        if (!seat.subject && student?.defaultSubject) seat.subject = student.defaultSubject;
        if (!seat.managerId && data.settings.defaultManagerId) seat.managerId = data.settings.defaultManagerId;
      }
      if (patch.studentId === undefined && 'studentId' in patch) {
        seat.subject = undefined;
        seat.managerId = undefined;
      }
    });
  }

  function clearSeat(blockIndex: number, groupIndex: number, seatIndex: number) {
    updateWeek((draft) => {
      draft.days[dayIndex].blocks[blockIndex].groups[groupIndex].seats[seatIndex] = {};
    });
  }

  function copyPreviousWeek() {
    const prevStart = addDays(weekStart, -7);
    const prevWeek = data.weeks[prevStart];
    if (!prevWeek || isWeekEmpty(prevWeek)) {
      window.alert('지난주 판이 비어 있어 가져올 내용이 없습니다.');
      return;
    }
    if (!isWeekEmpty(week) && !window.confirm('이번 주 판에 이미 내용이 있습니다. 지난주 내용으로 덮어쓸까요?')) {
      return;
    }
    update((prev) => ({
      ...prev,
      weeks: {
        ...prev.weeks,
        [weekStart]: { ...structuredClone(prevWeek), weekStart },
      },
    }));
  }

  function runAutoFill() {
    const targets = data.students.filter(
      (s) => !s.archived && (s.weeklyCount ?? 0) > 0 && (s.availability?.length ?? 0) > 0,
    );
    if (targets.length === 0) {
      window.alert(
        '자동 배치할 학생이 없습니다.\n[명단·설정 → 학생]에서 주 회차와 가능 시간을 입력해 주세요.\n강사도 [시간] 버튼으로 근무 가능 시간을 입력해야 합니다.',
      );
      return;
    }
    const result = autoFill(data, week);
    update((prev) => ({ ...prev, weeks: { ...prev.weeks, [weekStart]: result.week } }));
    setFillResult(result);
  }

  function clearThisWeek() {
    if (window.confirm('이번 주 판을 전부 비울까요?')) {
      update((prev) => ({ ...prev, weeks: { ...prev.weeks, [weekStart]: emptyWeek(weekStart) } }));
    }
  }

  /** 지정 강사 위반: must 관계가 있는 학생이 다른 강사 그룹에 앉아 있는 경우 */
  const prefViolations = useMemo(() => {
    const out: { studentName: string; teacherName: string; dayIndex: number; blockIndex: number }[] = [];
    const studentById = new Map(data.students.map((st) => [st.id, st]));
    const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
    week.days.forEach((day, d) => {
      day.blocks.forEach((block, b) => {
        for (const group of block.groups) {
          if (!group.teacherId) continue;
          for (const seat of group.seats) {
            if (!seat.studentId) continue;
            const st = studentById.get(seat.studentId);
            if (!st) continue;
            const mustIds = Object.entries(st.teacherPrefs ?? {})
              .filter(([, v]) => v === 'must')
              .map(([id]) => id);
            if (mustIds.length > 0 && !mustIds.includes(group.teacherId)) {
              out.push({
                studentName: st.name,
                teacherName: teacherById.get(group.teacherId)?.name ?? '?',
                dayIndex: d,
                blockIndex: b,
              });
            }
          }
        }
      });
    });
    return out;
  }, [week, data.students, data.teachers]);

  const dayConflicts = conflicts.filter((c) => c.dayIndex === dayIndex);
  const times = dayIndex === 5 ? data.settings.saturdayTimes : data.settings.weekdayTimes;

  /* 배정 현황: 이번 주에 한 번이라도 배정된 학생 + 회차 등록된 학생 */
  const summary = data.students
    .filter((s) => !s.archived && (counts.has(s.id) || s.weeklyCount))
    .map((s) => ({ student: s, count: counts.get(s.id) ?? 0 }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ko'));

  const conflictPeople = (list: typeof conflicts) =>
    list.map((c) => {
      const name =
        c.type === 'student'
          ? data.students.find((s) => s.id === c.personId)?.name
          : data.teachers.find((t) => t.id === c.personId)?.name;
      return { ...c, name: name ?? '?' };
    });

  return (
    <div className="app">
      <div className="topbar">
        <h1>{data.settings.academyName} 시간표</h1>
        <div className="spacer" />
        <button onClick={() => setRosterOpen(true)}>명단·설정</button>
        <button onClick={() => window.print()}>인쇄</button>
      </div>

      {saveError && <div className="banner error">⚠ {saveError}</div>}

      <div className="toolbar">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="지난주">◀</button>
        <button onClick={() => setWeekStart(mondayOf(today()))}>이번 주</button>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="다음주">▶</button>
        <div className="week-title">{weekTitle(weekStart)}</div>
        <div className="check-row" style={{ gap: 4 }}>
          <button className={`chip${view === 'edit' ? ' active' : ''}`} onClick={() => setView('edit')}>하루 편집</button>
          <button className={`chip${view === 'week' ? ' active' : ''}`} onClick={() => setView('week')}>주간 전체</button>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={runAutoFill}>자동 배치</button>
        <button onClick={copyPreviousWeek}>지난주 복사</button>
        <button className="danger-ghost" onClick={clearThisWeek}>판 비우기</button>
      </div>

      {prefViolations.length > 0 && (
        <div className="banner warn">
          ⚠ 지정 강사 위반 {prefViolations.length}건:{' '}
          {prefViolations
            .map(
              (v) =>
                `${DAY_LABELS[v.dayIndex]} ${['A', 'B', 'C'][v.blockIndex]}교시 ${v.studentName} → ${v.teacherName} (지정 강사 아님)`,
            )
            .join(' / ')}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="banner warn">
          ⚠ 겹침 {conflicts.length}건:{' '}
          {conflictPeople(conflicts)
            .map(
              (c) =>
                `${DAY_LABELS[c.dayIndex]} ${['A', 'B', 'C'][c.blockIndex]}교시 ${c.name}${
                  c.type === 'student' ? ` (좌석 ${c.positions.join('·')})` : ` (그룹 ${c.positions.join('·')})`
                }`,
            )
            .join(' / ')}
        </div>
      )}

      {view === 'edit' ? (
        <div className="main">
          <div className="edit-wrap">
            <div className="day-tabs">
              {DAY_LABELS.map((label, i) => {
                const hasConflict = conflicts.some((c) => c.dayIndex === i);
                return (
                  <button
                    key={i}
                    className={`day-tab${i === dayIndex ? ' active' : ''}${hasConflict ? ' has-dup' : ''}`}
                    onClick={() => setDayIndex(i)}
                  >
                    {label} <span className="tab-date">{shortDate(addDays(weekStart, i))}</span>
                  </button>
                );
              })}
            </div>
            <DayGrid
              day={week.days[dayIndex]}
              times={times}
              students={data.students}
              teachers={data.teachers}
              managers={data.managers}
              conflicts={dayConflicts}
              onSetTeacher={setTeacher}
              onSetSeat={setSeat}
              onClearSeat={clearSeat}
            />
          </div>
          <aside className="side-panel">
            <h3>이번 주 배정 현황</h3>
            {summary.length === 0 ? (
              <p className="hint">아직 배정된 학생이 없습니다. [명단·설정]에서 학생·강사를 등록한 뒤 좌석에 배정해 보세요.</p>
            ) : (
              <ul className="count-list">
                {summary.map(({ student, count }) => {
                  const target = student.weeklyCount;
                  const state =
                    target == null ? '' : count < target ? 'under' : count > target ? 'over' : 'ok';
                  return (
                    <li key={student.id} className={state}>
                      <span>{student.name} <small>({student.grade})</small></span>
                      <b>
                        {count}
                        {target != null && ` / ${target}`}회
                      </b>
                    </li>
                  );
                })}
              </ul>
            )}
            {summary.some(({ student }) => student.weeklyCount != null) && (
              <p className="hint">
                <span className="dot-under" /> 회차 미달 · <span className="dot-ok" /> 충족 · <span className="dot-over" /> 초과
              </p>
            )}
          </aside>
        </div>
      ) : (
        <div className="week-wrap">
          <WeekPrint
            week={week}
            weekdayTimes={data.settings.weekdayTimes}
            saturdayTimes={data.settings.saturdayTimes}
            students={data.students}
            teachers={data.teachers}
            managers={data.managers}
          />
        </div>
      )}

      {/* 인쇄 전용: 항상 주간 전체 표를 인쇄한다 */}
      <div className="print-only">
        <div className="print-header">
          <span className="ph-academy">{data.settings.academyName}</span>
          <span className="ph-week">{weekTitle(weekStart)} 시간표</span>
        </div>
        <WeekPrint
          week={week}
          weekdayTimes={data.settings.weekdayTimes}
          saturdayTimes={data.settings.saturdayTimes}
          students={data.students}
          teachers={data.teachers}
          managers={data.managers}
        />
      </div>

      {fillResult && (
        <Modal
          title="자동 배치 결과"
          onClose={() => setFillResult(null)}
          footer={<button className="primary" onClick={() => setFillResult(null)}>확인</button>}
        >
          <p style={{ margin: 0 }}>
            새로 배치한 세션: <b>{fillResult.placed}건</b>
            {fillResult.unplaced.length === 0 && fillResult.placed > 0 && ' — 모든 학생의 회차를 채웠습니다. ✓'}
          </p>
          {fillResult.unplaced.length > 0 && (
            <>
              <h4 style={{ margin: '6px 0 0' }}>회차를 못 채운 학생</h4>
              <ul className="fill-list">
                {fillResult.unplaced.map(({ student, missing, reason }) => (
                  <li key={student.id}>
                    <b>{student.name}</b> ({student.grade}) — {missing}회 부족 · {reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {fillResult.skipped.length > 0 && (
            <>
              <h4 style={{ margin: '6px 0 0' }}>자동 배치에서 빠진 학생</h4>
              <ul className="fill-list muted">
                {fillResult.skipped.map(({ student, reason }) => (
                  <li key={student.id}>{student.name} — {reason}</li>
                ))}
              </ul>
            </>
          )}
          <p className="hint">
            결과가 마음에 안 들면 자리를 직접 고치면 됩니다. 이미 배치된 내용은 자동 배치가 건드리지 않으니,
            중요한 자리는 먼저 손으로 놓고 [자동 배치]로 나머지를 채우는 방식도 좋습니다.
          </p>
        </Modal>
      )}
      {rosterOpen && (
        <RosterModal
          data={data}
          update={update}
          replaceAll={(next) => setData(next)}
          onClose={() => setRosterOpen(false)}
        />
      )}
    </div>
  );
}
