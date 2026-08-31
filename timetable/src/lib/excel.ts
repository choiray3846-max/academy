import type { Settings, TimetableData, WeekBoard } from '../types';
import {
  BLOCKS_PER_DAY,
  BLOCK_NAMES,
  DAYS_PER_WEEK,
  DAY_LABELS,
  GROUPS_PER_BLOCK,
  SEATS_PER_GROUP,
  SEATS_PER_BLOCK,
} from '../types';
import { addDays, fromDateStr } from './date';

/**
 * 주간 시간표를 엑셀(.xlsx)로 내보낸다.
 *
 * 기존에 쓰던 구글 스프레드시트와 같은 배치:
 * 요일 6개가 가로로 나란히, 각 요일은 [교시 | T | M | 학생명 | 과목 | 학년 | 좌석],
 * 교시 A/B/C가 세로로 이어지고 강사(T) 칸은 3좌석 묶음으로 병합·노란색.
 *
 * exceljs는 용량이 커서 버튼을 누를 때만 동적으로 불러온다.
 */

const COLS_PER_DAY = 7; // 교시, T, M, 학생명, 과목, 학년, 좌석
const STRIDE = COLS_PER_DAY; // 요일 사이 빈 칸 없이 바로 이어 붙인다

const BORDER_THIN = { style: 'thin' as const, color: { argb: 'FFB0B0B0' } };
const BORDER_MEDIUM = { style: 'medium' as const, color: { argb: 'FF666666' } };
const BORDER_THICK = { style: 'thick' as const, color: { argb: 'FF333333' } };
const BORDERS = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8ECF3' } };
const FILL_TEACHER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF2A8' } };
const FILL_BLOCK = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F4F8' } };

export async function exportWeekToExcel(
  data: TimetableData,
  week: WeekBoard,
  settings: Settings,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]));
  const managerById = new Map(data.managers.map((m) => [m.id, m]));

  // 열 너비
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const base = d * STRIDE + 1;
    const widths = [8, 9, 9, 11, 8, 6, 5];
    widths.forEach((w, i) => {
      ws.getColumn(base + i).width = w;
    });
  }

  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const base = d * STRIDE + 1;
    const date = fromDateStr(addDays(week.weekStart, d));
    const times = d === 5 ? settings.saturdayTimes : settings.weekdayTimes;

    // 1행: 날짜 제목
    ws.mergeCells(1, base, 1, base + COLS_PER_DAY - 1);
    const title = ws.getCell(1, base);
    title.value = `${date.getMonth() + 1}월 ${date.getDate()}일 ${DAY_LABELS[d]}요일`;
    title.font = { bold: true, size: 12 };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = FILL_HEADER;
    ws.getRow(1).height = 22;

    // 2행: 열 머리
    const headers = ['교시', 'T', 'M', '학생명', '과목', '학년', '좌석'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(2, base + i);
      cell.value = h;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = FILL_HEADER;
      cell.border = BORDERS;
    });

    // 교시별 좌석
    for (let b = 0; b < BLOCKS_PER_DAY; b++) {
      const startRow = 3 + b * SEATS_PER_BLOCK;
      const block = week.days[d].blocks[b];

      // 교시 라벨: 병합하지 않고 첫 세 줄에 A / 시작시각 / 끝시각을 나눠 쓴다
      // (기존 스프레드시트와 같은 모양)
      const [timeStart, timeEnd] = (times[b] ?? '').split('~');
      const labelValues = [BLOCK_NAMES[b], timeStart ?? '', timeEnd ?? ''];
      for (let r = 0; r < SEATS_PER_BLOCK; r++) {
        const cell = ws.getCell(startRow + r, base);
        cell.value = labelValues[r] ?? '';
        cell.font = { bold: true, size: r === 0 ? 12 : 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = FILL_BLOCK;
        cell.border = BORDERS;
      }

      for (let g = 0; g < GROUPS_PER_BLOCK; g++) {
        const group = block.groups[g];
        const gRow = startRow + g * SEATS_PER_GROUP;

        // 강사(T) 칸: 3좌석 병합, 배정돼 있으면 노란색
        ws.mergeCells(gRow, base + 1, gRow + SEATS_PER_GROUP - 1, base + 1);
        const tCell = ws.getCell(gRow, base + 1);
        const teacher = group.teacherId ? teacherById.get(group.teacherId) : undefined;
        tCell.value = teacher?.name ?? '';
        tCell.alignment = { horizontal: 'center', vertical: 'middle' };
        tCell.border = BORDERS;
        if (teacher) tCell.fill = FILL_TEACHER;

        for (let sIdx = 0; sIdx < SEATS_PER_GROUP; sIdx++) {
          const row = gRow + sIdx;
          const seat = group.seats[sIdx];
          const student = seat.studentId ? studentById.get(seat.studentId) : undefined;
          const manager = seat.managerId ? managerById.get(seat.managerId) : undefined;

          const values = [
            manager?.name ?? '',
            student?.name ?? '',
            seat.subject ?? '',
            student?.grade ?? '',
            g * SEATS_PER_GROUP + sIdx + 1,
          ];
          values.forEach((v, i) => {
            const cell = ws.getCell(row, base + 2 + i);
            cell.value = v;
            cell.font = { size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = BORDERS;
          });
        }
      }
    }
  }

  /**
   * 구분선 정리: 교시(A/B/C) 사이는 굵은 선, 좌석 3개 그룹 사이는 중간 선,
   * 요일 표의 좌우와 맨 아래는 중간 선으로 둘러서 분할이 또렷하게 보이게 한다.
   */
  const lastRow = 2 + BLOCKS_PER_DAY * SEATS_PER_BLOCK;
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const base = d * STRIDE + 1;
    for (let row = 2; row <= lastRow; row++) {
      for (let c = 0; c < COLS_PER_DAY; c++) {
        const seatIdx = row - 3; // 0부터: 블록 내 좌석 줄 번호 계산용
        const inBody = row >= 3;
        const blockStart = inBody && seatIdx % SEATS_PER_BLOCK === 0;
        const groupStart = inBody && seatIdx % SEATS_PER_GROUP === 0;

        // T열(c=1)은 3줄 병합이라 아래(슬레이브) 칸에 쓰면 대표 칸 테두리를
        // 덮어써 버린다. 대표 줄에서만 병합 전체의 테두리를 한 번에 쓴다.
        if (c === 1 && inBody) {
          if (!groupStart) continue;
          ws.getCell(row, base + c).border = {
            top: blockStart ? BORDER_THICK : BORDER_MEDIUM,
            bottom: row + SEATS_PER_GROUP - 1 === lastRow ? BORDER_MEDIUM : BORDER_MEDIUM,
            left: BORDER_THIN,
            right: BORDER_THIN,
          };
          continue;
        }

        ws.getCell(row, base + c).border = {
          top: blockStart || row === 2 ? BORDER_THICK : groupStart ? BORDER_MEDIUM : BORDER_THIN,
          bottom: row === lastRow ? BORDER_MEDIUM : BORDER_THIN,
          left: c === 0 ? BORDER_MEDIUM : BORDER_THIN,
          right: c === COLS_PER_DAY - 1 ? BORDER_MEDIUM : BORDER_THIN,
        };
      }
    }
  }

  // 파일 내려받기
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `시간표_${week.weekStart}주.xlsx`;
  document.body.appendChild(a); // 일부 브라우저는 문서에 붙어 있어야 파일명이 적용된다
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
