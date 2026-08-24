import type { Student, Teacher, TimetableData, WeekBoard } from '../types';
import {
  BLOCKS_PER_DAY,
  DAYS_PER_WEEK,
  DAY_LABELS,
  BLOCK_NAMES,
  MAX_SESSIONS_PER_DAY,
  slotKey,
  teacherSubjects,
} from '../types';
import { studentWeekCounts } from './board';

export interface FillResult {
  week: WeekBoard;
  /** 이번 실행으로 새로 배치한 세션 수 */
  placed: number;
  /** 회차를 못 채운 학생들 */
  unplaced: { student: Student; missing: number; reason: string }[];
  /** 자동 배치 대상에서 빠진 학생들 (회차나 가능 시간 미입력) */
  skipped: { student: Student; reason: string }[];
}

/**
 * 자동 배치.
 *
 * 이미 판에 놓인 배정은 그대로 두고, 각 학생의 남은 회차만큼
 * 빈 좌석을 채운다. 규칙:
 * - 학생·강사 모두 그 시간대에 가능해야 한다.
 * - 강사 과목과 학생 기본 과목이 맞아야 한다 (한쪽이 비어 있으면 무관).
 * - 같은 교시에 같은 학생이 두 번 앉을 수 없고, 강사는 그룹 하나만 맡는다.
 * - 이미 열려 있는 그룹의 빈 좌석을 우선 채우고, 없으면 새 그룹을 연다.
 * - 같은 날 연속 교시(B 다음 C 등)를 약간 선호한다.
 *
 * 선택 순서는 '가능한 자리가 적은 학생 먼저'라, 시간이 빠듯한 학생이
 * 자리를 뺏기는 일을 줄인다.
 */
export function autoFill(data: TimetableData, week: WeekBoard): FillResult {
  const draft = structuredClone(week);
  const defaultManagerId = data.settings.defaultManagerId;

  const activeTeachers = data.teachers.filter((t) => !t.archived);
  const teacherById = new Map(activeTeachers.map((t) => [t.id, t]));

  const skipped: FillResult['skipped'] = [];
  const targets: Student[] = [];
  for (const st of data.students) {
    if (st.archived) continue;
    const hasCount = (st.weeklyCount ?? 0) > 0;
    const hasAvail = (st.availability?.length ?? 0) > 0;
    if (hasCount && hasAvail) targets.push(st);
    else if (hasCount || hasAvail) {
      skipped.push({
        student: st,
        reason: hasCount ? '가능 시간이 입력되지 않음' : '주 회차가 입력되지 않음',
      });
    }
  }

  const counts = studentWeekCounts(draft);
  const needs = new Map<string, number>(
    targets.map((st) => [st.id, Math.max(0, (st.weeklyCount ?? 0) - (counts.get(st.id) ?? 0))]),
  );

  const subjectOf = (st: Student) => st.defaultSubject?.trim() ?? '';
  const subjectMatches = (t: Teacher, subject: string) => {
    const list = teacherSubjects(t);
    return list.length === 0 || subject === '' || list.includes(subject);
  };
  const mustIdsOf = (st: Student) =>
    Object.entries(st.teacherPrefs ?? {})
      .filter(([, level]) => level === 'must')
      .map(([id]) => id);
  /**
   * 이 강사에게 이 학생을 붙여도 되는가.
   * 지정 강사가 있으면 그 강사만 허용. 지정·선호 관계는 과목 검사를 건너뛴다
   * (관계를 직접 지정했다면 과목 추론보다 우선한다).
   */
  const eligible = (t: Teacher, st: Student) => {
    const must = mustIdsOf(st);
    if (must.length > 0) return must.includes(t.id);
    if (st.teacherPrefs?.[t.id]) return true;
    return subjectMatches(t, subjectOf(st));
  };
  const prefBonus = (t: Teacher, st: Student) => {
    const level = st.teacherPrefs?.[t.id];
    return level === 'must' ? 4 : level === 'prefer' ? 3 : 0;
  };

  function studentInBlock(d: number, b: number, studentId: string): boolean {
    return draft.days[d].blocks[b].groups.some((g) => g.seats.some((s) => s.studentId === studentId));
  }
  /** 그 날 이 학생이 이미 앉아 있는 교시 수 */
  function studentDayCount(d: number, studentId: string): number {
    return draft.days[d].blocks.filter((_, b) => studentInBlock(d, b, studentId)).length;
  }
  function teacherBusy(d: number, b: number, teacherId: string): boolean {
    return draft.days[d].blocks[b].groups.some((g) => g.teacherId === teacherId);
  }

  interface Candidate {
    d: number;
    b: number;
    groupIndex: number;
    /** 새 그룹을 열 때 배정할 강사 */
    newTeacherId?: string;
    score: number;
  }

  /** 한 학생의 다음 세션을 놓을 최적 자리 찾기 */
  function findSlot(st: Student): Candidate | null {
    let best: Candidate | null = null;

    for (const key of st.availability ?? []) {
      const [d, b] = key.split('-').map(Number);
      if (!(d >= 0 && d < DAYS_PER_WEEK && b >= 0 && b < BLOCKS_PER_DAY)) continue;
      if (studentInBlock(d, b, st.id)) continue;
      const dayCount = studentDayCount(d, st.id);
      if (dayCount >= MAX_SESSIONS_PER_DAY) continue; // 하루 최대 횟수 제한

      const block = draft.days[d].blocks[b];
      const dayBonus = dayCount === 1 ? 1 : 0; // 같은 날 두 번째 수업(연속) 선호

      // 1순위: 이미 열린 그룹(배치 가능한 강사)의 빈 좌석. 선호·지정 강사면 가산점.
      for (let g = 0; g < block.groups.length; g++) {
        const group = block.groups[g];
        if (!group.teacherId) continue;
        const teacher = teacherById.get(group.teacherId);
        if (!teacher || !eligible(teacher, st)) continue;
        if (!group.seats.some((s) => !s.studentId)) continue;
        const score = 10 + dayBonus + prefBonus(teacher, st);
        if (!best || score > best.score) best = { d, b, groupIndex: g, score };
      }

      // 2순위: 빈 그룹을 새로 열기. 선호·지정 강사를 먼저 고른다.
      for (let g = 0; g < block.groups.length; g++) {
        const group = block.groups[g];
        if (group.teacherId) continue;
        if (!group.seats.some((s) => !s.studentId)) continue;
        const candidates = activeTeachers
          .filter(
            (t) =>
              eligible(t, st) &&
              (t.availability ?? []).includes(slotKey(d, b)) &&
              !teacherBusy(d, b, t.id),
          )
          .sort((a, c) => prefBonus(c, st) - prefBonus(a, st));
        const teacher = candidates[0];
        if (!teacher) continue;
        const score = 5 + dayBonus + prefBonus(teacher, st);
        if (!best || score > best.score) best = { d, b, groupIndex: g, newTeacherId: teacher.id, score };
        break; // 빈 그룹은 어느 것이든 같으므로 첫 번째만 본다
      }
    }
    return best;
  }

  /** 못 놓은 이유 진단 */
  function diagnose(st: Student): string {
    const subject = subjectOf(st);
    let sawFreeSeat = false;
    let allCapped = true;
    for (const key of st.availability ?? []) {
      const [d, b] = key.split('-').map(Number);
      if (!(d >= 0 && d < DAYS_PER_WEEK && b >= 0 && b < BLOCKS_PER_DAY)) continue;
      if (studentInBlock(d, b, st.id)) continue;
      if (studentDayCount(d, st.id) < MAX_SESSIONS_PER_DAY) allCapped = false;
      const block = draft.days[d].blocks[b];
      if (block.groups.some((g) => g.seats.some((s) => !s.studentId))) sawFreeSeat = true;
    }
    if (allCapped) return `하루 최대 ${MAX_SESSIONS_PER_DAY}회 제한 때문에 남는 시간대가 없습니다 (가능 요일을 늘려 주세요)`;
    if (!sawFreeSeat) return '가능한 시간대의 좌석이 모두 찼습니다';
    const must = mustIdsOf(st);
    if (must.length > 0) {
      const names = must.map((id) => teacherById.get(id)?.name ?? '?').join('·');
      return `지정 강사(${names})를 가능한 시간대에 배정할 수 없습니다 (강사 가능 시간 확인)`;
    }
    return subject
      ? `가능한 시간대에 ${subject} 강사를 배정할 수 없습니다 (강사 가능 시간 확인)`
      : '가능한 시간대에 배정할 강사가 없습니다 (강사 가능 시간 확인)';
  }

  let placed = 0;
  let progress = true;
  let guard = 0;
  while (progress && guard++ < 500) {
    progress = false;
    // 라운드마다 한 명당 한 세션씩: 자리가 빠듯한(가능 슬롯 적은) 학생 먼저
    const order = targets
      .filter((st) => (needs.get(st.id) ?? 0) > 0)
      .sort((a, b) => (a.availability?.length ?? 0) - (b.availability?.length ?? 0));
    for (const st of order) {
      if ((needs.get(st.id) ?? 0) <= 0) continue;
      const slot = findSlot(st);
      if (!slot) continue;
      const group = draft.days[slot.d].blocks[slot.b].groups[slot.groupIndex];
      if (slot.newTeacherId) group.teacherId = slot.newTeacherId;
      const seat = group.seats.find((s) => !s.studentId)!;
      seat.studentId = st.id;
      seat.subject = subjectOf(st) || undefined;
      seat.managerId = seat.managerId ?? defaultManagerId;
      needs.set(st.id, (needs.get(st.id) ?? 0) - 1);
      placed++;
      progress = true;
    }
  }

  const unplaced = targets
    .filter((st) => (needs.get(st.id) ?? 0) > 0)
    .map((st) => ({ student: st, missing: needs.get(st.id)!, reason: diagnose(st) }));

  return { week: draft, placed, unplaced, skipped };
}

/** 슬롯 키를 '월 B' 같은 사람이 읽는 이름으로 */
export function slotLabel(key: string): string {
  const [d, b] = key.split('-').map(Number);
  return `${DAY_LABELS[d] ?? '?'} ${BLOCK_NAMES[b] ?? '?'}`;
}
