/**
 * 알바 급여 명세서 – 도메인 타입
 *
 * 근무 기록(출퇴근·휴게)을 쌓으면 월별 급여명세서를 자동 계산한다.
 * - 기본급: 근무시간 × 시급
 * - 주휴수당: 한 주(월~일) 15시간 이상 근무한 주에 발생
 * - 연장·야간 가산(50%): 상시 5인 이상 사업장일 때만 적용
 * - 공제: 3.3% 원천징수 / 4대보험 / 없음 중 직원별 선택
 */

export type ID = string;
/** 'YYYY-MM-DD' */
export type DateStr = string;
/** 'YYYY-MM' */
export type MonthStr = string;
/** 'HH:MM' (24시간) */
export type TimeStr = string;

export type PayType = 'freelance' | 'insured' | 'none';

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  freelance: '3.3% 원천징수',
  insured: '4대보험',
  none: '공제 없음',
};

export interface Employee {
  id: ID;
  name: string;
  /** 시급 (원) */
  hourlyWage: number;
  payType: PayType;
  /** 주휴수당 자동 계산 여부 (주 15시간 이상인 주만 발생) */
  weeklyAllowance: boolean;
  joinDate?: DateStr;
  phone?: string;
  /** 지급 계좌 메모 (예: '국민 123-456') */
  bank?: string;
  memo?: string;
  archived?: boolean;
}

export interface WorkEntry {
  id: ID;
  employeeId: ID;
  date: DateStr;
  start: TimeStr;
  /** 시작보다 빠르면 다음 날 퇴근(자정 넘김)으로 본다 */
  end: TimeStr;
  breakMinutes: number;
  memo?: string;
}

/** 명세서에 손으로 더하는 지급/공제 항목 (직원·월 단위) */
export interface Adjustment {
  id: ID;
  employeeId: ID;
  month: MonthStr;
  label: string;
  /** 항상 양수. kind가 지급/공제를 가른다 */
  amount: number;
  kind: 'pay' | 'deduct';
}

/** 4대보험 근로자 부담 요율 (%) — 해마다 바뀌므로 설정에서 수정 */
export interface InsuranceRates {
  nationalPension: number;
  healthInsurance: number;
  /** 장기요양보험: 건강보험료 대비 % */
  longTermCare: number;
  employmentInsurance: number;
}

export interface Settings {
  businessName: string;
  ownerName: string;
  /** 상시 5인 이상 사업장 — 연장·야간 가산수당(50%)은 5인 이상만 의무 */
  over5: boolean;
  /** 최저시급 (경고 표시용) */
  minWage: number;
  rates: InsuranceRates;
}

export interface PayslipData {
  version: number;
  employees: Employee[];
  entries: WorkEntry[];
  adjustments: Adjustment[];
  settings: Settings;
}
