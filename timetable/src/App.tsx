import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeatAssign, TimetableData, WeekBoard } from './types';
import { DAY_LABELS, MAX_SESSIONS_PER_DAY, studentEnrollments, teacherSubjects } from './types';
import { addDays, mondayOf, shortDate, today, weekTitle } from './lib/date';
import { loadData, saveData } from './lib/storage';
import {
  fetchRemote,
  fetchRemoteStamp,
  loadSyncConfig,
  pushRemote,
  saveSyncConfig,
  type SyncConfig,
} from './lib/sync';
import {
  emptyWeek,
  findConflicts,
  isWeekEmpty,
  studentSubjectWeekCounts,
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

  /* ----- 여러 컴퓨터 공유 (Supabase) ----- */
  const [syncCfg, setSyncCfg] = useState<SyncConfig | null>(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState<'off' | 'ok' | 'syncing' | 'error'>(
    loadSyncConfig() ? 'syncing' : 'off',
  );
  /** 우리가 마지막으로 알고 있는 서버 버전. 이 값과 다르면 새 데이터가 온 것 */
  const remoteStampRef = useRef<string | null>(null);
  /** 서버에서 받은 데이터를 적용하는 중이면 true → 다시 올리지 않는다 */
  const applyingRemoteRef = useRef(false);
  /** 아직 서버에 안 올라간 로컬 변경이 있는지 */
  const dirtyRef = useRef(false);

  useEffect(() => {
    const result = saveData(data);
    setSaveError(result.ok ? '' : result.error ?? '');
  }, [data]);

  function update(updater: (prev: TimetableData) => TimetableData) {
    setData((prev) => updater(prev));
  }

  function applyRemote(remoteData: TimetableData, stamp: string) {
    applyingRemoteRef.current = true;
    remoteStampRef.current = stamp;
    dirtyRef.current = false;
    setData(remoteData);
    // setData 반영 뒤 플래그를 풀어야 업로드 이펙트가 건너뛴다.
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }

  function changeSyncConfig(cfg: SyncConfig | null) {
    saveSyncConfig(cfg);
    setSyncCfg(cfg);
    remoteStampRef.current = null;
    setSyncStatus(cfg ? 'syncing' : 'off');
  }

  // 처음 연결됐을 때: 서버에 데이터가 있으면 내려받는다.
  useEffect(() => {
    if (!syncCfg) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemote(syncCfg);
        if (cancelled) return;
        if (remote) {
          applyRemote(remote.data, remote.updatedAt);
        } else {
          // 서버가 비어 있으면 지금 데이터를 올린다.
          remoteStampRef.current = await pushRemote(syncCfg, data);
        }
        setSyncStatus('ok');
      } catch {
        if (!cancelled) setSyncStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg]);

  // 로컬 변경 → 1.5초 디바운스 후 서버에 올리기
  useEffect(() => {
    if (!syncCfg) return;
    if (applyingRemoteRef.current) return;
    dirtyRef.current = true;
    const timer = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        remoteStampRef.current = await pushRemote(syncCfg, data);
        dirtyRef.current = false;
        setSyncStatus('ok');
      } catch {
        setSyncStatus('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, syncCfg]);

  // 8초마다 서버에 새 버전이 있는지 확인해서 내려받기
  useEffect(() => {
    if (!syncCfg) return;
    const interval = setInterval(async () => {
      try {
        const stamp = await fetchRemoteStamp(syncCfg);
        if (stamp && stamp !== remoteStampRef.current && !dirtyRef.current) {
          const remote = await fetchRemote(syncCfg);
          if (remote) applyRemote(remote.data, remote.updatedAt);
        }
        setSyncStatus((prev) => (prev === 'syncing' ? prev : 'ok'));
      } catch {
        setSyncStatus('error');
      }
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCfg]);

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
        const firstSubject = student ? studentEnrollments(student)[0]?.subject : undefined;
        if (!seat.subject && firstSubject) seat.subject = firstSubject;
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
      (s) =>
        !s.archived &&
        studentEnrollments(s).some((e) => e.weeklyCount > 0) &&
        (s.availability?.length ?? 0) > 0,
    );
    if (targets.length === 0) {
      window.alert(
        '자동 배치할 학생이 없습니다.\n[명단·설정 → 학생]에서 과목·회차와 가능 시간을 입력해 주세요.\n강사도 [시간] 버튼으로 근무 가능 시간을 입력해야 합니다.',
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
            // 지정 검사는 좌석의 과목 기준: 그 과목을 가르칠 수 있는 지정 강사가
            // 있을 때만 위반을 따진다 (수학 지정이 영어 수업까지 묶지 않도록).
            const seatSubject = seat.subject?.trim() ?? '';
            const canTeach = (id: string) => {
              const mt = teacherById.get(id);
              if (!mt) return false;
              const list = teacherSubjects(mt);
              return list.length === 0 || seatSubject === '' || list.includes(seatSubject);
            };
            const mustIds = Object.entries(st.teacherPrefs ?? {})
              .filter(([, v]) => v === 'must')
              .map(([id]) => id)
              .filter(canTeach);
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

  /** 하루 최대 횟수 초과: 한 학생이 같은 날 3교시 이상 앉아 있는 경우 */
  const dailyCapViolations = useMemo(() => {
    const out: { studentName: string; dayIndex: number; count: number }[] = [];
    const studentById = new Map(data.students.map((st) => [st.id, st]));
    week.days.forEach((day, d) => {
      const perStudent = new Map<string, number>();
      for (const block of day.blocks) {
        for (const group of block.groups) {
          for (const seat of group.seats) {
            if (seat.studentId) perStudent.set(seat.studentId, (perStudent.get(seat.studentId) ?? 0) + 1);
          }
        }
      }
      for (const [id, count] of perStudent) {
        if (count > MAX_SESSIONS_PER_DAY) {
          out.push({ studentName: studentById.get(id)?.name ?? '?', dayIndex: d, count });
        }
      }
    });
    return out;
  }, [week, data.students]);

  const dayConflicts = conflicts.filter((c) => c.dayIndex === dayIndex);
  const times = dayIndex === 5 ? data.settings.saturdayTimes : data.settings.weekdayTimes;

  /* 배정 현황: 학생×과목 단위. 이번 주에 배정됐거나 회차가 등록된 항목만 */
  const subjectCounts = useMemo(() => studentSubjectWeekCounts(week), [week]);
  const summary = data.students
    .filter((s) => !s.archived && (counts.has(s.id) || studentEnrollments(s).length > 0))
    .flatMap((s) => {
      const enrollments = studentEnrollments(s).filter((e) => e.weeklyCount > 0);
      if (enrollments.length === 0) {
        return [{ student: s, subject: '', count: counts.get(s.id) ?? 0, target: undefined as number | undefined }];
      }
      const firstSubject = enrollments[0].subject.trim();
      return enrollments.map((e) => {
        const subj = e.subject.trim();
        let count = subjectCounts.get(`${s.id}|${subj}`) ?? 0;
        // 과목이 비워진 좌석은 첫 번째 등록 과목으로 친다.
        if (subj === firstSubject) count += subjectCounts.get(`${s.id}|`) ?? 0;
        return { student: s, subject: subj, count, target: e.weeklyCount as number | undefined };
      });
    })
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
        {syncStatus !== 'off' && (
          <span className={`sync-badge ${syncStatus}`} title="여러 컴퓨터 공유 상태">
            {syncStatus === 'ok' ? '공유중 ✓' : syncStatus === 'syncing' ? '저장중…' : '공유 오류'}
          </span>
        )}
        <div className="spacer" />
        {import.meta.env.PROD && (
          <a className="app-link" href="../">달력 열기 ↗</a>
        )}
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

      {dailyCapViolations.length > 0 && (
        <div className="banner warn">
          ⚠ 하루 최대 {MAX_SESSIONS_PER_DAY}회 초과:{' '}
          {dailyCapViolations
            .map((v) => `${DAY_LABELS[v.dayIndex]} ${v.studentName} ${v.count}회`)
            .join(' / ')}
        </div>
      )}
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
                {summary.map(({ student, subject, count, target }) => {
                  const state =
                    target == null ? '' : count < target ? 'under' : count > target ? 'over' : 'ok';
                  return (
                    <li key={`${student.id}|${subject}`} className={state}>
                      <span>
                        {student.name} <small>({student.grade})</small>
                        {subject && <small className="subj"> {subject}</small>}
                      </span>
                      <b>
                        {count}
                        {target != null && ` / ${target}`}회
                      </b>
                    </li>
                  );
                })}
              </ul>
            )}
            {summary.some(({ target }) => target != null) && (
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
                {fillResult.unplaced.map(({ student, subject, missing, reason }) => (
                  <li key={`${student.id}|${subject}`}>
                    <b>{student.name}</b> ({student.grade}){subject && ` ${subject}`} — {missing}회 부족 · {reason}
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
          syncCfg={syncCfg}
          syncStatus={syncStatus}
          onChangeSyncConfig={changeSyncConfig}
          onClose={() => setRosterOpen(false)}
        />
      )}
    </div>
  );
}
