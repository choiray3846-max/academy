import type { DateStr, TimeStr, Weekday } from '../types';

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date 객체 → 'YYYY-MM-DD' (로컬 기준) */
export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date (로컬 자정). UTC 파싱으로 인한 하루 밀림을 피한다. */
export function fromDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): DateStr {
  return toDateStr(new Date());
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(s: DateStr, n: number): DateStr {
  const d = fromDateStr(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // 1/31 + 1개월 처럼 존재하지 않는 날이면 그 달의 말일로 맞춘다.
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return toDateStr(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function weekdayOf(s: DateStr): Weekday {
  return fromDateStr(s).getDay() as Weekday;
}

/** a <= b 비교용. 문자열 비교로 충분하다('YYYY-MM-DD'는 사전순 = 시간순). */
export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b;
}

export function isBetween(s: DateStr, start: DateStr, end: DateStr): boolean {
  return s >= start && s <= end;
}

export function diffDays(a: DateStr, b: DateStr): number {
  const ms = fromDateStr(b).getTime() - fromDateStr(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** start부터 end까지(포함) 날짜 문자열 배열 */
export function eachDay(start: DateStr, end: DateStr): DateStr[] {
  const out: DateStr[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 주어진 날짜가 속한 주의 시작일 */
export function startOfWeek(s: DateStr, weekStartsOn: 0 | 1 = 0): DateStr {
  const dow = weekdayOf(s);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(s, -delta);
}

export function startOfMonth(s: DateStr): DateStr {
  const d = fromDateStr(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(s: DateStr): DateStr {
  const d = fromDateStr(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * 월간 달력 그리드에 필요한 날짜들.
 * 앞뒤로 다른 달 날짜를 채워 항상 완전한 주 단위가 되게 한다.
 */
export function monthGrid(anchor: DateStr, weekStartsOn: 0 | 1 = 0): DateStr[] {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const gridStart = startOfWeek(first, weekStartsOn);
  let gridEnd = startOfWeek(last, weekStartsOn);
  gridEnd = addDays(gridEnd, 6);
  return eachDay(gridStart, gridEnd);
}

/** '2026-03-05' → '2026년 3월' */
export function formatMonthTitle(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** '2026-03-05' → '3월 5일 (목)' */
export function formatDayTitle(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;
}

/** '2026-03-05' → '2026. 3. 5. (목)' */
export function formatFullDate(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAY_LABELS[d.getDay()]})`;
}

/** 주간 뷰 제목: '3월 2일 – 3월 8일' */
export function formatWeekTitle(start: DateStr): string {
  const end = addDays(start, 6);
  const a = fromDateStr(start);
  const b = fromDateStr(end);
  const left = `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일`;
  const right =
    a.getMonth() === b.getMonth()
      ? `${b.getDate()}일`
      : `${b.getMonth() + 1}월 ${b.getDate()}일`;
  return `${left} – ${right}`;
}

/** 'HH:MM' → 자정부터의 분 */
export function timeToMinutes(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): TimeStr {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** '14:30' → '오후 2:30' */
export function formatTimeKo(t: TimeStr): string {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${pad(m || 0)}`;
}

/** 두 시간 구간이 겹치는지 (끝시각 맞닿는 건 겹침 아님) */
export function overlaps(aStart: TimeStr, aEnd: TimeStr, bStart: TimeStr, bEnd: TimeStr): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/** 요일 배열을 '월·수·금' 형태로 */
export function formatWeekdays(days: Weekday[]): string {
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join('·');
}

export function isWeekend(s: DateStr): boolean {
  const dow = weekdayOf(s);
  return dow === 0 || dow === 6;
}

export function isSameMonth(a: DateStr, b: DateStr): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
