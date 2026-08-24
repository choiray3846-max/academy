import type {
  AcademyData,
  DateStr,
  ID,
  ItemKind,
  Occurrence,
  Role,
  Session,
} from '../types';
import { diffDays, eachDay, formatTimeKo, isBetween, timeToMinutes, weekdayOf } from './date';

const KIND_FALLBACK_COLOR: Record<ItemKind, string> = {
  class: '#2f6fed',
  event: '#7048e8',
  shift: '#0ca678',
  consult: '#d6336c',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  class: '수업',
  event: '행사',
  shift: '근무',
  consult: '상담',
};

export const EVENT_CATEGORY_LABEL = {
  exam: '시험',
  briefing: '설명회',
  holiday: '휴원',
  vacation: '특강·방학',
  etc: '기타',
} as const;

export const SHIFT_TYPE_LABEL = {
  work: '근무',
  off: '휴무',
  sub: '대강',
} as const;

export const CONSULT_STATUS_LABEL = {
  booked: '예약',
  done: '완료',
  canceled: '취소',
  noshow: '노쇼',
} as const;

/**
 * 수업 시간표 모듈 스위치.
 *
 * 이 학원의 수업은 '매주 같은 요일·같은 시각'인 일반적인 형태가 아니어서,
 * 실제 운영 방식을 확정할 때까지 달력에서 빼 둔다. 확장 로직(expandClasses)과
 * 휴원일 자동 휴강 처리는 그대로 남아 있으므로, 구조가 정해지면 이 값을
 * true로 바꾸고 수업 등록 화면만 붙이면 된다.
 */
export const CLASS_MODULE_ENABLED = false;

/** 지금 달력에서 실제로 다루는 항목 종류 */
export const ACTIVE_KINDS: ItemKind[] = CLASS_MODULE_ENABLED
  ? ['class', 'event', 'shift', 'consult']
  : ['event', 'shift', 'consult'];

/** 달력에 무엇을 보여 줄지 정하는 필터 */
export interface CalendarFilter {
  /** 선택된 지점. 빈 배열이면 전체 */
  branchIds: ID[];
  kinds: ItemKind[];
  /** 특정 강사만 보기 */
  teacherId?: ID;
  /** 제목·메모 검색어 */
  query: string;
  /** 휴강 처리된 수업도 표시할지 */
  showCanceled: boolean;
}

export const DEFAULT_FILTER: CalendarFilter = {
  branchIds: [],
  kinds: [...ACTIVE_KINDS],
  teacherId: undefined,
  query: '',
  showCanceled: true,
};

/** 역할별로 볼 수 있는 항목 종류 */
export function visibleKindsForRole(role: Role): ItemKind[] {
  const byRole: Record<Role, ItemKind[]> = {
    owner: ['class', 'event', 'shift', 'consult'],
    manager: ['class', 'event', 'shift', 'consult'],
    teacher: ['class', 'event', 'shift'],
    public: ['class', 'event'],
  };
  return byRole[role].filter((k) => ACTIVE_KINDS.includes(k));
}

/** 이 역할이 데이터를 고칠 수 있는지 */
export function canEdit(role: Role): boolean {
  return role === 'owner' || role === 'manager';
}

/** 이 역할이 지점·강사 등 기준 정보를 관리할 수 있는지 */
export function canManageMasterData(role: Role): boolean {
  return role === 'owner';
}

/** 해당 날짜·지점이 휴원일인지 확인하고, 휴원 사유를 돌려준다. */
function closureReasonFor(data: AcademyData, date: DateStr, branchId: ID | undefined): string | null {
  for (const ev of data.events) {
    if (ev.category !== 'holiday') continue;
    if (!isBetween(date, ev.startDate, ev.endDate)) continue;
    const appliesToAll = ev.branchIds.length === 0;
    if (appliesToAll || (branchId && ev.branchIds.includes(branchId))) {
      return ev.title;
    }
  }
  return null;
}

/** 정규 수업을 특정 날짜 범위 안의 개별 수업일로 펼친다. */
function expandClasses(data: AcademyData, from: DateStr, to: DateStr): Occurrence[] {
  const out: Occurrence[] = [];
  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  const roomById = new Map(data.rooms.map((r) => [r.id, r]));

  for (const c of data.classes) {
    if (c.archived) continue;
    const rangeStart = c.startDate > from ? c.startDate : from;
    const rangeEnd = c.endDate && c.endDate < to ? c.endDate : to;
    if (rangeStart > rangeEnd) continue;

    for (const date of eachDay(rangeStart, rangeEnd)) {
      if (!c.daysOfWeek.includes(weekdayOf(date))) continue;
      if (c.skipDates?.includes(date)) continue;

      const closure = closureReasonFor(data, date, c.branchId);
      const teacher = c.teacherId ? teacherById.get(c.teacherId) : undefined;
      const room = c.roomId ? roomById.get(c.roomId) : undefined;
      const branch = branchById.get(c.branchId);

      out.push({
        key: `class:${c.id}:${date}`,
        kind: 'class',
        sourceId: c.id,
        date,
        allDay: false,
        startTime: c.startTime,
        endTime: c.endTime,
        title: c.name,
        subtitle: [teacher?.name, room?.name].filter(Boolean).join(' · ') || undefined,
        branchId: c.branchId,
        teacherId: c.teacherId,
        color: c.color || branch?.color || KIND_FALLBACK_COLOR.class,
        canceled: closure ? true : undefined,
        cancelReason: closure ?? undefined,
        publicVisible: c.publicVisible !== false,
      });
    }
  }
  return out;
}

function expandEvents(data: AcademyData, from: DateStr, to: DateStr): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of data.events) {
    const rangeStart = ev.startDate > from ? ev.startDate : from;
    const rangeEnd = ev.endDate < to ? ev.endDate : to;
    if (rangeStart > rangeEnd) continue;

    const spanTotal = diffDays(ev.startDate, ev.endDate) + 1;
    for (const date of eachDay(rangeStart, rangeEnd)) {
      out.push({
        key: `event:${ev.id}:${date}`,
        kind: 'event',
        sourceId: ev.id,
        date,
        allDay: ev.allDay,
        startTime: ev.allDay ? undefined : ev.startTime,
        endTime: ev.allDay ? undefined : ev.endTime,
        title: ev.title,
        subtitle: EVENT_CATEGORY_LABEL[ev.category],
        branchIds: ev.branchIds,
        color: ev.category === 'holiday' ? '#e03131' : KIND_FALLBACK_COLOR.event,
        publicVisible: ev.publicVisible !== false,
        spanIndex: diffDays(ev.startDate, date) + 1,
        spanTotal,
      });
    }
  }
  return out;
}

function expandShifts(data: AcademyData, from: DateStr, to: DateStr): Occurrence[] {
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  return data.shifts
    .filter((s) => isBetween(s.date, from, to))
    .map((s) => {
      const teacher = teacherById.get(s.teacherId);
      const subFor = s.subForTeacherId ? teacherById.get(s.subForTeacherId) : undefined;
      // 연차 차감이 걸린 휴무는 '연차/반차'로 표시해 일반 휴무와 구분한다.
      const label =
        s.type === 'off' && s.leaveDays
          ? s.leaveDays === 0.25
            ? '반반차'
            : s.leaveDays === 0.5
              ? '반차'
              : '연차'
          : SHIFT_TYPE_LABEL[s.type];
      const color =
        s.type === 'off'
          ? s.leaveDays
            ? '#f08c00' // 연차·반차는 주황
            : '#868e96' // 일반 휴무는 회색
          : teacher?.color || KIND_FALLBACK_COLOR.shift;
      return {
        key: `shift:${s.id}`,
        kind: 'shift' as const,
        sourceId: s.id,
        date: s.date,
        allDay: !s.startTime,
        startTime: s.startTime,
        endTime: s.endTime,
        title: `${teacher?.name ?? '알 수 없는 직원'} ${label}`,
        subtitle: subFor ? `${subFor.name} 대신` : s.memo,
        branchId: s.branchId,
        teacherId: s.teacherId,
        color,
        publicVisible: false,
      };
    });
}

function expandConsultations(data: AcademyData, from: DateStr, to: DateStr): Occurrence[] {
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  return data.consultations
    .filter((k) => isBetween(k.date, from, to))
    .map((k) => {
      const counselor = k.counselorId ? teacherById.get(k.counselorId) : undefined;
      return {
        key: `consult:${k.id}`,
        kind: 'consult' as const,
        sourceId: k.id,
        date: k.date,
        allDay: false,
        startTime: k.startTime,
        endTime: k.endTime,
        title: `${k.studentName} 상담`,
        subtitle: [counselor?.name, CONSULT_STATUS_LABEL[k.status]].filter(Boolean).join(' · '),
        branchId: k.branchId,
        teacherId: k.counselorId,
        color: k.status === 'canceled' || k.status === 'noshow' ? '#adb5bd' : KIND_FALLBACK_COLOR.consult,
        canceled: k.status === 'canceled' || undefined,
        publicVisible: false,
      };
    });
}

/** 정렬: 종일 항목 먼저, 그다음 시작 시각 순 */
function sortOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const at = a.startTime ? timeToMinutes(a.startTime) : 0;
  const bt = b.startTime ? timeToMinutes(b.startTime) : 0;
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title, 'ko');
}

/** 한 항목이 특정 지점 필터에 걸리는지 */
function matchesBranch(occ: Occurrence, branchIds: ID[]): boolean {
  if (branchIds.length === 0) return true;
  // 전 지점 공통 행사(branchIds가 빈 배열)는 어떤 지점을 골라도 보인다.
  if (occ.branchIds) {
    return occ.branchIds.length === 0 || occ.branchIds.some((id) => branchIds.includes(id));
  }
  if (!occ.branchId) return true;
  return branchIds.includes(occ.branchId);
}

/**
 * 데이터 + 필터 + 역할을 받아 날짜 범위 안의 모든 항목을 펼쳐 준다.
 * 결과는 날짜(DateStr)별 배열로 묶어 돌려준다.
 */
export function buildOccurrences(
  data: AcademyData,
  from: DateStr,
  to: DateStr,
  filter: CalendarFilter,
  session: Session,
): Map<DateStr, Occurrence[]> {
  const allowedKinds = new Set(visibleKindsForRole(session.role));
  const wanted = new Set(filter.kinds.filter((k) => allowedKinds.has(k)));

  let all: Occurrence[] = [];
  if (wanted.has('class')) all = all.concat(expandClasses(data, from, to));
  if (wanted.has('event')) all = all.concat(expandEvents(data, from, to));
  if (wanted.has('shift')) all = all.concat(expandShifts(data, from, to));
  if (wanted.has('consult')) all = all.concat(expandConsultations(data, from, to));

  // 역할에 따른 강제 범위 제한
  let branchScope = filter.branchIds;
  if (session.role === 'manager' && session.branchId) {
    branchScope = [session.branchId];
  }

  const query = filter.query.trim().toLowerCase();

  const filtered = all.filter((occ) => {
    if (session.role === 'public' && !occ.publicVisible) return false;
    if (session.role === 'teacher' && session.teacherId) {
      // 강사는 본인 관련 항목과 지점 행사만 본다.
      const mine = occ.teacherId === session.teacherId;
      if (!mine && occ.kind !== 'event') return false;
    }
    if (!matchesBranch(occ, branchScope)) return false;
    if (filter.teacherId && occ.teacherId !== filter.teacherId) return false;
    if (!filter.showCanceled && occ.canceled) return false;
    if (query) {
      const haystack = `${occ.title} ${occ.subtitle ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const byDate = new Map<DateStr, Occurrence[]>();
  for (const occ of filtered) {
    const list = byDate.get(occ.date);
    if (list) list.push(occ);
    else byDate.set(occ.date, [occ]);
  }
  for (const list of byDate.values()) list.sort(sortOccurrences);
  return byDate;
}

/** 사람이 읽는 시간 표기 */
export function occurrenceTimeLabel(occ: Occurrence): string {
  if (occ.allDay || !occ.startTime) return '종일';
  if (!occ.endTime) return formatTimeKo(occ.startTime);
  return `${formatTimeKo(occ.startTime)} – ${formatTimeKo(occ.endTime)}`;
}

/* ------------------------------------------------------------------ */
/* 중복 검사                                                           */
/* ------------------------------------------------------------------ */

export type ConflictType = 'room' | 'teacher';

export interface Conflict {
  type: ConflictType;
  date: DateStr;
  /** 겹치는 두 항목 */
  a: Occurrence;
  b: Occurrence;
  /** 겹치는 대상 이름 (강의실명 또는 강사명) */
  subject: string;
}

/**
 * 같은 강의실 / 같은 강사가 같은 시간대에 두 군데 잡혀 있는 경우를 찾는다.
 * 휴강 처리된 수업과 종일 항목은 검사에서 제외한다.
 */
export function findConflicts(data: AcademyData, from: DateStr, to: DateStr): Conflict[] {
  const roomOf = new Map<ID, ID | undefined>(data.classes.map((c) => [c.id, c.roomId]));
  const roomName = new Map(data.rooms.map((r) => [r.id, r.name]));
  const teacherName = new Map(data.teachers.map((t) => [t.id, t.name]));

  const all = [
    ...expandClasses(data, from, to),
    ...expandConsultations(data, from, to),
  ].filter((o) => !o.canceled && !o.allDay && o.startTime && o.endTime);

  const byDate = new Map<DateStr, Occurrence[]>();
  for (const o of all) {
    const list = byDate.get(o.date);
    if (list) list.push(o);
    else byDate.set(o.date, [o]);
  }

  const conflicts: Conflict[] = [];
  for (const [date, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const aStart = timeToMinutes(a.startTime!);
        const aEnd = timeToMinutes(a.endTime!);
        const bStart = timeToMinutes(b.startTime!);
        const bEnd = timeToMinutes(b.endTime!);
        if (aStart >= bEnd || bStart >= aEnd) continue;

        const aRoom = a.kind === 'class' ? roomOf.get(a.sourceId) : undefined;
        const bRoom = b.kind === 'class' ? roomOf.get(b.sourceId) : undefined;
        if (aRoom && bRoom && aRoom === bRoom) {
          conflicts.push({ type: 'room', date, a, b, subject: roomName.get(aRoom) ?? '강의실' });
          continue;
        }
        if (a.teacherId && b.teacherId && a.teacherId === b.teacherId) {
          conflicts.push({
            type: 'teacher',
            date,
            a,
            b,
            subject: teacherName.get(a.teacherId) ?? '강사',
          });
        }
      }
    }
  }
  return conflicts.sort((x, y) => x.date.localeCompare(y.date));
}

/* ------------------------------------------------------------------ */
/* 연차 계산                                                           */
/* ------------------------------------------------------------------ */

/** 해당 연도에 이 직원이 사용한 연차 일수 합계 (반차 0.5 포함) */
export function leaveUsedInYear(data: AcademyData, teacherId: ID, year: number): number {
  const prefix = `${year}-`;
  let sum = 0;
  for (const s of data.shifts) {
    if (s.teacherId !== teacherId) continue;
    if (s.type !== 'off' || !s.leaveDays) continue;
    if (!s.date.startsWith(prefix)) continue;
    sum += s.leaveDays;
  }
  return sum;
}

/** 해당 연도에 이 직원이 사용한 연차 내역 (날짜순) */
export function leaveEntriesInYear(data: AcademyData, teacherId: ID, year: number) {
  const prefix = `${year}-`;
  return data.shifts
    .filter((s) => s.teacherId === teacherId && s.type === 'off' && s.leaveDays && s.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}
