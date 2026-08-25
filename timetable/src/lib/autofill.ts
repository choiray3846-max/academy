import type { Student, Teacher, TimetableData, WeekBoard } from '../types';
import {
  BLOCKS_PER_DAY,
  DAYS_PER_WEEK,
  DAY_LABELS,
  BLOCK_NAMES,
  MAX_SESSIONS_PER_DAY,
  prefsForSubject,
  slotKey,
  studentEnrollments,
  teacherSubjects,
} from '../types';
import { studentSubjectWeekCounts } from './board';

export interface FillResult {
  week: WeekBoard;
  /** 이번 실행으로 새로 배치한 세션 수 */
  placed: number;
  /** 회차를 못 채운 학생·과목들 */
  unplaced: { student: Student; subject: string; missing: number; reason: string }[];
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

  /** 배치 작업 하나 = 학생 한 명의 한 과목 등록 */
  interface Task {
    st: Student;
    subject: string;
  }

  const skipped: FillResult['skipped'] = [];
  const tasks: Task[] = [];
  for (const st of data.students) {
    if (st.archived) continue;
    const enrollments = studentEnrollments(st).filter((e) => e.weeklyCount > 0);
    const hasAvail = (st.availability?.length ?? 0) > 0;
    if (enrollments.length > 0 && hasAvail) {
      for (const e of enrollments) tasks.push({ st, subject: e.subject.trim() });
    } else if (enrollments.length > 0 || hasAvail) {
      skipped.push({
        student: st,
        reason: enrollments.length > 0 ? '가능 시간이 입력되지 않음' : '과목·회차가 입력되지 않음',
      });
    }
  }

  // 과목별로 이미 배정된 수를 세서 남은 회차를 구한다.
  // 과목이 비워진 좌석은 그 학생의 첫 번째 등록 과목으로 간주한다.
  const subjectCounts = studentSubjectWeekCounts(draft);
  const taskKey = (t: Task) => `${t.st.id}|${t.subject}`;
  const needs = new Map<string, number>();
  for (const t of tasks) {
    const enrollment = studentEnrollments(t.st).find((e) => e.subject.trim() === t.subject);
    let used = subjectCounts.get(taskKey(t)) ?? 0;
    const firstSubject = studentEnrollments(t.st)[0]?.subject.trim() ?? '';
    if (t.subject === firstSubject) used += subjectCounts.get(`${t.st.id}|`) ?? 0;
    needs.set(taskKey(t), Math.max(0, (enrollment?.weeklyCount ?? 0) - used));
  }

  const subjectMatches = (t: Teacher, subject: string) => {
    const list = teacherSubjects(t);
    return list.length === 0 || subject === '' || list.includes(subject);
  };

  /**
   * 과목 계열: 같은 계열끼리만 한 그룹(한 수업)에 섞일 수 있다.
   * - 어문 계열: 국어·영어 등
   * - 수리·과학 계열: 수학·과학·물리 등
   * 표에 없는 과목은 자기 과목끼리만 묶인다.
   */
  const SUBJECT_FAMILIES: string[][] = [
    ['국어', '영어', '사회', '한국사', '역사'],
    ['수학', '과학', '물리', '화학', '생명과학', '생물', '지구과학'],
  ];
  function subjectFamily(subject: string): string {
    for (let i = 0; i < SUBJECT_FAMILIES.length; i++) {
      if (SUBJECT_FAMILIES[i].includes(subject)) return `family${i}`;
    }
    return `only:${subject}`;
  }
  /** 빈 과목은 무엇과도 호환 */
  function subjectsCompatible(a: string, b: string): boolean {
    if (a === '' || b === '') return true;
    return subjectFamily(a) === subjectFamily(b);
  }
  /** 그룹에 이미 앉은 과목들과 이 과목이 섞여도 되는지 */
  function groupCompatible(group: { seats: { studentId?: string; subject?: string }[] }, subject: string): boolean {
    return group.seats.every(
      (seat) => !seat.studentId || subjectsCompatible(seat.subject?.trim() ?? '', subject),
    );
  }
  const mustIdsOf = (st: Student, subject: string) =>
    Object.entries(prefsForSubject(st, subject))
      .filter(([, level]) => level === 'must')
      .map(([id]) => id);
  /**
   * 이 강사에게 이 학생의 이 과목 수업을 붙여도 되는가.
   * 과목은 항상 맞아야 한다 (복수 과목 학생의 영어 수업이 수학 지정 강사에게
   * 가는 것을 막기 위해). 지정 강사 중 이 과목을 가르치는 강사가 있으면
   * 그 강사만 허용하고, 아무도 이 과목을 못 가르치면 그 과목에 한해
   * 지정을 무시한다 (지정이 다른 과목용이었다고 본다).
   */
  const eligible = (t: Teacher, st: Student, subject: string) => {
    if (!subjectMatches(t, subject)) return false;
    const mustForSubject = mustIdsOf(st, subject).filter((id) => {
      const mt = teacherById.get(id);
      return mt && subjectMatches(mt, subject);
    });
    if (mustForSubject.length > 0) return mustForSubject.includes(t.id);
    return true;
  };
  /**
   * 점수 가중치 설계 (큰 것이 우선):
   * - 지정/선호 강사: 30/20 — 다른 모든 선호보다 우선
   * - 퍼뜨리기: 0~12 — 기존 수업일에서 먼 날일수록 높음
   * - 배치 형태: 열린 그룹 10 / 새 그룹 5
   */
  const prefBonus = (t: Teacher, st: Student, subject: string) => {
    const level = prefsForSubject(st, subject)[t.id];
    return level === 'must' ? 30 : level === 'prefer' ? 20 : 0;
  };

  /**
   * 수업일 퍼뜨리기 점수.
   * 주 3회면 월화수보다 월수금처럼 벌어지도록, 이미 수업이 있는 날과의
   * 최소 간격이 클수록 높은 점수를 준다. 같은 날 두 번째 교시는 0점이라
   * 다른 날이 모두 막혔을 때만 쓰인다.
   */
  function spreadScore(d: number, studentId: string): number {
    const days: number[] = [];
    for (let dd = 0; dd < DAYS_PER_WEEK; dd++) {
      if (studentDayCount(dd, studentId) > 0) days.push(dd);
    }
    if (days.includes(d)) return 0;
    if (days.length === 0) return 3 * 4;
    const minDist = Math.min(...days.map((dd) => Math.abs(dd - d)));
    return Math.min(3, minDist) * 4;
  }

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

  /** 튜터가 하루에 맡길 기본 최대 교시 수 (대안이 없으면 초과 허용) */
  const TEACHER_SOFT_MAX_PER_DAY = 2;

  /** 이 튜터가 그 날 맡고 있는 교시 수 */
  function teacherDayBlocks(d: number, teacherId: string): number {
    return draft.days[d].blocks.filter((blk) => blk.groups.some((g) => g.teacherId === teacherId)).length;
  }

  /** 이 튜터가 이번 주에 맡고 있는 총 교시 수 (고른 분배용) */
  function teacherWeekLoad(teacherId: string): number {
    let n = 0;
    for (let d = 0; d < DAYS_PER_WEEK; d++) n += teacherDayBlocks(d, teacherId);
    return n;
  }

  interface Candidate {
    d: number;
    b: number;
    groupIndex: number;
    /** 새 그룹을 열 때 배정할 강사 */
    newTeacherId?: string;
    score: number;
  }

  /** 한 작업(학생×과목)의 다음 세션을 놓을 최적 자리 찾기 */
  function findSlot(task: Task): Candidate | null {
    const { st, subject } = task;
    let best: Candidate | null = null;

    for (const key of st.availability ?? []) {
      const [d, b] = key.split('-').map(Number);
      if (!(d >= 0 && d < DAYS_PER_WEEK && b >= 0 && b < BLOCKS_PER_DAY)) continue;
      if (studentInBlock(d, b, st.id)) continue;
      if (studentDayCount(d, st.id) >= MAX_SESSIONS_PER_DAY) continue; // 하루 최대 횟수 제한

      const block = draft.days[d].blocks[b];
      const dayBonus = spreadScore(d, st.id);

      // 1순위: 이미 열린 그룹(배치 가능한 강사)의 빈 좌석. 선호·지정 강사면 가산점.
      // 학생이 1명뿐인 그룹에는 짝짓기 가산점을 줘서 '튜터당 2명 이상'을 유도한다.
      for (let g = 0; g < block.groups.length; g++) {
        const group = block.groups[g];
        if (!group.teacherId) continue;
        const teacher = teacherById.get(group.teacherId);
        if (!teacher || !eligible(teacher, st, subject)) continue;
        if (!group.seats.some((s) => !s.studentId)) continue;
        const occupied = group.seats.filter((x) => x.studentId).length;
        const compatible = groupCompatible(group, subject);
        // 계열이 다르면 크게 감점: 정상적인 다른 자리(최소 점수 2)보다 항상
        // 낮아져서, 정말 다른 자리가 없을 때만 섞인다.
        const base = compatible ? 10 : -15;
        const pairBonus = compatible ? (occupied === 1 ? 3 : occupied === 2 ? 2 : 0) : 0;
        const score = base + dayBonus + prefBonus(teacher, st, subject) + pairBonus;
        if (!best || score > best.score) best = { d, b, groupIndex: g, score };
      }

      // 2순위: 빈 그룹을 새로 열기.
      // 강사 선택: 선호·지정 우선 → 하루 2교시 미만인 튜터 우선 →
      // 이번 주 수업이 적은 튜터 우선 (모든 튜터를 고르게 활용).
      for (let g = 0; g < block.groups.length; g++) {
        const group = block.groups[g];
        if (group.teacherId) continue;
        if (!group.seats.some((s) => !s.studentId)) continue;
        const all = activeTeachers.filter(
          (t) =>
            eligible(t, st, subject) &&
            (t.availability ?? []).includes(slotKey(d, b)) &&
            !teacherBusy(d, b, t.id),
        );
        // 하루 소프트 최대에 안 걸린 튜터를 먼저, 없으면 어쩔 수 없이 전체에서
        const fresh = all.filter((t) => teacherDayBlocks(d, t.id) < TEACHER_SOFT_MAX_PER_DAY);
        const pool = fresh.length > 0 ? fresh : all;
        pool.sort(
          (a, c) =>
            prefBonus(c, st, subject) - prefBonus(a, st, subject) ||
            teacherWeekLoad(a.id) - teacherWeekLoad(c.id),
        );
        const teacher = pool[0];
        if (!teacher) continue;
        // 하루 최대를 넘겨야 하는 자리는 점수를 낮춰서, 다른 슬롯에 여유 튜터가
        // 있으면 그쪽이 이기게 한다.
        const overCap = teacherDayBlocks(d, teacher.id) >= TEACHER_SOFT_MAX_PER_DAY;
        const score = (overCap ? 2 : 5) + dayBonus + prefBonus(teacher, st, subject);
        if (!best || score > best.score) best = { d, b, groupIndex: g, newTeacherId: teacher.id, score };
        break; // 빈 그룹은 어느 것이든 같으므로 첫 번째만 본다
      }
    }
    return best;
  }

  /** 못 놓은 이유 진단 */
  function diagnose(task: Task): string {
    const { st, subject } = task;
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
    const must = mustIdsOf(st, subject);
    if (must.length > 0) {
      const names = must.map((id) => teacherById.get(id)?.name ?? '?').join('·');
      return `지정 강사(${names})를 가능한 시간대에 배정할 수 없습니다 (강사 가능 시간 확인)`;
    }
    return subject
      ? `가능한 시간대에 ${subject} 강사를 배정할 수 없습니다 (강사 가능 시간 확인)`
      : '가능한 시간대에 배정할 강사가 없습니다 (강사 가능 시간 확인)';
  }

  /** 이 작업에 실제로 적용되는 지정 강사가 있는지 (그 과목을 가르칠 수 있는 지정) */
  function hasMustForTask(task: Task): boolean {
    return mustIdsOf(task.st, task.subject).some((id) => {
      const mt = teacherById.get(id);
      return mt && subjectMatches(mt, task.subject);
    });
  }

  let placed = 0;
  /** 이번 실행에서 자동으로 놓은 좌석 위치 ('d-b-g-seat') — 손 배치와 구분 */
  const placedKeys = new Set<string>();
  /** 이번 실행에서 강사를 새로 배정한 그룹 ('d-b-g') */
  const openedKeys = new Set<string>();

  /** 주어진 작업들을 회차가 다 찰 때까지 라운드 방식으로 배치 */
  function runPhase(phaseTasks: Task[]) {
    let progress = true;
    let guard = 0;
    while (progress && guard++ < 500) {
      progress = false;
      // 라운드마다 작업당 한 세션씩: 자리가 빠듯한(가능 슬롯 적은) 학생 먼저
      const order = phaseTasks
        .filter((t) => (needs.get(taskKey(t)) ?? 0) > 0)
        .sort((a, b) => (a.st.availability?.length ?? 0) - (b.st.availability?.length ?? 0));
      for (const task of order) {
        if ((needs.get(taskKey(task)) ?? 0) <= 0) continue;
        const slot = findSlot(task);
        if (!slot) continue;
        const group = draft.days[slot.d].blocks[slot.b].groups[slot.groupIndex];
        if (slot.newTeacherId) {
          group.teacherId = slot.newTeacherId;
          openedKeys.add(`${slot.d}-${slot.b}-${slot.groupIndex}`);
        }
        const seatIndex = group.seats.findIndex((s) => !s.studentId);
        const seat = group.seats[seatIndex];
        seat.studentId = task.st.id;
        seat.subject = task.subject || undefined;
        seat.managerId = seat.managerId ?? defaultManagerId;
        placedKeys.add(`${slot.d}-${slot.b}-${slot.groupIndex}-${seatIndex}`);
        needs.set(taskKey(task), (needs.get(taskKey(task)) ?? 0) - 1);
        placed++;
        progress = true;
      }
    }
  }

  // 1단계: 지정 강사가 있는 학생들을 먼저 전부 배치한다.
  //         지정 강사는 선택지가 좁아서, 나중에 배치하면 자리를 뺏길 수 있다.
  // 2단계: 나머지 학생들을 배치한다.
  runPhase(tasks.filter(hasMustForTask));
  runPhase(tasks.filter((t) => !hasMustForTask(t)));

  /**
   * 마무리: 학생이 1명뿐인 그룹을 찾아, 그 학생을 다른 시간대의
   * 1~2명 그룹으로 옮겨 합칠 수 있으면 옮긴다 (튜터당 2명 이상 유도).
   * 이번 실행에서 자동으로 놓은 좌석만 움직이고, 손 배치는 건드리지 않는다.
   */
  const studentById = new Map(data.students.map((st) => [st.id, st]));
  let mergedMoved = true;
  let mergeGuard = 0;
  while (mergedMoved && mergeGuard++ < 100) {
    mergedMoved = false;
    for (let d = 0; d < DAYS_PER_WEEK && !mergedMoved; d++) {
      for (let b = 0; b < BLOCKS_PER_DAY && !mergedMoved; b++) {
        const block = draft.days[d].blocks[b];
        for (let g = 0; g < block.groups.length && !mergedMoved; g++) {
          const group = block.groups[g];
          if (!group.teacherId) continue;
          const occupiedSeats = group.seats
            .map((seat, index) => ({ seat, index }))
            .filter((x) => x.seat.studentId);
          if (occupiedSeats.length !== 1) continue;
          const { seat, index: seatIndex } = occupiedSeats[0];
          if (!placedKeys.has(`${d}-${b}-${g}-${seatIndex}`)) continue;
          const st = studentById.get(seat.studentId!);
          if (!st) continue;
          const subject = seat.subject?.trim() ?? '';

          // 옮겨 갈 곳: 강사가 배치 가능하고 학생이 1~2명인 그룹 (많이 찬 곳 우선)
          let target: { d2: number; b2: number; g2: number; score: number } | null = null;
          for (const key of st.availability ?? []) {
            const [d2, b2] = key.split('-').map(Number);
            if (!(d2 >= 0 && d2 < DAYS_PER_WEEK && b2 >= 0 && b2 < BLOCKS_PER_DAY)) continue;
            if (d2 === d && b2 === b) continue;
            if (studentInBlock(d2, b2, st.id)) continue;
            const removedSameDay = d2 === d ? 1 : 0;
            if (studentDayCount(d2, st.id) - removedSameDay >= MAX_SESSIONS_PER_DAY) continue;
            const block2 = draft.days[d2].blocks[b2];
            for (let g2 = 0; g2 < block2.groups.length; g2++) {
              const grp2 = block2.groups[g2];
              if (!grp2.teacherId) continue;
              const t2 = teacherById.get(grp2.teacherId);
              if (!t2 || !eligible(t2, st, subject)) continue;
              const occ = grp2.seats.filter((x) => x.studentId).length;
              if (occ < 1 || occ >= grp2.seats.length) continue;
              if (!groupCompatible(grp2, subject)) continue; // 계열이 다르면 합치지 않음
              const score = occ * 10 + prefBonus(t2, st, subject);
              if (!target || score > target.score) target = { d2, b2, g2, score };
            }
          }
          if (!target) continue;

          const dst = draft.days[target.d2].blocks[target.b2].groups[target.g2];
          const freeIndex = dst.seats.findIndex((x) => !x.studentId);
          dst.seats[freeIndex] = { ...seat };
          group.seats[seatIndex] = {};
          placedKeys.delete(`${d}-${b}-${g}-${seatIndex}`);
          placedKeys.add(`${target.d2}-${target.b2}-${target.g2}-${freeIndex}`);
          // 이번에 열었던 그룹이 비면 강사 배정도 거둔다.
          if (openedKeys.has(`${d}-${b}-${g}`) && group.seats.every((x) => !x.studentId)) {
            group.teacherId = undefined;
            openedKeys.delete(`${d}-${b}-${g}`);
          }
          mergedMoved = true;
        }
      }
    }
  }

  const unplaced = tasks
    .filter((t) => (needs.get(taskKey(t)) ?? 0) > 0)
    .map((t) => ({
      student: t.st,
      subject: t.subject,
      missing: needs.get(taskKey(t))!,
      reason: diagnose(t),
    }));

  return { week: draft, placed, unplaced, skipped };
}

/** 슬롯 키를 '월 B' 같은 사람이 읽는 이름으로 */
export function slotLabel(key: string): string {
  const [d, b] = key.split('-').map(Number);
  return `${DAY_LABELS[d] ?? '?'} ${BLOCK_NAMES[b] ?? '?'}`;
}
