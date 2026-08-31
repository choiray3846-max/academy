import type { PayslipData } from '../types';

const KEY = 'academy-payslip/data';
export const SCHEMA_VERSION = 1;

function defaults(): PayslipData {
  return {
    version: SCHEMA_VERSION,
    employees: [],
    entries: [],
    adjustments: [],
    settings: {
      businessName: '우리 학원',
      ownerName: '',
      over5: false,
      minWage: 10320, // 2026년 최저시급
      minutesPerSession: 90, // 수업 1회 = 1시간 30분
      rates: {
        nationalPension: 4.5,
        healthInsurance: 3.545,
        longTermCare: 12.95,
        employmentInsurance: 0.9,
      },
    },
  };
}

function migrate(raw: Partial<PayslipData>): PayslipData {
  const base = defaults();
  return {
    version: SCHEMA_VERSION,
    employees: raw.employees ?? [],
    entries: raw.entries ?? [],
    adjustments: raw.adjustments ?? [],
    settings: {
      ...base.settings,
      ...(raw.settings ?? {}),
      rates: { ...base.settings.rates, ...(raw.settings?.rates ?? {}) },
    },
  };
}

export function loadData(): PayslipData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export function saveData(data: PayslipData): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: '브라우저에 저장하지 못했습니다. 저장 공간이 가득 찼거나 시크릿 모드일 수 있습니다.',
    };
  }
}

export function resetData(): PayslipData {
  return defaults();
}

export function exportToJson(data: PayslipData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function importFromJson(text: string): PayslipData {
  const parsed = JSON.parse(text) as Partial<PayslipData>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.employees)) {
    throw new Error('급여 명세서 백업 파일이 아닙니다.');
  }
  return migrate(parsed);
}
