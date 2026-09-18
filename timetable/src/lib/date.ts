import type { DateStr } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

/** 그 주의 월요일 */
export function mondayOf(s: DateStr): DateStr {
  const dow = fromDateStr(s).getDay(); // 0=일
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(s, delta);
}

/** '2026-08-24' → '8/24' */
export function shortDate(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** '8월 24일 월요일' 같은 인쇄용 표기 */
export function longDayLabel(s: DateStr, dayLabel: string): string {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dayLabel}요일`;
}

/** 주간 제목: '2026년 8월 24일 ~ 8월 29일' */
/** '2026년 9월 14일 ~ 19일'. lastDay는 마지막 요일 번호(기본 5=토, 일요일 운영 주엔 6) */
export function weekTitle(weekStart: DateStr, lastDay = 5): string {
  const a = fromDateStr(weekStart);
  const b = fromDateStr(addDays(weekStart, lastDay));
  const right =
    a.getMonth() === b.getMonth()
      ? `${b.getDate()}일`
      : `${b.getMonth() + 1}월 ${b.getDate()}일`;
  return `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${right}`;
}
