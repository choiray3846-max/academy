/**
 * 학원 지점 달력 – 도메인 타입 정의
 *
 * 모든 날짜는 타임존 문제를 피하기 위해 로컬 기준 'YYYY-MM-DD' 문자열,
 * 모든 시각은 24시간제 'HH:MM' 문자열로 다룬다.
 */

export type ID = string;
/** 'YYYY-MM-DD' */
export type DateStr = string;
/** 'HH:MM' (24시간제) */
export type TimeStr = string;

/** 0 = 일요일 … 6 = 토요일 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 화면 모드(역할). 서버 인증이 아니라 화면 전환용이다. */
export type Role = 'owner' | 'manager' | 'teacher' | 'public';

/** 달력에 올라가는 항목의 종류 */
export type ItemKind = 'class' | 'event' | 'shift' | 'consult';

export interface Branch {
  id: ID;
  name: string;
  /** 달력에서 지점을 구분하는 색 (CSS 색상값) */
  color: string;
  phone?: string;
  address?: string;
  memo?: string;
  archived?: boolean;
}

export interface Room {
  id: ID;
  branchId: ID;
  name: string;
  capacity?: number;
  archived?: boolean;
}

export interface Teacher {
  id: ID;
  name: string;
  /** 소속 지점(겸임 가능) */
  branchIds: ID[];
  subject?: string;
  phone?: string;
  color?: string;
  archived?: boolean;
}

/** 정규 수업 – 요일 반복 규칙을 가진다. */
export interface CourseClass {
  id: ID;
  branchId: ID;
  name: string;
  subject?: string;
  teacherId?: ID;
  roomId?: ID;
  /** 학년/반 표기 (예: '고2 심화A') */
  grade?: string;
  daysOfWeek: Weekday[];
  startTime: TimeStr;
  endTime: TimeStr;
  /** 개강일 */
  startDate: DateStr;
  /** 종강일. 없으면 무기한 */
  endDate?: DateStr;
  /** 이 수업만 따로 쉬는 날 */
  skipDates?: DateStr[];
  color?: string;
  memo?: string;
  /** 학부모·학생 화면에 노출할지 */
  publicVisible?: boolean;
  archived?: boolean;
}

export type EventCategory =
  | 'exam'      // 모의고사·내신 대비
  | 'briefing'  // 설명회·상담주간
  | 'holiday'   // 휴원일 (해당 지점 수업 자동 휴강)
  | 'vacation'  // 방학 특강 등 기간 일정
  | 'etc';

/** 학원 행사·일정 (여러 날에 걸칠 수 있음) */
export interface AcademyEvent {
  id: ID;
  title: string;
  category: EventCategory;
  /** 대상 지점. 빈 배열이면 전 지점 공통 */
  branchIds: ID[];
  startDate: DateStr;
  /** 종료일(포함). 하루짜리면 startDate와 동일 */
  endDate: DateStr;
  allDay: boolean;
  startTime?: TimeStr;
  endTime?: TimeStr;
  memo?: string;
  /** 학부모·학생 화면에 노출할지 */
  publicVisible?: boolean;
}

export type ShiftType = 'work' | 'off' | 'sub';

/** 강사 근무 · 휴무 · 대강 */
export interface Shift {
  id: ID;
  teacherId: ID;
  branchId?: ID;
  type: ShiftType;
  date: DateStr;
  startTime?: TimeStr;
  endTime?: TimeStr;
  /** 대강일 때, 누구의 수업을 대신하는지 */
  subForTeacherId?: ID;
  memo?: string;
}

export type ConsultStatus = 'booked' | 'done' | 'canceled' | 'noshow';

/** 학부모 상담 예약 */
export interface Consultation {
  id: ID;
  branchId: ID;
  date: DateStr;
  startTime: TimeStr;
  endTime: TimeStr;
  studentName: string;
  parentName?: string;
  phone?: string;
  /** 상담 담당자 (강사 목록에서 선택) */
  counselorId?: ID;
  status: ConsultStatus;
  memo?: string;
}

/** 앱 전역 설정 */
export interface Settings {
  academyName: string;
  /** 주간 뷰 시작 시각/종료 시각 */
  dayStartTime: TimeStr;
  dayEndTime: TimeStr;
  /** 관리자 모드로 전환할 때 요구할 PIN. 비어 있으면 묻지 않는다. */
  adminPin: string;
  /** 주 시작 요일 (0=일, 1=월) */
  weekStartsOn: 0 | 1;
  theme: 'light' | 'dark' | 'system';
}

/** localStorage에 통째로 저장되는 데이터 뭉치 */
export interface AcademyData {
  /** 스키마 버전 – 백업 파일 호환성 판단에 쓴다 */
  version: number;
  branches: Branch[];
  rooms: Room[];
  teachers: Teacher[];
  classes: CourseClass[];
  events: AcademyEvent[];
  shifts: Shift[];
  consultations: Consultation[];
  settings: Settings;
}

/** 현재 로그인(화면 모드) 상태 */
export interface Session {
  role: Role;
  /** manager 모드일 때 담당 지점 */
  branchId?: ID;
  /** teacher 모드일 때 본인 */
  teacherId?: ID;
}

/**
 * 특정 날짜에 실제로 달력에 찍히는 한 칸.
 * 반복 수업·기간 행사를 날짜별로 펼친 결과물이다.
 */
export interface Occurrence {
  /** 렌더링용 고유 키 */
  key: string;
  kind: ItemKind;
  /** 원본 레코드 id */
  sourceId: ID;
  date: DateStr;
  allDay: boolean;
  startTime?: TimeStr;
  endTime?: TimeStr;
  title: string;
  subtitle?: string;
  branchId?: ID;
  /** 전 지점 공통 행사처럼 여러 지점에 걸칠 때 */
  branchIds?: ID[];
  teacherId?: ID;
  color: string;
  /** 휴원일과 겹쳐 자동 휴강 처리된 수업 */
  canceled?: boolean;
  cancelReason?: string;
  /** 학부모·학생 화면 노출 여부 */
  publicVisible: boolean;
  /** 기간 일정에서 며칠째인지 (1부터) */
  spanIndex?: number;
  spanTotal?: number;
}
