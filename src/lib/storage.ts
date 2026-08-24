import type { AcademyData, Session } from '../types';
import { createSeedData } from '../data/seed';

const DATA_KEY = 'academy-calendar/data';
const SESSION_KEY = 'academy-calendar/session';

export const SCHEMA_VERSION = 1;

/**
 * 저장소 계층.
 *
 * 지금은 localStorage 한 곳만 쓰지만, 나중에 서버를 붙이더라도
 * 이 파일의 load/save만 바꾸면 되도록 앱 나머지에서 직접
 * localStorage를 만지지 않는다.
 */

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 저장된 데이터를 읽는다. 없거나 깨졌으면 예시 데이터로 시작한다. */
export function loadData(): AcademyData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DATA_KEY);
  } catch {
    // 시크릿 모드 등 localStorage 접근 자체가 막힌 경우
    return createSeedData();
  }
  const parsed = safeParse<AcademyData>(raw);
  if (!parsed || typeof parsed !== 'object') return createSeedData();
  return migrate(parsed);
}

export function saveData(data: AcademyData): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'QuotaExceededError'
        ? '브라우저 저장 공간이 가득 찼습니다. 백업 파일로 내보낸 뒤 오래된 일정을 정리해 주세요.'
        : '브라우저에 저장하지 못했습니다. 시크릿 모드이거나 저장이 차단되어 있을 수 있습니다.';
    return { ok: false, error: msg };
  }
}

export function loadSession(): Session | null {
  try {
    return safeParse<Session>(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // 저장 못 해도 이번 세션 동안은 정상 동작하므로 조용히 넘어간다.
  }
}

export function clearAll(): void {
  try {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

/** 구버전 데이터에 빠진 필드를 채워 넣는다. */
function migrate(data: Partial<AcademyData>): AcademyData {
  const base = createSeedData();
  return {
    version: SCHEMA_VERSION,
    branches: data.branches ?? [],
    rooms: data.rooms ?? [],
    teachers: data.teachers ?? [],
    classes: data.classes ?? [],
    events: data.events ?? [],
    shifts: data.shifts ?? [],
    consultations: data.consultations ?? [],
    settings: { ...base.settings, ...(data.settings ?? {}) },
  };
}

/** 백업 파일(JSON) 문자열 만들기 */
export function exportToJson(data: AcademyData): string {
  return JSON.stringify({ ...data, version: SCHEMA_VERSION, exportedAt: new Date().toISOString() }, null, 2);
}

/** 백업 파일 문자열 → 데이터. 형식이 아니면 에러를 던진다. */
export function importFromJson(text: string): AcademyData {
  const parsed = safeParse<Partial<AcademyData>>(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON 형식이 아닙니다.');
  }
  if (!Array.isArray(parsed.branches) || !Array.isArray(parsed.classes)) {
    throw new Error('학원 달력 백업 파일이 아닙니다. (지점·수업 정보를 찾을 수 없습니다)');
  }
  return migrate(parsed);
}
