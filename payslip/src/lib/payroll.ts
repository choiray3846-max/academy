/**
 * 급여 계산 규칙
 *
 * - 기본급은 근무한 날짜 기준으로 그 달에 넣는다.
 * - 연장·주휴처럼 한 주(월~일) 단위로 계산되는 항목은
 *   그 주의 일요일이 속한 달의 명세서에 넣는다. (달을 걸치는 주 처리)
 * - 연장근로: 1일 8시간 초과분 + (주 전체 - 1일 초과분)이 40시간을 넘는 부분.
 * - 야간근로: 22:00~06:00와 겹치는 시간. 휴게시간은 근무시간 비율로 차감한다.
 * - 연장·야간 가산(시급의 50%)은 상시 5인 이상 사업장일 때만 지급 의무가 있다.
 * - 주휴수당: 주 15시간 이상 일한 주에
 *   min(주 시간, 40) / 40 × 8시간 × 기본 시급.
 *   주 시간에는 수업·출퇴근 근무(연장 제외)와 DC 업무, 준비시간을 모두 넣는다.
 * - 준비시간: 근무 기록이 있는 날마다 출근일당 준비시간(설정, 기본 30분)을
 *   직원별 준비 시급(없으면 기본 시급)으로 지급.
 *   주휴 계산에는 들어가지만 연장 계산에는 넣지 않는다.
 * - DC 업무: 시간만 기록하고 직원별 DC 시급(없으면 기본 시급)으로 지급.
 *   수업과 급여가 달라 기본급·연장 계산과는 분리하되 주휴 계산에는 넣는다.
 *   DC만 있는 날도 출근일로 세어 준비시간은 붙는다.
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
  /** 휴게를 뺀 실제 근무 분 (DC 업무는 제외) */
  workMinutes: number;
  /** 22~06시와 겹치는 분 (휴게 비례 차감) */
  nightMinutes: number;
  /** DC 업무 분 — 기본급·주휴·연장과 분리해 DC 시급으로 계산 */
  dcMinutes: number;
  /** 직접 입력한 그날 급여(원) — 시간 계산 없이 그대로 지급 */
  customPay: number;
}

/** 야간(22:00~06:00) 구간. 자정 넘김 근무를 위해 이틀치 창을 본다 */
const NIGHT_WINDOWS: Array<[number, number]> = [
  [0, 360],
  [1320, 1800],
  [2760, 2880],
];

export const DEFAULT_MINUTES_PER_SESSION = 90;

export function calcEntry(
  entry: WorkEntry,
  minutesPerSession = DEFAULT_MINUTES_PER_SESSION,
): EntryCalc {
  if (entry.customPay != null && entry.customPay > 0) {
    return { entry, workMinutes: 0, nightMinutes: 0, dcMinutes: 0, customPay: entry.customPay };
  }
  if (entry.dcMinutes && entry.dcMinutes > 0) {
    return { entry, workMinutes: 0, nightMinutes: 0, dcMinutes: entry.dcMinutes, customPay: 0 };
  }
  if (entry.sessions && entry.sessions > 0) {
    // 수업 횟수 기록: 횟수 × 회당 근무시간. 시각이 없으니 야간은 0
    return {
      entry,
      workMinutes: entry.sessions * minutesPerSession,
      nightMinutes: 0,
      dcMinutes: 0,
      customPay: 0,
    };
  }
  const start = parseTime(entry.start ?? '');
  let end = parseTime(entry.end ?? '');
  if (start === null || end === null) {
    return { entry, workMinutes: 0, nightMinutes: 0, dcMinutes: 0, customPay: 0 };
  }
  if (end <= start) end += 24 * 60; // 다음 날 퇴근
  const span = end - start;
  const workMinutes = Math.max(0, span - (entry.breakMinutes || 0));
  let nightRaw = 0;
  for (const [a, b] of NIGHT_WINDOWS) {
    nightRaw += Math.max(0, Math.min(end, b) - Math.max(start, a));
  }
  const nightMinutes = span === 0 ? 0 : Math.round((nightRaw * workMinutes) / span);
  return { entry, workMinutes, nightMinutes, dcMinutes: 0, customPay: 0 };
}

export interface WeekSummary {
  /** 그 주 월요일 */
  weekStart: DateStr;
  /** 주 전체 근무 분 — 수업·출퇴근 기록 (달 경계와 무관) */
  minutes: number;
  /** 그 주의 DC 업무 분 (주휴 계산에 포함) */
  dcMinutes: number;
  /** 그 주의 준비시간 분, 지각 차감 반영 (주휴 계산에 포함) */
  prepMinutes: number;
  overtimeMinutes: number;
  /** 주휴수당으로 환산되는 분 (미발생이면 0) */
  allowanceMinutes: number;
}

/** 주 단위 계산에 필요한 설정 값 */
export interface WeekCalcSettings {
  minutesPerSession: number;
  prepMinutesPerDay: number;
  latePrepDeductMinutes: number;
}

const DEFAULT_WEEK_SETTINGS: WeekCalcSettings = {
  minutesPerSession: DEFAULT_MINUTES_PER_SESSION,
  prepMinutesPerDay: 0,
  latePrepDeductMinutes: 0,
};

/** 한 주(월~일) 근무를 요약한다. entries는 그 주의 기록만 */
function summarizeWeek(
  weekStart: DateStr,
  entries: WorkEntry[],
  allowanceEnabled: boolean,
  s: WeekCalcSettings,
): WeekSummary {
  const byDay = new Map<DateStr, number>();
  let total = 0;
  let dcTotal = 0;
  const attendedDays = new Set<DateStr>();
  const lateDays = new Set<DateStr>();
  for (const e of entries) {
    const { workMinutes, dcMinutes } = calcEntry(e, s.minutesPerSession);
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + workMinutes);
    total += workMinutes;
    dcTotal += dcMinutes;
    if (workMinutes > 0 || dcMinutes > 0) {
      attendedDays.add(e.date);
      if (e.late) lateDays.add(e.date);
    }
  }
  // 연장은 수업·출퇴근 근무시간만으로 계산한다
  let dailyOver = 0;
  for (const minutes of byDay.values()) dailyOver += Math.max(0, minutes - DAY_LIMIT);
  const weeklyOver = Math.max(0, total - dailyOver - WEEK_LIMIT);
  const overtimeMinutes = dailyOver + weeklyOver;

  // 그 주 준비시간 (지급 계산과 같은 규칙: 출근일 × 일당 준비시간 − 지각 차감)
  const lateDeduct = Math.min(s.latePrepDeductMinutes, s.prepMinutesPerDay);
  const prepMinutes = attendedDays.size * s.prepMinutesPerDay - lateDays.size * lateDeduct;

  // 주휴는 (연장 제외 근무) + DC + 준비시간을 모두 넣어 계산한다
  const regular = total - overtimeMinutes + dcTotal + prepMinutes;
  const allowanceMinutes =
    allowanceEnabled && regular >= ALLOWANCE_MIN
      ? Math.round((Math.min(regular, WEEK_LIMIT) / WEEK_LIMIT) * DAY_LIMIT)
      : 0;
  return {
    weekStart,
    minutes: total,
    dcMinutes: dcTotal,
    prepMinutes,
    overtimeMinutes,
    allowanceMinutes,
  };
}

/** 직원의 전체 기록을 주 단위로 묶어 요약한다 */
export function weekSummaries(
  allEntries: WorkEntry[],
  employee: Employee,
  settings: Partial<WeekCalcSettings> = {},
): WeekSummary[] {
  const s: WeekCalcSettings = {
    ...DEFAULT_WEEK_SETTINGS,
    ...settings,
    // 준비수당 미적용 직원은 준비시간도 주휴 계산에 넣지 않는다
    prepMinutesPerDay:
      employee.prepEnabled === false ? 0 : settings.prepMinutesPerDay ?? 0,
  };
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
    .map(([ws, list]) => summarizeWeek(ws, list, employee.weeklyAllowance, s));
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
  /** 이 달의 출근일 수 (근무 기록이 있는 날짜 수) */
  prepDays: number;
  /** 지각으로 준비시간이 차감된 날 수 */
  prepLateDays: number;
  prepMinutes: number;
  prepPay: number;
  dcMinutes: number;
  dcPay: number;
  /** 직접 입력한 급여 합계와 건수 */
  customPayTotal: number;
  customPayCount: number;
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
    .sort((a, b) =>
      a.date === b.date
        ? (a.start ?? '').localeCompare(b.start ?? '')
        : a.date < b.date
          ? -1
          : 1,
    )
    .map((e) => calcEntry(e, settings.minutesPerSession));

  for (const c of monthEntries) {
    if (c.workMinutes === 0 && c.dcMinutes === 0 && c.customPay === 0) {
      warnings.push(`${c.entry.date} 기록의 시각이 올바르지 않아 0시간으로 계산했습니다.`);
    }
  }

  const workMinutes = monthEntries.reduce((s, c) => s + c.workMinutes, 0);
  const nightMinutes = monthEntries.reduce((s, c) => s + c.nightMinutes, 0);
  const basePay = toPay(workMinutes, employee.hourlyWage);

  // 주 단위 항목: 일요일이 이 달인 주만 반영
  const weeks = weekSummaries(data.entries, employee, settings).filter(
    (w) => monthOf(addDays(w.weekStart, 6)) === month,
  );
  const overtimeMinutes = weeks.reduce((s, w) => s + w.overtimeMinutes, 0);
  const allowanceMinutes = weeks.reduce((s, w) => s + w.allowanceMinutes, 0);

  const overtimePay = settings.over5 ? toPay(overtimeMinutes, employee.hourlyWage, 0.5) : 0;
  const nightPay = settings.over5 ? toPay(nightMinutes, employee.hourlyWage, 0.5) : 0;
  const allowancePay = toPay(allowanceMinutes, employee.hourlyWage);

  // 준비시간: 근무 기록이 있는 날마다 (같은 날 여러 기록이어도 1일, DC만 있는 날도 출근)
  // 직원별로 적용을 끌 수 있다 (prepEnabled === false)
  // 지각한 날은 준비시간에서 설정된 분(기본 15분)을 차감한다
  const attended = monthEntries.filter((c) => c.workMinutes > 0 || c.dcMinutes > 0);
  const prepDays =
    employee.prepEnabled === false ? 0 : new Set(attended.map((c) => c.entry.date)).size;
  const prepLateDays =
    employee.prepEnabled === false
      ? 0
      : new Set(attended.filter((c) => c.entry.late).map((c) => c.entry.date)).size;
  const lateDeduct = Math.min(settings.latePrepDeductMinutes, settings.prepMinutesPerDay);
  const prepMinutes = prepDays * settings.prepMinutesPerDay - prepLateDays * lateDeduct;
  const prepPay = toPay(prepMinutes, employee.prepWage ?? employee.hourlyWage);

  // DC 업무: 직원별 DC 시급으로 계산 (없으면 기본 시급)
  const dcMinutes = monthEntries.reduce((s, c) => s + c.dcMinutes, 0);
  const dcPay = toPay(dcMinutes, employee.dcWage ?? employee.hourlyWage);

  // 직접 입력한 급여: 입력한 금액 그대로 지급
  const customEntries = monthEntries.filter((c) => c.customPay > 0);
  const customPayTotal = customEntries.reduce((s, c) => s + c.customPay, 0);
  const customPayCount = customEntries.length;

  const monthAdjustments = data.adjustments.filter(
    (a) => a.employeeId === employee.id && a.month === month,
  );
  const extraPays = monthAdjustments.filter((a) => a.kind === 'pay');
  const extraDeducts = monthAdjustments.filter((a) => a.kind === 'deduct');
  const extraPayTotal = extraPays.reduce((s, a) => s + a.amount, 0);

  const grossPay =
    basePay +
    overtimePay +
    nightPay +
    allowancePay +
    prepPay +
    dcPay +
    customPayTotal +
    extraPayTotal;

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
    prepDays,
    prepLateDays,
    prepMinutes,
    prepPay,
    dcMinutes,
    dcPay,
    customPayTotal,
    customPayCount,
    extraPays,
    extraDeducts,
    grossPay,
    deductions,
    totalDeduction,
    netPay,
    warnings,
  };
}
