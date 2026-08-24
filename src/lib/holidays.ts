import type { DateStr } from '../types';
import { addDays } from './date';

/**
 * 대한민국 공휴일 표시용 내장 표.
 *
 * 음력 기반 명절은 계산하지 않고 연도별로 적어 둔다. 표에 없는 연도는
 * 양력 고정 공휴일만 표시된다. 대체공휴일은 자동 계산하지 않으므로,
 * 학원 운영에 반영해야 하는 날은 '휴원일' 일정으로 직접 등록하는 편이 안전하다.
 * 새 연도가 오면 아래 LUNAR_HOLIDAYS에 한 줄만 추가하면 된다.
 */

/** 매년 같은 양력 날짜인 공휴일 ('MM-DD') */
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
};

/** 연도별 음력 기반 공휴일. seollal/chuseok은 명절 당일 날짜(앞뒤 하루씩 연휴). */
const LUNAR_HOLIDAYS: Record<number, { seollal: DateStr; chuseok: DateStr; buddha: DateStr }> = {
  2025: { seollal: '2025-01-29', chuseok: '2025-10-06', buddha: '2025-05-05' },
  2026: { seollal: '2026-02-17', chuseok: '2026-09-25', buddha: '2026-05-24' },
  2027: { seollal: '2027-02-06', chuseok: '2027-09-15', buddha: '2027-05-13' },
  2028: { seollal: '2028-01-26', chuseok: '2028-10-03', buddha: '2028-05-02' },
};

const cache = new Map<number, Map<DateStr, string>>();

function buildYear(year: number): Map<DateStr, string> {
  const map = new Map<DateStr, string>();
  for (const [md, name] of Object.entries(FIXED_HOLIDAYS)) {
    map.set(`${year}-${md}`, name);
  }
  const lunar = LUNAR_HOLIDAYS[year];
  if (lunar) {
    map.set(addDays(lunar.seollal, -1), '설날 연휴');
    map.set(lunar.seollal, '설날');
    map.set(addDays(lunar.seollal, 1), '설날 연휴');
    map.set(addDays(lunar.chuseok, -1), '추석 연휴');
    map.set(lunar.chuseok, '추석');
    map.set(addDays(lunar.chuseok, 1), '추석 연휴');
    map.set(lunar.buddha, '부처님오신날');
  }
  return map;
}

/** 해당 날짜의 공휴일 이름. 공휴일이 아니면 null */
export function holidayName(date: DateStr): string | null {
  const year = Number(date.slice(0, 4));
  if (!cache.has(year)) cache.set(year, buildYear(year));
  return cache.get(year)!.get(date) ?? null;
}

/** 내장 표에 음력 명절이 들어 있는 연도인지 */
export function hasLunarData(year: number): boolean {
  return year in LUNAR_HOLIDAYS;
}
