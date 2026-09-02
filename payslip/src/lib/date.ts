import type { DateStr, MonthStr } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

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

/** '2026-08-24' → '2026-08' */
export function monthOf(s: DateStr): MonthStr {
  return s.slice(0, 7);
}

export function thisMonth(): MonthStr {
  return monthOf(today());
}

export function addMonths(m: MonthStr, n: number): MonthStr {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** '2026-08' → '2026년 8월' */
export function monthTitle(m: MonthStr): string {
  const [y, mo] = m.split('-').map(Number);
  return `${y}년 ${mo}월`;
}

/** '2026-08-24' → '8/24(월)' */
export function shortDate(s: DateStr): string {
  const d = fromDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_LABELS[d.getDay()]})`;
}

/** 주간 라벨: '8/24(월) ~ 8/30(일)' */
export function weekLabel(weekStart: DateStr): string {
  return `${shortDate(weekStart)} ~ ${shortDate(addDays(weekStart, 6))}`;
}

/** 그 달의 모든 날짜 (1일부터 말일까지) */
export function monthDates(m: MonthStr): DateStr[] {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  const out: DateStr[] = [];
  for (let d = 1; d <= last; d++) out.push(`${m}-${pad(d)}`);
  return out;
}
