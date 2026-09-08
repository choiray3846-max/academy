import { useMemo, useState } from 'react';
import type { ReportDay, Student, StudentReport, TimetableData, WeekBoard } from '../types';
import { ATTITUDE_LABEL, BLOCK_NAMES, DAYS_PER_WEEK, DAY_LABELS, compareStudents } from '../types';
import { addDays, shortDate, weekTitle } from '../lib/date';
import { Modal } from './Modal';

/** 학생이 그 주 요일마다 앉은 교시 목록 (예: ['A','B']) */
export function studentBlocksByDay(week: WeekBoard, studentId: string): string[][] {
  return week.days.map((day) =>
    day.blocks
      .map((block, b): string | null =>
        block.groups.some((g) => g.seats.some((s) => s.studentId === studentId)) ? String(BLOCK_NAMES[b]) : null,
      )
      .filter((x): x is string => x !== null),
  );
}

const EMPTY_REPORT: StudentReport = { days: {} };

interface ReportModalProps {
  data: TimetableData;
  week: WeekBoard;
  weekStart: string;
  update: (updater: (prev: TimetableData) => TimetableData) => void;
  onPrint: (studentId: string) => void;
  onClose: () => void;
}

/** 학생별 주간 보고서 입력: 등·하원, 취침시간, 학습실 태도 + 종합 의견 */
export function ReportModal({ data, week, weekStart, update, onPrint, onClose }: ReportModalProps) {
  const students = useMemo(
    () => data.students.filter((s) => !s.archived).sort(compareStudents),
    [data.students],
  );
  const attendingIds = useMemo(() => {
    const set = new Set<string>();
    for (const day of week.days) for (const block of day.blocks) for (const g of block.groups) for (const seat of g.seats) {
      if (seat.studentId) set.add(seat.studentId);
    }
    return set;
  }, [week]);

  const [studentId, setStudentId] = useState<string>(
    () => students.find((s) => attendingIds.has(s.id))?.id ?? students[0]?.id ?? '',
  );
  const student: Student | undefined = students.find((s) => s.id === studentId);
  const report: StudentReport = data.reports?.[weekStart]?.[studentId] ?? EMPTY_REPORT;
  const blocksByDay = useMemo(() => (studentId ? studentBlocksByDay(week, studentId) : []), [week, studentId]);

  function patchReport(patch: (prev: StudentReport) => StudentReport) {
    if (!studentId) return;
    update((prev) => {
      const weekReports = prev.reports?.[weekStart] ?? {};
      const current = weekReports[studentId] ?? EMPTY_REPORT;
      const next = { ...patch(current), updatedAt: new Date().toISOString() };
      return { ...prev, reports: { ...(prev.reports ?? {}), [weekStart]: { ...weekReports, [studentId]: next } } };
    });
  }
  function patchDay(d: number, patch: Partial<ReportDay>) {
    patchReport((prev) => ({ ...prev, days: { ...prev.days, [d]: { ...(prev.days[d] ?? {}), ...patch } } }));
  }

  return (
    <Modal
      title={`학생 보고서 · ${weekTitle(weekStart)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose}>닫기</button>
          <button className="primary" disabled={!studentId} onClick={() => studentId && onPrint(studentId)}>
            보고서 인쇄
          </button>
        </>
      }
    >
      <div className="report-layout">
        <aside className="report-students">
          {students.length === 0 && <div className="empty-note">등록된 학생이 없습니다.</div>}
          {students.map((s) => {
            const hasReport = Boolean(data.reports?.[weekStart]?.[s.id]?.updatedAt);
            return (
              <button
                key={s.id}
                className={`report-student${s.id === studentId ? ' active' : ''}`}
                onClick={() => setStudentId(s.id)}
              >
                <span>
                  {s.name} <small>({s.grade})</small>
                </span>
                <span className="report-student-mark">
                  {attendingIds.has(s.id) ? '●' : ''}
                  {hasReport ? ' ✎' : ''}
                </span>
              </button>
            );
          })}
          <p className="hint">● 이번 주 수업 있음 · ✎ 작성됨</p>
        </aside>

        {student ? (
          <div className="report-body">
            <table className="report-table">
              <thead>
                <tr>
                  <th>요일</th>
                  <th>수업</th>
                  <th>등원</th>
                  <th>하원</th>
                  <th>취침시간</th>
                  <th>학습실 태도</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: DAYS_PER_WEEK }, (_, d) => {
                  const day = report.days[d] ?? {};
                  const blocks = blocksByDay[d] ?? [];
                  return (
                    <tr key={d} className={blocks.length === 0 ? 'no-session' : ''}>
                      <td className="report-day">
                        {DAY_LABELS[d]} <small>{shortDate(addDays(weekStart, d))}</small>
                      </td>
                      <td className="report-blocks">{blocks.join('·') || '-'}</td>
                      <td><input type="time" value={day.arrival ?? ''} onChange={(e) => patchDay(d, { arrival: e.target.value || undefined })} /></td>
                      <td><input type="time" value={day.departure ?? ''} onChange={(e) => patchDay(d, { departure: e.target.value || undefined })} /></td>
                      <td><input type="time" value={day.bedtime ?? ''} onChange={(e) => patchDay(d, { bedtime: e.target.value || undefined })} /></td>
                      <td>
                        <select
                          value={day.attitude ?? ''}
                          onChange={(e) => patchDay(d, { attitude: (e.target.value || undefined) as ReportDay['attitude'] })}
                        >
                          <option value="">-</option>
                          {(Object.keys(ATTITUDE_LABEL) as (keyof typeof ATTITUDE_LABEL)[]).map((k) => (
                            <option key={k} value={k}>{ATTITUDE_LABEL[k]}</option>
                          ))}
                        </select>
                      </td>
                      <td><input value={day.note ?? ''} placeholder="특이사항" onChange={(e) => patchDay(d, { note: e.target.value || undefined })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="field" style={{ marginTop: 10 }}>
              <label>종합 의견</label>
              <textarea
                rows={4}
                value={report.comment ?? ''}
                placeholder="이번 주 학습 태도, 진도, 학부모께 전할 말씀 등"
                onChange={(e) => patchReport((prev) => ({ ...prev, comment: e.target.value || undefined }))}
              />
            </div>
            <p className="hint">입력하면 바로 저장됩니다. 수업이 없는 요일은 흐리게 표시되지만 기록은 가능합니다.</p>
          </div>
        ) : (
          <div className="report-body"><div className="empty-note">왼쪽에서 학생을 선택하세요.</div></div>
        )}
      </div>
    </Modal>
  );
}

interface ReportSheetProps {
  data: TimetableData;
  week: WeekBoard;
  weekStart: string;
  studentId: string;
}

/** 인쇄용 보고서 양식 (학부모 전달용, A4 세로 한 장) */
export function ReportSheet({ data, week, weekStart, studentId }: ReportSheetProps) {
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const report: StudentReport = data.reports?.[weekStart]?.[studentId] ?? EMPTY_REPORT;
  const blocksByDay = studentBlocksByDay(week, studentId);
  const subjects = [...new Set(
    week.days.flatMap((day) => day.blocks.flatMap((b) => b.groups.flatMap((g) => g.seats.filter((s) => s.studentId === studentId).map((s) => s.subject ?? '')))),
  )].filter(Boolean);

  return (
    <div className="print-report-sheet">
      <div className="rs-head">
        <div className="rs-academy">{data.settings.academyName}</div>
        <h1 className="rs-title">주간 학습 보고서</h1>
        <div className="rs-meta">
          <span><b>{student.name}</b> ({student.grade})</span>
          {subjects.length > 0 && <span>{subjects.join(' · ')}</span>}
          <span>{weekTitle(weekStart)}</span>
        </div>
      </div>
      <table className="rs-table">
        <thead>
          <tr>
            <th>요일</th>
            <th>수업</th>
            <th>등원</th>
            <th>하원</th>
            <th>취침시간</th>
            <th>학습실 태도</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: DAYS_PER_WEEK }, (_, d) => {
            const day = report.days[d] ?? {};
            const blocks = blocksByDay[d] ?? [];
            return (
              <tr key={d} className={blocks.length === 0 ? 'no-session' : ''}>
                <td>{DAY_LABELS[d]} ({shortDate(addDays(weekStart, d))})</td>
                <td>{blocks.join('·') || '-'}</td>
                <td>{day.arrival ?? ''}</td>
                <td>{day.departure ?? ''}</td>
                <td>{day.bedtime ?? ''}</td>
                <td>{day.attitude ? ATTITUDE_LABEL[day.attitude] : ''}</td>
                <td className="rs-note">{day.note ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="rs-comment">
        <div className="rs-comment-title">종합 의견</div>
        <div className="rs-comment-body">{report.comment || ' '}</div>
      </div>
      <div className="rs-foot">담당 확인: ____________ &nbsp;&nbsp; 학부모 확인: ____________</div>
    </div>
  );
}
