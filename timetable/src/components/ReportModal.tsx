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

const ATTITUDE_SCORE: Record<NonNullable<ReportDay['attitude']>, number> = {
  excellent: 4,
  good: 3,
  normal: 2,
  poor: 1,
};

/** 'HH:MM' 여러 개의 평균 시각 */
function averageTime(times: string[]): string {
  const mins = times
    .filter((t) => /^\d{2}:\d{2}$/.test(t))
    .map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  if (mins.length === 0) return '-';
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
}

/** 4단계 태도 점수를 점(●○)으로 */
function AttitudeDots({ level }: { level?: ReportDay['attitude'] }) {
  if (!level) return <span className="rs-dots rs-dots-empty">○○○○</span>;
  const score = ATTITUDE_SCORE[level];
  return (
    <span className={`rs-dots rs-att-${level}`}>
      {'●'.repeat(score)}
      <span className="rs-dots-off">{'○'.repeat(4 - score)}</span>
    </span>
  );
}

/** 인쇄용 보고서 양식 (학부모 전달용, A4 세로 한 장) */
export function ReportSheet({ data, week, weekStart, studentId }: ReportSheetProps) {
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const report: StudentReport = data.reports?.[weekStart]?.[studentId] ?? EMPTY_REPORT;
  const blocksByDay = studentBlocksByDay(week, studentId);

  // 이번 주 이 학생의 과목·담당 강사·관리 담당 (판에서 수집)
  const subjectSet = new Set<string>();
  const teacherSet = new Set<string>();
  const managerSet = new Set<string>();
  for (const day of week.days) {
    for (const block of day.blocks) {
      for (const g of block.groups) {
        for (const seat of g.seats) {
          if (seat.studentId !== studentId) continue;
          if (seat.subject) subjectSet.add(seat.subject);
          if (g.teacherId) teacherSet.add(g.teacherId);
          if (seat.managerId) managerSet.add(seat.managerId);
        }
      }
    }
  }
  const teacherNames = [...teacherSet].map((id) => data.teachers.find((t) => t.id === id)?.name ?? '').filter(Boolean);
  const managerNames = [...managerSet].map((id) => data.managers.find((m) => m.id === id)?.name ?? '').filter(Boolean);
  const subjects = [...subjectSet];

  const sessionDays = blocksByDay.filter((b) => b.length > 0).length;
  const sessionCount = blocksByDay.reduce((n, b) => n + b.length, 0);
  const recordedDays = Object.values(report.days);
  const avgArrival = averageTime(recordedDays.map((d) => d.arrival ?? ''));
  const avgBedtime = averageTime(recordedDays.map((d) => d.bedtime ?? ''));
  const attitudeScores = recordedDays.map((d) => (d.attitude ? ATTITUDE_SCORE[d.attitude] : 0)).filter((n) => n > 0);
  const avgAttitude = attitudeScores.length
    ? attitudeScores.reduce((a, b) => a + b, 0) / attitudeScores.length
    : 0;
  const attitudeSummary =
    avgAttitude >= 3.5 ? '우수' : avgAttitude >= 2.5 ? '양호' : avgAttitude >= 1.5 ? '보통' : avgAttitude > 0 ? '미흡' : '-';
  const attitudeClass =
    avgAttitude >= 3.5 ? 'excellent' : avgAttitude >= 2.5 ? 'good' : avgAttitude >= 1.5 ? 'normal' : avgAttitude > 0 ? 'poor' : '';

  const issued = new Date();
  const issuedLabel = `${issued.getFullYear()}. ${issued.getMonth() + 1}. ${issued.getDate()}.`;

  return (
    <div className="print-report-sheet">
      {/* 머리글 */}
      <header className="rs-head">
        <div>
          <div className="rs-academy">{data.settings.academyName}</div>
          <h1 className="rs-title">주간 학습 보고서</h1>
          <div className="rs-subtitle">Weekly Learning Report</div>
        </div>
        <div className="rs-head-right">
          <div className="rs-head-label">보고 기간</div>
          <div className="rs-head-value">{weekTitle(weekStart)}</div>
          <div className="rs-head-label">발행일</div>
          <div className="rs-head-value">{issuedLabel}</div>
        </div>
      </header>

      {/* 학생 정보 */}
      <section className="rs-info">
        <div className="rs-info-item"><span className="rs-info-key">학생</span><span className="rs-info-val"><b>{student.name}</b></span></div>
        <div className="rs-info-item"><span className="rs-info-key">학년</span><span className="rs-info-val">{student.grade || '-'}</span></div>
        <div className="rs-info-item"><span className="rs-info-key">과목</span><span className="rs-info-val">{subjects.join(', ') || '-'}</span></div>
        <div className="rs-info-item"><span className="rs-info-key">담당 강사</span><span className="rs-info-val">{teacherNames.join(', ') || '-'}</span></div>
        <div className="rs-info-item"><span className="rs-info-key">관리 담당</span><span className="rs-info-val">{managerNames.join(', ') || '-'}</span></div>
        <div className="rs-info-item"><span className="rs-info-key">수업</span><span className="rs-info-val">주 {sessionDays}일 · {sessionCount}회</span></div>
      </section>

      {/* 한눈에 보기 */}
      <section className="rs-kpis">
        <div className="rs-kpi">
          <div className="rs-kpi-label">출석</div>
          <div className="rs-kpi-value">{recordedDays.filter((d) => d.arrival).length}<small> / {sessionDays}일</small></div>
        </div>
        <div className="rs-kpi">
          <div className="rs-kpi-label">평균 등원</div>
          <div className="rs-kpi-value">{avgArrival}</div>
        </div>
        <div className="rs-kpi">
          <div className="rs-kpi-label">평균 취침</div>
          <div className="rs-kpi-value">{avgBedtime}</div>
        </div>
        <div className={`rs-kpi rs-kpi-att ${attitudeClass ? `rs-att-${attitudeClass}` : ''}`}>
          <div className="rs-kpi-label">학습실 태도</div>
          <div className="rs-kpi-value">{attitudeSummary}</div>
        </div>
      </section>

      {/* 1. 출결 및 생활 기록 */}
      <section className="rs-section">
        <h2 className="rs-h2"><span className="rs-num">1</span>출결 및 생활 기록</h2>
        <table className="rs-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>요일</th>
              <th style={{ width: '12%' }}>수업</th>
              <th style={{ width: '13%' }}>등원</th>
              <th style={{ width: '13%' }}>하원</th>
              <th style={{ width: '13%' }}>취침시간</th>
              <th>특이사항</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: DAYS_PER_WEEK }, (_, d) => {
              const day = report.days[d] ?? {};
              const blocks = blocksByDay[d] ?? [];
              return (
                <tr key={d} className={blocks.length === 0 ? 'no-session' : 'session'}>
                  <td className="rs-day"><b>{DAY_LABELS[d]}</b> <small>{shortDate(addDays(weekStart, d))}</small></td>
                  <td className="rs-blocks">
                    {blocks.length > 0 ? blocks.map((b) => <span key={b} className="rs-block">{b}</span>) : <span className="rs-dash">-</span>}
                  </td>
                  <td className="rs-time">{day.arrival ?? ''}</td>
                  <td className="rs-time">{day.departure ?? ''}</td>
                  <td className="rs-time">{day.bedtime ?? ''}</td>
                  <td className="rs-note">{day.note ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 2. 학습실 태도 평가 */}
      <section className="rs-section">
        <h2 className="rs-h2"><span className="rs-num">2</span>학습실 태도 평가</h2>
        <div className="rs-att-grid">
          {Array.from({ length: DAYS_PER_WEEK }, (_, d) => {
            const day = report.days[d] ?? {};
            const has = (blocksByDay[d] ?? []).length > 0;
            return (
              <div key={d} className={`rs-att-cell${has ? '' : ' no-session'}`}>
                <div className="rs-att-day">{DAY_LABELS[d]}</div>
                <AttitudeDots level={day.attitude} />
                <div className="rs-att-label">{day.attitude ? ATTITUDE_LABEL[day.attitude] : has ? '미기록' : '-'}</div>
              </div>
            );
          })}
        </div>
        <div className="rs-scale">
          <span className="rs-scale-title">평가 척도</span>
          <span><b className="rs-att-excellent">●●●●</b> 우수</span>
          <span><b className="rs-att-good">●●●○</b> 양호</span>
          <span><b className="rs-att-normal">●●○○</b> 보통</span>
          <span><b className="rs-att-poor">●○○○</b> 미흡</span>
        </div>
      </section>

      {/* 3. 종합 의견 */}
      <section className="rs-section">
        <h2 className="rs-h2"><span className="rs-num">3</span>종합 의견</h2>
        <div className="rs-comment-body">{report.comment || ' '}</div>
      </section>

      {/* 확인 */}
      <footer className="rs-foot">
        <div className="rs-sign-box">
          <div className="rs-sign-label">담당 강사</div>
          <div className="rs-sign-name">{teacherNames[0] ?? ''}</div>
          <div className="rs-sign-line">(서명)</div>
        </div>
        <div className="rs-sign-box">
          <div className="rs-sign-label">관리 담당</div>
          <div className="rs-sign-name">{managerNames[0] ?? ''}</div>
          <div className="rs-sign-line">(서명)</div>
        </div>
        <div className="rs-sign-box">
          <div className="rs-sign-label">학부모 확인</div>
          <div className="rs-sign-name">&nbsp;</div>
          <div className="rs-sign-line">(서명)</div>
        </div>
      </footer>
      <div className="rs-footer-bar">{data.settings.academyName} · 본 보고서는 학생의 주간 학습 현황을 학부모님께 안내하기 위해 작성되었습니다.</div>
    </div>
  );
}
