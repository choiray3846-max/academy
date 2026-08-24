import type { Manager, Student, Teacher, WeekBoard } from '../types';
import { BLOCK_NAMES, DAY_LABELS, SEATS_PER_GROUP } from '../types';
import { addDays, longDayLabel } from '../lib/date';

interface WeekPrintProps {
  week: WeekBoard;
  weekdayTimes: string[];
  saturdayTimes: string[];
  students: Student[];
  teachers: Teacher[];
  managers: Manager[];
}

/**
 * 스프레드시트와 같은 6일 전체 표.
 * 화면의 '주간 전체' 보기와 인쇄 양쪽에 쓴다.
 */
export function WeekPrint({ week, weekdayTimes, saturdayTimes, students, teachers, managers }: WeekPrintProps) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const managerById = new Map(managers.map((m) => [m.id, m]));

  return (
    <div className="week-print">
      {week.days.map((day, d) => {
        const times = d === 5 ? saturdayTimes : weekdayTimes;
        const date = addDays(week.weekStart, d);
        return (
          <table key={d} className="wp-day">
            <thead>
              <tr>
                <th colSpan={7} className="wp-date">{longDayLabel(date, DAY_LABELS[d])}</th>
              </tr>
              <tr className="wp-cols">
                <th className="wp-block"></th>
                <th className="wp-t">T</th>
                <th className="wp-m">M</th>
                <th>학생명</th>
                <th className="wp-subj">과목</th>
                <th className="wp-grade">학년</th>
                <th className="wp-no">좌석</th>
              </tr>
            </thead>
            <tbody>
              {day.blocks.map((block, b) =>
                block.groups.map((group, g) =>
                  group.seats.map((seat, s) => {
                    const seatNo = g * SEATS_PER_GROUP + s + 1;
                    const student = seat.studentId ? studentById.get(seat.studentId) : undefined;
                    const isBlockStart = g === 0 && s === 0;
                    const isGroupStart = s === 0;
                    return (
                      <tr key={`${b}-${seatNo}`} className={isGroupStart ? 'wp-group-start' : ''}>
                        {isBlockStart && (
                          <td rowSpan={12} className="wp-block-cell">
                            <div className="wp-block-name">{BLOCK_NAMES[b]}</div>
                            <div className="wp-block-time">{times[b]}</div>
                          </td>
                        )}
                        {isGroupStart && (
                          <td rowSpan={SEATS_PER_GROUP} className={`wp-t-cell${group.teacherId ? ' filled' : ''}`}>
                            {group.teacherId ? teacherById.get(group.teacherId)?.name ?? '' : ''}
                          </td>
                        )}
                        <td className="wp-m-cell">
                          {seat.managerId ? managerById.get(seat.managerId)?.name ?? '' : ''}
                        </td>
                        <td className="wp-name">{student?.name ?? ''}</td>
                        <td>{seat.studentId ? seat.subject || student?.defaultSubject || '' : ''}</td>
                        <td className="wp-grade-cell">{student?.grade ?? ''}</td>
                        <td className="wp-no-cell">{seatNo}</td>
                      </tr>
                    );
                  }),
                ),
              )}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
