// Core domain types for the exam supervision scheduler.

import { createDefaultRooms } from "./defaultRooms";
import { DEFAULT_DUTY_TYPES } from "./fatigueWeights";

export { DEFAULT_DUTY_TYPES } from "./fatigueWeights";

export type Grade = 1 | 2 | 3;

export type RoleType = "정교사" | "기간제" | "강사" | "보건교사" | "영양교사" | "평가담당";

export type DutyTypeName =
  | "정감독"
  | "부감독"
  | "자습감독"
  | "복도감독"
  | "특별실감독"
  | string;

export type DutyType = {
  id: string;
  name: DutyTypeName;
  weight: number;
};

export type Teacher = {
  id: string;
  name: string;
  subject: string;
  roleType: RoleType;
  homeroomGrade?: Grade;
  homeroomClass?: number;
  previousFatigueScore: number;
};

export type GradeSchedule = {
  grade: Grade;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

export type PeriodTime = {
  period: number;
  start: string; // HH:mm
  end: string; // HH:mm
};

export type ExamSlot = {
  id: string;
  date: string; // YYYY-MM-DD
  period: number;
  grade: Grade;
  subject: string;
  classes: number[];
  isMinority?: boolean;
};

export type Room = {
  id: string;
  name: string;
};

export type DutyDemand = {
  id: string;
  date: string;
  period: number;
  roomId: string;
  dutyTypeId: string;
  count: number;
};

/** STEP 3 감독 수요 자동 채우기. noHall = 복도감독 X, withHall = 복도감독 O */
export type DutyDemandFillMode = "noHall" | "withHall";

export type TeacherTimetable = {
  id: string;
  teacherId: string;
  weekday: "월" | "화" | "수" | "목" | "금";
  period: number;
  grade?: Grade;
  className?: string;
  subject?: string;
};

export type Exclude = {
  id: string;
  teacherId: string;
  date?: string;
  period?: number;
  roomId?: string;
  reason?: string;
  /**
   * STEP 7 허용 조건. 값이 있으면 해당 시간대에 이 감독 종류(DutyType.id)만 맡을 수 있다.
   * 없거나 비어 있으면 기존처럼 그 시간대 감독 전체 제외.
   */
  allowedDutyTypeIds?: string[];
};

export type Preassign = {
  id: string;
  teacherId: string;
  dutySlotId: string;
  priority: "fixed" | "preferred";
  reason?: string;
};

export type DutySlot = {
  id: string;
  date: string;
  period: number;
  roomId: string;
  dutyTypeId: string;
};

export type Assignment = {
  id: string;
  teacherId: string;
  dutySlotId: string;
  fixed: boolean;
  fixedReason?: string;
};

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  id: string;
  ruleId: string;
  severity: ValidationSeverity;
  message: string;
  target?: {
    date?: string;
    period?: number;
    roomId?: string;
    teacherId?: string;
    dutySlotId?: string;
  };
};

export type Exam = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;

  carryOverRatio: number;
  gradeSchedule: GradeSchedule[];
  periodCount: number;
  periodTimes: PeriodTime[];

  examSlots: ExamSlot[];
  rooms: Room[];
  dutyDemands: DutyDemand[];
  /** 없으면 복도감독 X */
  dutyDemandFillMode?: DutyDemandFillMode;
  teachers: Teacher[];
  dutyTypes: DutyType[];
  timetable: TeacherTimetable[];
  excludes: Exclude[];
  preassigns: Preassign[];
  dutySlots: DutySlot[];
  assignments: Assignment[];
};

export type ExamMeta = Pick<Exam, "id" | "name" | "createdAt" | "updatedAt">;

export const SCHEMA_VERSION = 1;

export const STEPS = [
  { id: "manage", label: "STEP 0 시험 관리", path: "" },
  { id: "setup", label: "STEP 1 기본사항", path: "setup" },
  { id: "schedule", label: "STEP 2 시험표", path: "schedule" },
  { id: "rooms", label: "STEP 3 감독수요", path: "rooms" },
  { id: "teachers", label: "STEP 4 교사명단", path: "teachers" },
  { id: "duties", label: "STEP 5 곤란도", path: "duties" },
  { id: "timetable", label: "STEP 6 시간표", path: "timetable" },
  { id: "constraints", label: "STEP 7 감독지정/제외", path: "constraints" },
  { id: "slots", label: "STEP 8 감독슬롯", path: "slots" },
  { id: "preassign", label: "STEP 9 우선/고정", path: "preassign" },
  { id: "validate", label: "STEP 10 사전검증", path: "validate" },
  { id: "assign", label: "STEP 11 자동배정", path: "assign" },
  { id: "review", label: "STEP 12 수동수정", path: "review" },
  { id: "balance-hints", label: "STEP 13 감독 균형 힌트", path: "balance-hints" },
  { id: "final-check", label: "STEP 14 최종검토", path: "final-check" },
  { id: "export", label: "STEP 15 출력", path: "export" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export function createEmptyExam(name: string): Exam {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    carryOverRatio: 0.5,
    gradeSchedule: [
      { grade: 1, startDate: "", endDate: "" },
      { grade: 2, startDate: "", endDate: "" },
      { grade: 3, startDate: "", endDate: "" },
    ],
    periodCount: 4,
    periodTimes: [
      { period: 1, start: "09:00", end: "09:50" },
      { period: 2, start: "10:10", end: "11:00" },
      { period: 3, start: "11:20", end: "12:10" },
      { period: 4, start: "13:10", end: "14:00" },
    ],
    examSlots: [],
    rooms: createDefaultRooms(),
    dutyDemands: [],
    dutyDemandFillMode: "noHall",
    teachers: [],
    dutyTypes: DEFAULT_DUTY_TYPES.map((d) => ({ ...d })),
    timetable: [],
    excludes: [],
    preassigns: [],
    dutySlots: [],
    assignments: [],
  };
}

function cryptoRandomId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export { cryptoRandomId as newId };
