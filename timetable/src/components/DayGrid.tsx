import type { Conflict } from '../lib/board';
import { studentEnrollments } from '../types';
import type { DayBoard, Manager, SeatAssign, Student, Teacher } from '../types';
import { BLOCK_NAMES, SEATS_PER_GROUP } from '../types';

interface DayGridProps {
  day: DayBoard;
  /** 이 요일의 교시 시간 라벨 3개 */
  times: string[];
  students: Student[];
  teachers: Teacher[];
  managers: Manager[];
  conflicts: Conflict[];
  onSetTeacher: (blockIndex: number, groupIndex: number, teacherId: string | undefined) => void;
  onSetSeat: (blockIndex: number, groupIndex: number, seatIndex: number, patch: Partial<SeatAssign>) => void;
  onClearSeat: (blockIndex: number, groupIndex: number, seatIndex: number) => void;
}

/** 하루치 판: 교시 3개 × (그룹 4 × 좌석 3) 편집 그리드 */
export function DayGrid({
  day,
  times,
  students,
  teachers,
  managers,
  conflicts,
  onSetTeacher,
  onSetSeat,
  onClearSeat,
}: DayGridProps) {
  const activeStudents = students.filter((s) => !s.archived);
  const activeTeachers = teachers.filter((t) => !t.archived);
  const activeManagers = managers.filter((m) => !m.archived);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const conflictStudentSeats = new Set<string>(); // 'block:seatNo'
  const conflictTeacherGroups = new Set<string>(); // 'block:groupIdx'
  for (const c of conflicts) {
    if (c.type === 'student') {
      for (const p of c.positions) conflictStudentSeats.add(`${c.blockIndex}:${p}`);
    } else {
      for (const p of c.positions) conflictTeacherGroups.add(`${c.blockIndex}:${p - 1}`);
    }
  }

  return (
    <div className="day-grid">
      {day.blocks.map((block, b) => (
        <section key={b} className="block-card">
          <header className="block-head">
            <span className="block-name">{BLOCK_NAMES[b]}교시</span>
            <span className="block-time">{times[b]}</span>
          </header>
          <table className="block-table">
            <thead>
              <tr>
                <th className="col-t">담당 강사 (T)</th>
                <th className="col-no">좌석</th>
                <th>학생</th>
                <th className="col-subj">과목</th>
                <th className="col-grade">학년</th>
                <th className="col-m">관리 (M)</th>
                <th className="col-x"></th>
              </tr>
            </thead>
            <tbody>
              {block.groups.map((group, g) =>
                group.seats.map((seat, s) => {
                  const seatNo = g * SEATS_PER_GROUP + s + 1;
                  const student = seat.studentId ? studentById.get(seat.studentId) : undefined;
                  const dupSeat = conflictStudentSeats.has(`${b}:${seatNo}`);
                  const dupTeacher = conflictTeacherGroups.has(`${b}:${g}`);
                  return (
                    <tr key={seatNo} className={s === 0 ? 'group-start' : ''}>
                      {s === 0 && (
                        <td rowSpan={SEATS_PER_GROUP} className={`cell-t${dupTeacher ? ' dup' : ''}`}>
                          <select
                            value={group.teacherId ?? ''}
                            onChange={(e) => onSetTeacher(b, g, e.target.value || undefined)}
                          >
                            <option value="">-</option>
                            {activeTeachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {dupTeacher && <div className="dup-note">강사 겹침</div>}
                        </td>
                      )}
                      <td className="cell-no">{seatNo}</td>
                      <td className={dupSeat ? 'dup' : ''}>
                        <select
                          value={seat.studentId ?? ''}
                          onChange={(e) => onSetSeat(b, g, s, { studentId: e.target.value || undefined })}
                        >
                          <option value="">-</option>
                          {activeStudents.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name} ({st.grade})
                            </option>
                          ))}
                        </select>
                        {dupSeat && <div className="dup-note">같은 교시에 중복 배정</div>}
                      </td>
                      <td>
                        <input
                          value={seat.subject ?? ''}
                          placeholder={student ? studentEnrollments(student)[0]?.subject ?? '' : ''}
                          onChange={(e) => onSetSeat(b, g, s, { subject: e.target.value })}
                          disabled={!seat.studentId}
                        />
                      </td>
                      <td className="cell-grade">{student?.grade ?? ''}</td>
                      <td>
                        <select
                          value={seat.managerId ?? ''}
                          onChange={(e) => onSetSeat(b, g, s, { managerId: e.target.value || undefined })}
                          disabled={!seat.studentId}
                        >
                          <option value="">-</option>
                          {activeManagers.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="cell-x">
                        {seat.studentId && (
                          <button className="icon" title="좌석 비우기" onClick={() => onClearSeat(b, g, s)}>×</button>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
