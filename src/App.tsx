import { useEffect, useMemo, useState } from 'react';
import type {
  AcademyEvent,
  Consultation,
  DateStr,
  ItemKind,
  Occurrence,
  Shift,
} from './types';
import { useAppStore } from './store/AppStore';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatMonthTitle,
  formatWeekTitle,
  overlaps,
  startOfMonth,
  startOfWeek,
  today,
} from './lib/date';
import {
  ACTIVE_KINDS,
  DEFAULT_FILTER,
  KIND_LABEL,
  buildOccurrences,
  canEdit,
  canManageMasterData,
  visibleKindsForRole,
  type CalendarFilter,
} from './lib/schedule';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { DayPanel } from './components/DayPanel';
import { EventForm } from './components/EventForm';
import { ShiftForm } from './components/ShiftForm';
import { ConsultForm } from './components/ConsultForm';
import { RoleSwitcher, ROLE_LABEL } from './components/RoleSwitcher';
import { ManageModal } from './components/ManageModal';

type ViewMode = 'month' | 'week';

type OpenModal =
  | { type: 'none' }
  | { type: 'role' }
  | { type: 'manage' }
  | { type: 'event'; initial?: AcademyEvent }
  | { type: 'shift'; initial?: Shift }
  | { type: 'consult'; initial?: Consultation };

export default function App() {
  const { data, update, replaceAll, session, setSession, saveError } = useAppStore();

  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<DateStr>(today());
  const [selectedDate, setSelectedDate] = useState<DateStr>(today());
  const [filter, setFilter] = useState<CalendarFilter>(DEFAULT_FILTER);
  const [modal, setModal] = useState<OpenModal>({ type: 'none' });

  // 테마 반영
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const pref = data.settings.theme;
      const dark =
        pref === 'dark' ||
        (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [data.settings.theme]);

  const weekStartsOn = data.settings.weekStartsOn;
  const editable = canEdit(session.role);
  const allowedKinds = visibleKindsForRole(session.role);

  // 보이는 날짜 범위 (월간 그리드는 앞뒤 달 일부 포함)
  const range = useMemo(() => {
    if (view === 'month') {
      const from = addDays(startOfWeek(startOfMonth(anchor), weekStartsOn), 0);
      const to = addDays(startOfWeek(endOfMonth(anchor), weekStartsOn), 6);
      return { from, to };
    }
    const from = startOfWeek(anchor, weekStartsOn);
    return { from, to: addDays(from, 6) };
  }, [view, anchor, weekStartsOn]);

  const occurrences = useMemo(
    () => buildOccurrences(data, range.from, range.to, filter, session),
    [data, range, filter, session],
  );

  const selectedList = useMemo(() => {
    if (occurrences.has(selectedDate)) return occurrences.get(selectedDate)!;
    // 선택한 날이 현재 표시 범위 밖이면 그 날만 따로 계산한다.
    const solo = buildOccurrences(data, selectedDate, selectedDate, filter, session);
    return solo.get(selectedDate) ?? [];
  }, [occurrences, selectedDate, data, filter, session]);

  /* ----- 이동 ----- */
  function go(delta: number) {
    setAnchor((prev) => (view === 'month' ? addMonths(prev, delta) : addDays(prev, delta * 7)));
  }
  function goToday() {
    setAnchor(today());
    setSelectedDate(today());
  }
  function selectDate(d: DateStr) {
    setSelectedDate(d);
    setAnchor(d);
  }

  /* ----- 저장/삭제 ----- */
  function saveEvent(ev: AcademyEvent) {
    update((prev) => {
      const exists = prev.events.some((x) => x.id === ev.id);
      return {
        ...prev,
        events: exists ? prev.events.map((x) => (x.id === ev.id ? ev : x)) : [...prev.events, ev],
      };
    });
  }
  function deleteEvent(id: string) {
    update((prev) => ({ ...prev, events: prev.events.filter((x) => x.id !== id) }));
  }
  function saveShift(s: Shift) {
    update((prev) => {
      const exists = prev.shifts.some((x) => x.id === s.id);
      return {
        ...prev,
        shifts: exists ? prev.shifts.map((x) => (x.id === s.id ? s : x)) : [...prev.shifts, s],
      };
    });
  }
  function deleteShift(id: string) {
    update((prev) => ({ ...prev, shifts: prev.shifts.filter((x) => x.id !== id) }));
  }
  function saveConsult(c: Consultation) {
    update((prev) => {
      const exists = prev.consultations.some((x) => x.id === c.id);
      return {
        ...prev,
        consultations: exists
          ? prev.consultations.map((x) => (x.id === c.id ? c : x))
          : [...prev.consultations, c],
      };
    });
  }
  function deleteConsult(id: string) {
    update((prev) => ({ ...prev, consultations: prev.consultations.filter((x) => x.id !== id) }));
  }

  /** 상담 겹침 검사: 같은 지점, 같은 날, 시간대가 겹치는 '예약' 상태 상담 */
  function findConsultClash(candidate: Consultation): Consultation | null {
    return (
      data.consultations.find(
        (k) =>
          k.id !== candidate.id &&
          k.branchId === candidate.branchId &&
          k.date === candidate.date &&
          k.status === 'booked' &&
          overlaps(k.startTime, k.endTime, candidate.startTime, candidate.endTime),
      ) ?? null
    );
  }

  /** 달력의 항목을 클릭하면 해당 원본을 수정 폼으로 연다. */
  function openOccurrence(occ: Occurrence) {
    setSelectedDate(occ.date);
    if (!editable) return;
    if (occ.kind === 'event') {
      const ev = data.events.find((x) => x.id === occ.sourceId);
      if (ev) setModal({ type: 'event', initial: ev });
    } else if (occ.kind === 'shift') {
      const s = data.shifts.find((x) => x.id === occ.sourceId);
      if (s) setModal({ type: 'shift', initial: s });
    } else if (occ.kind === 'consult') {
      const k = data.consultations.find((x) => x.id === occ.sourceId);
      if (k) setModal({ type: 'consult', initial: k });
    }
  }

  function toggleKind(kind: ItemKind) {
    setFilter((prev) => {
      const has = prev.kinds.includes(kind);
      return { ...prev, kinds: has ? prev.kinds.filter((k) => k !== kind) : [...prev.kinds, kind] };
    });
  }

  function toggleBranch(id: string) {
    setFilter((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(id)
        ? prev.branchIds.filter((b) => b !== id)
        : [...prev.branchIds, id],
    }));
  }

  const visibleBranches = data.branches.filter((b) => !b.archived);
  const roleTag =
    session.role === 'manager'
      ? data.branches.find((b) => b.id === session.branchId)?.name
      : session.role === 'teacher'
        ? data.teachers.find((t) => t.id === session.teacherId)?.name
        : undefined;

  return (
    <div className="app">
      <div className="topbar">
        <h1>{data.settings.academyName} 달력</h1>
        <button className="role-badge" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setModal({ type: 'role' })}>
          {ROLE_LABEL[session.role]}
          {roleTag ? ` · ${roleTag}` : ''}
        </button>
        <div className="spacer" />
        {canManageMasterData(session.role) && (
          <button onClick={() => setModal({ type: 'manage' })}>학원 관리</button>
        )}
        <button onClick={() => window.print()}>인쇄</button>
      </div>

      {saveError && <div className="banner error">⚠ {saveError}</div>}

      <div className="toolbar">
        <button onClick={() => go(-1)} aria-label="이전">◀</button>
        <button onClick={goToday}>오늘</button>
        <button onClick={() => go(1)} aria-label="다음">▶</button>
        <div className="month-title">
          {view === 'month'
            ? formatMonthTitle(anchor)
            : formatWeekTitle(startOfWeek(anchor, weekStartsOn))}
        </div>
        <div className="check-row" style={{ gap: 4 }}>
          <button className={`chip${view === 'month' ? ' active' : ''}`} onClick={() => setView('month')}>월</button>
          <button className={`chip${view === 'week' ? ' active' : ''}`} onClick={() => setView('week')}>주</button>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        {/* 지점 필터: 매니저 모드는 자기 지점 고정이므로 숨긴다 */}
        {session.role !== 'manager' && visibleBranches.length > 1 && (
          <div className="check-row" style={{ gap: 4 }}>
            <button
              className={`chip${filter.branchIds.length === 0 ? ' active' : ''}`}
              onClick={() => setFilter((prev) => ({ ...prev, branchIds: [] }))}
            >
              전 지점
            </button>
            {visibleBranches.map((b) => (
              <button
                key={b.id}
                className={`chip${filter.branchIds.includes(b.id) ? ' active' : ''}`}
                onClick={() => toggleBranch(b.id)}
              >
                <span className="dot" style={{ background: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
        )}
        {allowedKinds.length > 1 && (
          <div className="check-row" style={{ gap: 4 }}>
            {ACTIVE_KINDS.filter((k) => allowedKinds.includes(k)).map((k) => (
              <button
                key={k}
                className={`chip${filter.kinds.includes(k) ? ' active' : ''}`}
                onClick={() => toggleKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          placeholder="일정 검색"
          value={filter.query}
          onChange={(e) => setFilter((prev) => ({ ...prev, query: e.target.value }))}
          style={{ width: 130 }}
        />
      </div>

      <div className="main">
        <div className="calendar-wrap">
          {/* 인쇄할 때만 보이는 머리글: 학원명 + 연·월 + 지점 색 범례 */}
          <div className="print-header">
            <span className="ph-academy">{data.settings.academyName}</span>
            <span className="ph-month">
              {view === 'month'
                ? formatMonthTitle(anchor)
                : formatWeekTitle(startOfWeek(anchor, weekStartsOn))}
            </span>
            <span className="ph-legend">
              {(filter.branchIds.length > 0
                ? visibleBranches.filter((b) => filter.branchIds.includes(b.id))
                : visibleBranches
              ).map((b) => (
                <span key={b.id}>
                  <span className="dot" style={{ background: b.color }} />
                  {b.name}
                </span>
              ))}
              <span className="ph-note">빨강 = 휴원</span>
            </span>
          </div>
          {view === 'month' ? (
            <MonthView
              anchor={anchor}
              weekStartsOn={weekStartsOn}
              occurrences={occurrences}
              selectedDate={selectedDate}
              onSelectDate={selectDate}
              onOpenOccurrence={openOccurrence}
            />
          ) : (
            <WeekView
              weekStart={startOfWeek(anchor, weekStartsOn)}
              dayStartTime={data.settings.dayStartTime}
              dayEndTime={data.settings.dayEndTime}
              occurrences={occurrences}
              onSelectDate={selectDate}
              onOpenOccurrence={openOccurrence}
            />
          )}
        </div>
        <DayPanel
          date={selectedDate}
          occurrences={selectedList}
          role={session.role}
          onOpenOccurrence={openOccurrence}
          onAddEvent={() => setModal({ type: 'event' })}
          onAddShift={() => setModal({ type: 'shift' })}
          onAddConsult={() => setModal({ type: 'consult' })}
        />
      </div>

      {modal.type === 'role' && (
        <RoleSwitcher
          session={session}
          branches={data.branches}
          teachers={data.teachers}
          adminPin={data.settings.adminPin}
          onChange={setSession}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'manage' && (
        <ManageModal
          data={data}
          update={update}
          replaceAll={replaceAll}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'event' && (
        <EventForm
          initial={modal.initial}
          defaultDate={selectedDate}
          branches={visibleBranches}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'shift' && (
        <ShiftForm
          initial={modal.initial}
          defaultDate={selectedDate}
          teachers={data.teachers}
          branches={data.branches}
          onSave={saveShift}
          onDelete={deleteShift}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
      {modal.type === 'consult' && (
        <ConsultForm
          initial={modal.initial}
          defaultDate={selectedDate}
          branches={data.branches}
          teachers={data.teachers}
          findClash={findConsultClash}
          onSave={saveConsult}
          onDelete={deleteConsult}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
    </div>
  );
}
