import type {
  BlockBoard,
  DayBoard,
  ID,
  Settings,
  TimetableData,
  WeekBoard,
} from '../types';
import {
  BLOCKS_PER_DAY,
  DAYS_PER_WEEK,
  GROUPS_PER_BLOCK,
  SEATS_PER_GROUP,
  SUNDAY,
} from '../types';

export function emptyBlock(): BlockBoard {
  return {
    groups: Array.from({ length: GROUPS_PER_BLOCK }, () => ({
      teacherId: undefined,
      seats: Array.from({ length: SEATS_PER_GROUP }, () => ({})),
    })),
  };
}

export function emptyDay(): DayBoard {
  return { blocks: Array.from({ length: BLOCKS_PER_DAY }, emptyBlock) };
}

export function emptyWeek(weekStart: string): WeekBoard {
  return { weekStart, days: Array.from({ length: DAYS_PER_WEEK }, emptyDay) };
}

/** 예전 데이터(월~토 6일)라도 7일짜리 판이 되도록 채운다 */
export function normalizeWeek(week: WeekBoard): WeekBoard {
  if (Array.isArray(week.days) && week.days.length >= DAYS_PER_WEEK) return week;
  const days = [...(week.days ?? [])];
  while (days.length < DAYS_PER_WEEK) days.push(emptyDay());
  return { ...week, days };
}

/** 요일 기본 교시 시간 (토·일요일은 토요일 시간대) */
export function defaultTimesFor(settings: Settings, dayIndex: number): string[] {
  return dayIndex >= 5 ? settings.saturdayTimes : settings.weekdayTimes;
}

/** 이 주 이 요일의 실제 교시 시간 (운영 설정이 있으면 그것을 우선) */
export function timesFor(week: WeekBoard, settings: Settings, dayIndex: number): string[] {
  return week.daySettings?.[dayIndex]?.times ?? defaultTimesFor(settings, dayIndex);
}

/** 이 주 이 요일이 휴원인지. 일요일은 따로 '운영'으로 열지 않으면 휴원 */
export function isDayClosed(week: WeekBoard, dayIndex: number): boolean {
  return week.daySettings?.[dayIndex]?.closed ?? dayIndex === SUNDAY;
}

/** 화면·인쇄·엑셀에 보여 줄 요일들. 월~토는 항상, 일요일은 운영하는 주에만 */
export function shownDays(week: WeekBoard): number[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, d) => d).filter((d) => d !== SUNDAY || !isDayClosed(week, d));
}

/** 이번 주에 적용되는 가능 시간: 주별 변경이 있으면 그것, 없으면 명단의 기본값 */
export function weekAvailability(week: WeekBoard, person: { id: ID; availability?: string[] }): string[] {
  return week.availability?.[person.id] ?? person.availability ?? [];
}

/** 이번 주 가능 시간 변경을 명단에 반영한 데이터 사본 (자동 배치 등에 사용) */
export function withWeekAvailability(data: TimetableData, week: WeekBoard): TimetableData {
  const ov = week.availability;
  if (!ov || Object.keys(ov).length === 0) return data;
  return {
    ...data,
    students: data.students.map((s) => (ov[s.id] ? { ...s, availability: ov[s.id] } : s)),
    teachers: data.teachers.map((t) => (ov[t.id] ? { ...t, availability: ov[t.id] } : t)),
  };
}

/** 저장돼 있으면 그 주 판, 없으면 빈 판 */
export function weekOf(data: TimetableData, weekStart: string): WeekBoard {
  return data.weeks[weekStart] ?? emptyWeek(weekStart);
}

/* ------------------------------------------------------------------ */
/* 충돌 검사                                                           */
/* ------------------------------------------------------------------ */

export interface Conflict {
  type: 'student' | 'teacher';
  dayIndex: number;
  blockIndex: number;
  /** 문제가 된 사람 id */
  personId: ID;
  /** 겹친 위치 설명용: 좌석 번호(1~12) 또는 그룹 번호(1~4) 목록 */
  positions: number[];
}

/**
 * 한 주 전체에서 겹침을 찾는다.
 * - 같은 날 같은 교시에 한 학생이 두 좌석 이상에 배정
 * - 같은 날 같은 교시에 한 강사가 두 그룹 이상에 배정
 */
export function findConflicts(week: WeekBoard): Conflict[] {
  const out: Conflict[] = [];
  week.days.forEach((day, dayIndex) => {
    day.blocks.forEach((block, blockIndex) => {
      const studentSeats = new Map<ID, number[]>();
      const teacherGroups = new Map<ID, number[]>();
      block.groups.forEach((group, g) => {
        if (group.teacherId) {
          const list = teacherGroups.get(group.teacherId) ?? [];
          list.push(g + 1);
          teacherGroups.set(group.teacherId, list);
        }
        group.seats.forEach((seat, s) => {
          if (seat.studentId) {
            const seatNo = g * SEATS_PER_GROUP + s + 1;
            const list = studentSeats.get(seat.studentId) ?? [];
            list.push(seatNo);
            studentSeats.set(seat.studentId, list);
          }
        });
      });
      for (const [personId, positions] of studentSeats) {
        if (positions.length > 1) out.push({ type: 'student', dayIndex, blockIndex, personId, positions });
      }
      for (const [personId, positions] of teacherGroups) {
        if (positions.length > 1) out.push({ type: 'teacher', dayIndex, blockIndex, personId, positions });
      }
    });
  });
  return out;
}

/** 학생별 이번 주 배정 횟수 (회차제 집계) */
export function studentWeekCounts(week: WeekBoard): Map<ID, number> {
  const counts = new Map<ID, number>();
  for (const day of week.days) {
    for (const block of day.blocks) {
      for (const group of block.groups) {
        for (const seat of group.seats) {
          if (seat.studentId) {
            counts.set(seat.studentId, (counts.get(seat.studentId) ?? 0) + 1);
          }
        }
      }
    }
  }
  return counts;
}

/**
 * 학생×과목별 이번 주 배정 횟수.
 * 키는 `${studentId}|${과목}` (과목이 비어 있으면 `${studentId}|`).
 */
export function studentSubjectWeekCounts(week: WeekBoard): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of week.days) {
    for (const block of day.blocks) {
      for (const group of block.groups) {
        for (const seat of group.seats) {
          if (seat.studentId) {
            const key = `${seat.studentId}|${seat.subject?.trim() ?? ''}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }
  return counts;
}

/** 판이 완전히 비어 있는지 */
export function isWeekEmpty(week: WeekBoard): boolean {
  return week.days.every((d) =>
    d.blocks.every((b) =>
      b.groups.every((g) => !g.teacherId && g.seats.every((s) => !s.studentId)),
    ),
  );
}
