/**
 * 급여 계산 규칙
 *
 * - 기본급은 근무한 날짜 기준으로 그 달에 넣는다.
 * - 연장·주휴처럼 한 주(월~일) 단위로 계산되는 항목은
 *   그 주의 일요일이 속한 달의 명세서에 넣는다. (달을 걸치는 주 처리)
 * - 연장근로: 1일 8시간 초과분 + (주 전체 - 1일 초과분)이 40시간을 넘는 부분.
 * - 야간근로: 22:00~06:00와 겹치는 시간. 휴게시간은 근무시간 비율로 차감한다.
 * - 연장·야간 가산(시급의 50%)은 상시 5인 이상 사업장일 때만 지급 의무가 있다.
 * - 주휴수당: 주 15시간 이상 근무(연장 제외)한 주에
 *   min(주 근무시간, 40) / 40 × 8시간 × 시급.
 * - 세금·보험료는 10원 미만 절사(국고금 단수 계산 관례).
 */
import type {
  Adjustment,
  DateStr,
  Employee,
  MonthStr,
  PayslipData,
  Settings,
  WorkEntry,
} from '../types';
import { addDays, mondayOf, monthOf } from './date';

const DAY_LIMIT = 8 * 60; // 1일 연장 기준
const WEEK_LIMIT = 40 * 60; // 1주 연장 기준
const ALLOWANCE_MIN = 15 * 60; // 주휴 발생 최소 시간

export function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export interface EntryCalc {
  entry: WorkEntry;
  /** 휴게를 뺀 실제 근무 분 */
  workMinutes: number;
  /** 22~06시와 겹치는 분 (휴게 비례 차감) */
  nightMinutes: number;
}

/** 야간(22:00~06:00) 구간. 자정 넘김 근무를 위해 이틀치 창을 본다 */
const NIGHT_WINDOWS: Array<[number, number]> = [
  [0, 360],
  [1320, 1800],
  [2760, 2880],
];

export function calcEntry(entry: WorkEntry): EntryCalc {
  const start = parseTime(entry.start);
  let end = parseTime(entry.end);
  if (start === null || end === null) {
    return { entry, workMinutes: 0, nightMinutes: 0 };
  }
  if (end <= start) end += 24 * 60; // 다음 날 퇴근
  const span = end - start;
  const workMinutes = Math.max(0, span - (entry.breakMinutes || 0));
  let nightRaw = 0;
  for (const [a, b] of NIGHT_WINDOWS) {
    nightRaw += Math.max(0, Math.min(end, b) - Math.max(start, a));
  }
  const nightMinutes = span === 0 ? 0 : Math.round((nightRaw * workMinutes) / span);
  return { entry, workMinutes, nightMinutes };
}

export interface WeekSummary {
  /** 그 주 월요일 */
  weekStart: DateStr;
  /** 주 전체 근무 분 (달 경계와 무관) */
  minutes: number;
  overtimeMinutes: number;
  /** 주휴수당으로 환산되는 분 (미발생이면 0) */
  allowanceMinutes: number;
}

/** 한 주(월~일) 근무를 요약한다. entries는 그 주의 기록만 */
function summarizeWeek(
  weekStart: DateStr,
  entries: WorkEntry[],
  allowanceEnabled: boolean,
): WeekSummary {
  const byDay = new Map<DateStr, number>();
  let total = 0;
  for (const e of entries) {
    const { workMinutes } = calcEntry(e);
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + workMinutes);
    total += workMinutes;
  }
  let dailyOver = 0;
  for (const minutes of byDay.values()) dailyOver += Math.max(0, minutes - DAY_LIMIT);
  const weeklyOver = Math.max(0, total - dailyOver - WEEK_LIMIT);
  const overtimeMinutes = dailyOver + weeklyOver;

  const regular = total - overtimeMinutes;
  const allowanceMinutes =
    allowanceEnabled && regular >= ALLOWANCE_MIN
      ? Math.round((Math.min(regular, WEEK_LIMIT) / WEEK_LIMIT) * DAY_LIMIT)
      : 0;
  return { weekStart, minutes: total, overtimeMinutes, allowanceMinutes };
}

/** 직원의 전체 기록을 주 단위로 묶어 요약한다 */
export function weekSummaries(
  allEntries: WorkEntry[],
  employee: Employee,
): WeekSummary[] {
  const byWeek = new Map<DateStr, WorkEntry[]>();
  for (const e of allEntries) {
    if (e.employeeId !== employee.id) continue;
    const ws = mondayOf(e.date);
    const list = byWeek.get(ws) ?? [];
    list.push(e);
    byWeek.set(ws, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ws, list]) => summarizeWeek(ws, list, employee.weeklyAllowance));
}

export interface DeductionItem {
  label: string;
  amount: number;
}

export interface Payslip {
  employee: Employee;
  month: MonthStr;
  /** 이 달에 근무한 기록 (날짜순) */
  entries: EntryCalc[];
  workMinutes: number;
  basePay: number;
  nightMinutes: number;
  nightPay: number;
  /** 일요일이 이 달에 속한 주들 */
  weeks: WeekSummary[];
  overtimeMinutes: number;
  overtimePay: number;
  allowanceMinutes: number;
  allowancePay: number;
  extraPays: Adjustment[];
  extraDeducts: Adjustment[];
  grossPay: number;
  deductions: DeductionItem[];
  totalDeduction: number;
  netPay: number;
  warnings: string[];
}

/** 10원 미만 절사 */
const floor10 = (n: number) => Math.floor(n / 10) * 10;

function calcDeductions(
  employee: Employee,
  gross: number,
  settings: Settings,
): DeductionItem[] {
  if (gross <= 0) return [];
  if (employee.payType === 'freelance') {
    const incomeTax = floor10(gross * 0.03);
    const localTax = floor10(incomeTax * 0.1);
    return [
      { label: '사업소득세 (3%)', amount: incomeTax },
      { label: '지방소득세 (0.3%)', amount: localTax },
    ];
  }
  if (employee.payType === 'insured') {
    const r = settings.rates;
    const health = floor10((gross * r.healthInsurance) / 100);
    return [
      { label: `국민연금 (${r.nationalPension}%)`, amount: floor10((gross * r.nationalPension) / 100) },
      { label: `건강보험 (${r.healthInsurance}%)`, amount: health },
      { label: `장기요양 (건보료의 ${r.longTermCare}%)`, amount: floor10((health * r.longTermCare) / 100) },
      { label: `고용보험 (${r.employmentInsurance}%)`, amount: floor10((gross * r.employmentInsurance) / 100) },
    ];
  }
  return [];
}

const toPay = (minutes: number, wage: number, factor = 1) =>
  Math.round((minutes / 60) * wage * factor);

export function calcPayslip(
  data: PayslipData,
  employee: Employee,
  month: MonthStr,
): Payslip {
  const { settings } = data;
  const warnings: string[] = [];

  const monthEntries = data.entries
    .filter((e) => e.employeeId === employee.id && monthOf(e.date) === month)
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date < b.date ? -1 : 1))
    .map(calcEntry);

  for (const c of monthEntries) {
    if (c.workMinutes === 0) {
      warnings.push(`${c.entry.date} 기록의 시각이 올바르지 않아 0시간으로 계산했습니다.`);
    }
  }

  const workMinutes = monthEntries.reduce((s, c) => s + c.workMinutes, 0);
  const nightMinutes = monthEntries.reduce((s, c) => s + c.nightMinutes, 0);
  const basePay = toPay(workMinutes, employee.hourlyWage);

  // 주 단위 항목: 일요일이 이 달인 주만 반영
  const weeks = weekSummaries(data.entries, employee).filter(
    (w) => monthOf(addDays(w.weekStart, 6)) === month,
  );
  const overtimeMinutes = weeks.reduce((s, w) => s + w.overtimeMinutes, 0);
  const allowanceMinutes = weeks.reduce((s, w) => s + w.allowanceMinutes, 0);

  const overtimePay = settings.over5 ? toPay(overtimeMinutes, employee.hourlyWage, 0.5) : 0;
  const nightPay = settings.over5 ? toPay(nightMinutes, employee.hourlyWage, 0.5) : 0;
  const allowancePay = toPay(allowanceMinutes, employee.hourlyWage);

  const monthAdjustments = data.adjustments.filter(
    (a) => a.employeeId === employee.id && a.month === month,
  );
  const extraPays = monthAdjustments.filter((a) => a.kind === 'pay');
  const extraDeducts = monthAdjustments.filter((a) => a.kind === 'deduct');
  const extraPayTotal = extraPays.reduce((s, a) => s + a.amount, 0);

  const grossPay =
    basePay + overtimePay + nightPay + allowancePay + extraPayTotal;

  const deductions = calcDeductions(employee, grossPay, settings);
  const totalDeduction =
    deductions.reduce((s, d) => s + d.amount, 0) +
    extraDeducts.reduce((s, a) => s + a.amount, 0);
  const netPay = grossPay - totalDeduction;

  if (employee.hourlyWage < settings.minWage) {
    warnings.push(
      `시급 ${employee.hourlyWage.toLocaleString()}원이 설정된 최저시급(${settings.minWage.toLocaleString()}원)보다 낮습니다.`,
    );
  }
  if (!settings.over5 && (overtimeMinutes > 0 || nightMinutes > 0)) {
    warnings.push('5인 미만 사업장 설정이라 연장·야간 가산수당(50%)을 적용하지 않았습니다.');
  }
  if (employee.payType === 'insured') {
    warnings.push(
      '4대보험 근로소득세(간이세액표)는 자동 계산하지 않습니다. 필요하면 공제 항목으로 직접 추가하세요.',
    );
  }

  return {
    employee,
    month,
    entries: monthEntries,
    workMinutes,
    basePay,
    nightMinutes,
    nightPay,
    weeks,
    overtimeMinutes,
    overtimePay,
    allowanceMinutes,
    allowancePay,
    extraPays,
    extraDeducts,
    grossPay,
    deductions,
    totalDeduction,
    netPay,
    warnings,
  };
}
