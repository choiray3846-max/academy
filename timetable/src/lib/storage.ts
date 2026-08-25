import type { Student, Teacher, TimetableData } from '../types';
import { studentEnrollments, teacherSubjects } from '../types';

const KEY = 'academy-timetable/data';
export const SCHEMA_VERSION = 1;

function defaults(): TimetableData {
  return {
    version: SCHEMA_VERSION,
    students: [],
    teachers: [],
    managers: [],
    settings: {
      academyName: '우리 학원',
      weekdayTimes: ['5:00~6:30', '6:35~8:05', '8:10~9:40'],
      saturdayTimes: ['12:00~1:30', '1:35~3:05', '3:10~4:40'],
      defaultManagerId: undefined,
    },
    weeks: {},
  };
}

/** 옛 단일 과목 필드(defaultSubject/weeklyCount)를 enrollments로 바꾼다. */
function migrateStudent(s: Student): Student {
  if (s.enrollments && s.enrollments.length > 0) return s;
  if (s.weeklyCount || s.defaultSubject) {
    return {
      ...s,
      enrollments: [{ subject: s.defaultSubject?.trim() ?? '', weeklyCount: s.weeklyCount ?? 0 }],
    };
  }
  return s;
}

/**
 * 옛 학생 단위 강사 관계(teacherPrefs)를 과목별(subjectTeacherPrefs)로 바꾼다.
 * 예전 동작과 같도록, 각 등록 과목마다 그 과목을 가르칠 수 있는 강사의
 * 관계만 남긴다.
 */
function migrateStudentPrefs(s: Student, teachers: Teacher[]): Student {
  if (s.subjectTeacherPrefs || !s.teacherPrefs) return s;
  const byId = new Map(teachers.map((t) => [t.id, t]));
  const out: Record<string, Record<string, 'must' | 'prefer'>> = {};
  for (const e of studentEnrollments(s)) {
    const subj = e.subject.trim();
    const filtered: Record<string, 'must' | 'prefer'> = {};
    for (const [id, level] of Object.entries(s.teacherPrefs)) {
      const t = byId.get(id);
      if (!t) continue;
      const list = teacherSubjects(t);
      if (list.length === 0 || subj === '' || list.includes(subj)) filtered[id] = level;
    }
    if (Object.keys(filtered).length > 0) out[subj] = filtered;
  }
  return {
    ...s,
    subjectTeacherPrefs: Object.keys(out).length > 0 ? out : undefined,
    teacherPrefs: undefined,
  };
}

function migrate(raw: Partial<TimetableData>): TimetableData {
  const base = defaults();
  return {
    version: SCHEMA_VERSION,
    students: (raw.students ?? [])
      .map(migrateStudent)
      .map((s) => migrateStudentPrefs(s, raw.teachers ?? [])),
    teachers: raw.teachers ?? [],
    managers: raw.managers ?? [],
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    weeks: raw.weeks ?? {},
  };
}

export function loadData(): TimetableData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return migrate(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export function saveData(data: TimetableData): { ok: boolean; error?: string } {
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

export function exportToJson(data: TimetableData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function importFromJson(text: string): TimetableData {
  const parsed = JSON.parse(text) as Partial<TimetableData>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
    throw new Error('시간표 백업 파일이 아닙니다.');
  }
  return migrate(parsed);
}
