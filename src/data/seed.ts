import type { AcademyData, EventTemplate } from '../types';
import { addDays, startOfMonth, today } from '../lib/date';

/**
 * 처음 실행했을 때 보여 줄 예시 데이터.
 *
 * 날짜는 '오늘'을 기준으로 만들어져서 언제 열어도 이번 달에 일정이 보인다.
 * 실제로 쓸 때는 [설정 → 전체 초기화]로 지우고 우리 학원 정보를 넣으면 된다.
 */
/** 처음 시작할 때 넣어 주는 자주 쓰는 일정 틀 */
export function defaultEventTemplates(): EventTemplate[] {
  return [
    { id: 'tp1', title: '지점휴무', category: 'holiday', allDay: true },
    { id: 'tp2', title: '학습실 오픈', category: 'etc', allDay: false, startTime: '11:00', endTime: '19:00' },
  ];
}

export function createSeedData(): AcademyData {
  const t = today();
  const monthStart = startOfMonth(t);

  return {
    version: 1,
    settings: {
      academyName: '예시 학원',
      dayStartTime: '09:00',
      dayEndTime: '23:00',
      adminPin: '',
      weekStartsOn: 0,
      theme: 'system',
    },
    branches: [{ id: 'b1', name: '본원', color: '#2f6fed' }],
    rooms: [
      { id: 'r1', branchId: 'b1', name: '101호', capacity: 20 },
      { id: 'r2', branchId: 'b1', name: '102호', capacity: 16 },
      { id: 'r3', branchId: 'b1', name: '상담실', capacity: 4 },
    ],
    teachers: [
      { id: 't1', name: '김선우', branchIds: ['b1'], subject: '수학', color: '#7048e8', annualLeaveTotal: 15 },
      { id: 't2', name: '이하늘', branchIds: ['b1'], subject: '영어', color: '#0ca678', annualLeaveTotal: 15 },
      { id: 't3', name: '박도윤', branchIds: ['b1'], subject: '국어', color: '#e8590c', annualLeaveTotal: 11 },
      { id: 't4', name: '정서연', branchIds: ['b1'], subject: '과학', color: '#1c7ed6', annualLeaveTotal: 15 },
    ],
    // 수업 시간표는 운영 방식 확정 전이라 비워 둔다 (schedule.ts의 CLASS_MODULE_ENABLED 참고)
    classes: [
    ],
    events: [
      {
        id: 'e1',
        title: '모의고사',
        category: 'exam',
        branchIds: [],
        startDate: addDays(monthStart, 9),
        endDate: addDays(monthStart, 9),
        allDay: false,
        startTime: '09:00',
        endTime: '17:00',
        memo: '전 학년 응시.',
        publicVisible: true,
      },
      {
        id: 'e2',
        title: '학부모 설명회',
        category: 'briefing',
        branchIds: [],
        startDate: addDays(monthStart, 16),
        endDate: addDays(monthStart, 16),
        allDay: false,
        startTime: '19:00',
        endTime: '21:00',
        publicVisible: true,
      },
      {
        id: 'e3',
        title: '휴원일',
        category: 'holiday',
        branchIds: [],
        startDate: addDays(monthStart, 21),
        endDate: addDays(monthStart, 21),
        allDay: true,
        memo: '내부 연수로 휴원합니다.',
        publicVisible: true,
      },
      {
        id: 'e4',
        title: '겨울 특강 주간',
        category: 'vacation',
        branchIds: [],
        startDate: addDays(monthStart, 24),
        endDate: addDays(monthStart, 28),
        allDay: true,
        publicVisible: true,
      },
    ],
    shifts: [
      {
        id: 's1',
        teacherId: 't2',
        branchId: 'b1',
        type: 'off',
        date: addDays(monthStart, 11),
        leaveDays: 1,
        memo: '연차 사용',
      },
      {
        id: 's2',
        teacherId: 't1',
        branchId: 'b1',
        type: 'sub',
        date: addDays(monthStart, 11),
        startTime: '17:00',
        endTime: '19:00',
        subForTeacherId: 't2',
        memo: '이하늘 강사 중3 영어 대강',
      },
      {
        id: 's3',
        teacherId: 't4',
        branchId: 'b1',
        type: 'work',
        date: addDays(monthStart, 13),
        startTime: '13:00',
        endTime: '18:00',
        memo: '고3 개별 질의응답',
      },
    ],
    eventTemplates: defaultEventTemplates(),
    consultations: [
      {
        id: 'k1',
        branchId: 'b1',
        date: addDays(monthStart, 6),
        startTime: '15:00',
        endTime: '15:40',
        studentName: '김민준',
        parentName: '김○○ 학부모',
        phone: '010-0000-0001',
        counselorId: 't2',
        status: 'booked',
        memo: '내신 대비 반 배정 문의',
      },
      {
        id: 'k2',
        branchId: 'b1',
        date: addDays(monthStart, 6),
        startTime: '16:00',
        endTime: '16:40',
        studentName: '이서아',
        phone: '010-0000-0002',
        counselorId: 't3',
        status: 'booked',
      },
      {
        id: 'k3',
        branchId: 'b1',
        date: addDays(monthStart, 14),
        startTime: '11:00',
        endTime: '11:40',
        studentName: '박지호',
        counselorId: 't4',
        status: 'done',
        memo: '고3 정시 상담 완료',
      },
    ],
  };
}

/** 예시 데이터를 지운 빈 상태 (설정만 남긴다) */
export function createEmptyData(): AcademyData {
  const seed = createSeedData();
  return {
    version: seed.version,
    settings: { ...seed.settings, academyName: '우리 학원' },
    // 화면에는 안 보이지만 상담 등 레코드가 지점 id를 요구하므로 기본 1개는 둔다.
    branches: [{ id: 'b1', name: '우리 학원', color: '#2f6fed' }],
    rooms: [],
    teachers: [],
    classes: [],
    events: [],
    eventTemplates: defaultEventTemplates(),
    shifts: [],
    consultations: [],
  };
}
