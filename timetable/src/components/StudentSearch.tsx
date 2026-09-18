import { useEffect, useMemo, useRef, useState } from 'react';
import type { Student, Teacher, WeekBoard } from '../types';
import { BLOCK_NAMES, DAY_LABELS, SEATS_PER_GROUP, compareStudents, studentEnrollments } from '../types';
import { weekAvailability } from '../lib/board';

export interface Placement {
  d: number;
  b: number;
  g: number;
  seatNo: number;
  teacherId?: string;
  subject?: string;
}

/** 이번 주 판에서 이 학생이 앉은 자리 목록 (요일·교시 순) */
export function studentPlacements(week: WeekBoard, studentId: string): Placement[] {
  const out: Placement[] = [];
  week.days.forEach((day, d) =>
    day.blocks.forEach((block, b) =>
      block.groups.forEach((group, g) =>
        group.seats.forEach((seat, s) => {
          if (seat.studentId === studentId) {
            out.push({ d, b, g, seatNo: g * SEATS_PER_GROUP + s + 1, teacherId: group.teacherId, subject: seat.subject });
          }
        }),
      ),
    ),
  );
  return out;
}

interface StudentSearchProps {
  students: Student[];
  teachers: Teacher[];
  week: WeekBoard;
  /** 지금 강조 중인 학생 */
  highlightId: string | null;
  onHighlight: (studentId: string | null) => void;
  /** 자리 클릭 → 그 요일 편집 화면으로 */
  onGoTo: (dayIndex: number) => void;
}

/**
 * 학생 검색: 이름을 치면 이번 주에 어디에 배정됐는지(요일·교시·강사·좌석)를
 * 바로 보여 주고, 판에서 그 학생의 자리를 강조한다. Ctrl+F로 열 수 있다.
 */
export function StudentSearch({ students, teachers, week, highlightId, onHighlight, onGoTo }: StudentSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  // Ctrl+F / Cmd+F → 검색창으로. Esc → 닫기·강조 해제
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        setOpen(false);
        onHighlight(null);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHighlight]);

  // 바깥 클릭 → 목록 닫기 (강조는 유지)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return students
      .filter((s) => !s.archived && s.name.toLowerCase().includes(q))
      .sort(compareStudents)
      .slice(0, 12);
  }, [students, q]);

  // 정확히 한 명이면 바로 강조
  useEffect(() => {
    if (matches.length === 1) onHighlight(matches[0].id);
    else if (matches.length === 0 && q) onHighlight(null);
  }, [matches, q, onHighlight]);

  const selected = highlightId ? students.find((s) => s.id === highlightId) : undefined;
  const placements = selected ? studentPlacements(week, selected.id) : [];

  function label(p: Placement): string {
    return `${DAY_LABELS[p.d]} ${BLOCK_NAMES[p.b]}`;
  }

  return (
    <div className="ss-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        className="ss-input"
        placeholder="학생 검색 (Ctrl+F)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="학생 검색"
      />
      {query && (
        <button
          className="ss-clear"
          aria-label="검색 지우기"
          onClick={() => {
            setQuery('');
            onHighlight(null);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {open && q && (
        <div className="ss-panel">
          {matches.length === 0 && <div className="ss-empty">'{query}' 학생이 없습니다</div>}
          {matches.length > 1 && (
            <ul className="ss-list">
              {matches.map((s) => {
                const ps = studentPlacements(week, s.id);
                return (
                  <li key={s.id}>
                    <button
                      className={`ss-item${s.id === highlightId ? ' active' : ''}`}
                      onClick={() => onHighlight(s.id)}
                    >
                      <b>{s.name}</b> <small>{s.grade}</small>
                      <span className="ss-item-where">
                        {ps.length === 0 ? '이번 주 배정 없음' : ps.map(label).join(' · ')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {selected && (
            <div className="ss-detail">
              <div className="ss-detail-head">
                <b>{selected.name}</b> <small>{selected.grade}</small>
                <span className="ss-detail-count">이번 주 {placements.length}회</span>
              </div>
              <div className="ss-subjects">
                {studentEnrollments(selected)
                  .filter((e) => e.weeklyCount > 0)
                  .map((e) => {
                    const first = studentEnrollments(selected)[0]?.subject.trim();
                    const n = placements.filter(
                      (p) => (p.subject?.trim() || first) === e.subject.trim(),
                    ).length;
                    const cls = n < e.weeklyCount ? 'under' : n > e.weeklyCount ? 'over' : 'ok';
                    return (
                      <span key={e.subject} className={`ss-subject ${cls}`}>
                        {e.subject} {n}/{e.weeklyCount}회
                      </span>
                    );
                  })}
              </div>
              {placements.length === 0 ? (
                <div className="ss-empty">이번 주에 배정된 자리가 없습니다</div>
              ) : (
                <ul className="ss-places">
                  {placements.map((p) => (
                    <li key={`${p.d}-${p.b}-${p.seatNo}`}>
                      <button
                        className="ss-place"
                        onClick={() => {
                          onGoTo(p.d);
                          setOpen(false);
                        }}
                        title="이 요일 편집 화면으로"
                      >
                        <b>{label(p)}교시</b>
                        <span>{p.teacherId ? (teacherById.get(p.teacherId)?.name ?? '?') : '강사 없음'}</span>
                        <span>{p.subject || '-'}</span>
                        <span className="ss-seat">{p.seatNo}번</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="ss-avail">
                가능 시간:{' '}
                {weekAvailability(week, selected).length === 0
                  ? '미입력'
                  : DAY_LABELS.map((dl, d) => {
                      const blocks = weekAvailability(week, selected)
                        .filter((k) => k.startsWith(`${d}-`))
                        .map((k) => BLOCK_NAMES[Number(k.split('-')[1])])
                        .join('');
                      return blocks ? `${dl}${blocks}` : null;
                    })
                      .filter(Boolean)
                      .join(' · ')}
                {week.availability?.[selected.id] && <em> (이번 주 변경)</em>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
