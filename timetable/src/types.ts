/**
 * 학원 좌석 시간표 – 도메인 타입
 *
 * 판 구조는 고정이다: 월~토 6일 × 3교시(A/B/C) × 12좌석.
 * 좌석은 3개씩 묶여 4개 그룹이 되고, 그룹마다 담당 강사(T) 1명이 붙는다.
 * 좌석 하나에는 학생 1명 + 과목 + 관리 담당(M)이 배정된다.
 */

export type ID = string;
/** 'YYYY-MM-DD' */
export type DateStr = string;

export const DAYS_PER_WEEK = 6; // 월~토
export const BLOCKS_PER_DAY = 3; // A, B, C
export const SEATS_PER_BLOCK = 12;
export const SEATS_PER_GROUP = 3;
export const GROUPS_PER_BLOCK = SEATS_PER_BLOCK / SEATS_PER_GROUP; // 4

export const BLOCK_NAMES = ['A', 'B', 'C'] as const;
export const DAY_LABELS = ['월', '화', '수', '목', '금', '토'] as const;

export interface Student {
  id: ID;
  name: string;
  grade: string;          // 예: '중3', '고1'
  defaultSubject?: string; // 배정할 때 기본으로 채울 과목
  /** 주당 등록 회차 (회차제 관리용). 없으면 집계만 표시 */
  weeklyCount?: number;
  memo?: string;
  archived?: boolean;
}

export interface Teacher {
  id: ID;
  name: string;
  subject?: string;
  archived?: boolean;
}

/** 관리 담당(M열) */
export interface Manager {
  id: ID;
  name: string;
  archived?: boolean;
}

export interface SeatAssign {
  studentId?: ID;
  subject?: string;
  managerId?: ID;
}

export interface GroupAssign {
  teacherId?: ID;
  seats: SeatAssign[]; // 길이 SEATS_PER_GROUP
}

export interface BlockBoard {
  groups: GroupAssign[]; // 길이 GROUPS_PER_BLOCK
}

export interface DayBoard {
  blocks: BlockBoard[]; // 길이 BLOCKS_PER_DAY
}

/** 한 주의 판. weekStart는 그 주 월요일 날짜 */
export interface WeekBoard {
  weekStart: DateStr;
  days: DayBoard[]; // 길이 DAYS_PER_WEEK (0=월 … 5=토)
}

export interface Settings {
  academyName: string;
  /** 평일 교시 시간 라벨 (표시용 텍스트) */
  weekdayTimes: string[]; // 길이 3, 예: '5:00~6:30'
  /** 토요일 교시 시간 라벨 */
  saturdayTimes: string[];
  /** 새 배정 때 기본으로 채울 관리 담당 */
  defaultManagerId?: ID;
}

export interface TimetableData {
  version: number;
  students: Student[];
  teachers: Teacher[];
  managers: Manager[];
  settings: Settings;
  /** weekStart('YYYY-MM-DD') → 그 주의 판 */
  weeks: Record<DateStr, WeekBoard>;
}
