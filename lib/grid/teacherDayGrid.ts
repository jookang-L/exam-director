import type { Assignment, DutySlot, Exam, ExamSlot, Grade, Teacher, TeacherTimetable } from "@/lib/types";
import { teacherTotalFatigue } from "@/lib/algorithm/fatigue";
import { timetableConflict } from "@/lib/algorithm/constraints";
import { compareDutyTypesByDisplayOrder } from "@/lib/grid/periodDutyRows";

export type TeacherGridColumn = {
  key: string;
  period: number;
  dutyTypeId: string;
  dutyTypeName: string;
  shortLabel: string;
  hasSlots: boolean;
  isFirstInPeriod: boolean;
  isPadding?: boolean;
};

export type TeacherGridPeriodGroup = {
  period: number;
  columns: TeacherGridColumn[];
  examEntries: PeriodExamEntry[];
};

export type TeacherCellData = {
  slot: DutySlot;
  assignment: Assignment;
  roomName: string;
};

export type TeacherDutyCounts = {
  chief: number;
  assistant: number;
  selfStudy: number;
};

export type TeacherFatigueBreakdown = {
  previous: number;
  current: number;
  total: number;
};

export type PeriodExamEntry = {
  grade: Grade;
  subject: string;
  classesLabel: string | null;
};

/** 정·부·자습 열 공통 너비 (rem) */
export const TEACHER_GRID_DUTY_COL_REM = 3.25;

export const TEACHER_GRID_DUTY_COL_CLASS =
  "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] box-border";

/** 교사명 열 */
export const TEACHER_GRID_NAME_COL_CLASS =
  "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] box-border";

/** 피로도 요약 열 */
export const TEACHER_GRID_FATIGUE_COL_CLASS =
  "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] box-border";

/** 정·부·자습 횟수 요약 열 */
export const TEACHER_GRID_COUNT_COL_CLASS =
  "w-[2.1rem] min-w-[2.1rem] max-w-[2.1rem] box-border";

export const TEACHER_GRID_NAME_COL_REM = 4.5;
export const TEACHER_GRID_FATIGUE_COL_REM = 3.25;
export const TEACHER_GRID_FATIGUE_COL_COUNT = 3;
export const TEACHER_GRID_COUNT_COL_REM = 2.1;
export const TEACHER_GRID_SUMMARY_COL_COUNT = 3;
export const TEACHER_GRID_FIXED_COL_COUNT =
  1 + TEACHER_GRID_FATIGUE_COL_COUNT + TEACHER_GRID_SUMMARY_COL_COUNT;

export const TEACHER_GRID_FATIGUE_COLUMNS = [
  { key: "previous", label: "이전", title: "이전피로도" },
  { key: "current", label: "현", title: "현피로도" },
  { key: "total", label: "누적", title: "누적(총피로도)" },
] as const;

export const TEACHER_GRID_DUTY_COUNT_COLUMNS = [
  { key: "chief", label: "정", dutyName: "정감독" },
  { key: "assistant", label: "부", dutyName: "부감독" },
  { key: "selfStudy", label: "자습", dutyName: "자습감독" },
] as const;

/** STEP 12 교사별 감독표 스크롤 영역 (기존 min(70vh,900px) 대비 약 2배) */
export const TEACHER_GRID_SCROLL_CLASS =
  "h-[min(calc(100vh-10rem),1800px)] overflow-auto";

/** 정규 수업이 있는 교시 셀 배경 (쨍한 노랑) */
export const TEACHER_GRID_CLASS_SHADE_CLASS = "bg-yellow-300";
export const TEACHER_GRID_CLASS_TEXT_CLASS = "text-yellow-950 font-medium";

export const TEACHER_GRID_CLASS_EXCEL = {
  fill: "FFFACC15",
  font: "FF854D0E",
} as const;

/** STEP 7 제외 — 해당 교시·슬롯 */
export const TEACHER_GRID_EXCLUDE_SHADE_CLASS = "bg-red-100";
export const TEACHER_GRID_EXCLUDE_TEXT_CLASS = "text-red-900";

export const TEACHER_GRID_EXCLUDE_EXCEL = {
  fill: "FFFEE2E2",
  font: "FF7F1D1D",
} as const;

const SHORT_LABELS: Record<string, string> = {
  정감독: "정",
  부감독: "부",
  자습감독: "자습",
  복도감독: "복도",
  특별실감독: "특별",
};

const STANDARD_DUTY_NAMES = ["정감독", "부감독", "자습감독"] as const;
const STANDARD_DUTY_COL_COUNT = STANDARD_DUTY_NAMES.length;

export function dutyTypeShortLabel(name: string): string {
  return SHORT_LABELS[name] ?? name.slice(0, 2);
}

export function periodGroupEdgeClass(isFirstInPeriod: boolean): string {
  return isFirstInPeriod ? "border-l-2 border-l-primary/50" : "";
}

export function periodHeaderBgClass(periodIndex: number): string {
  return periodIndex % 2 === 0 ? "bg-muted/95" : "bg-muted/75";
}

function formatExamClassesLabel(slot: ExamSlot): string | null {
  if (slot.classes.length === 0) return null;
  if (slot.isMinority || slot.classes.length <= 8) {
    return `${slot.classes.join("·")}반`;
  }
  return null;
}

export function getPeriodExamEntries(exam: Exam, date: string, period: number): PeriodExamEntry[] {
  return exam.examSlots
    .filter((s) => s.date === date && s.period === period)
    .sort((a, b) => a.grade - b.grade)
    .map((s) => ({
      grade: s.grade,
      subject: s.subject,
      classesLabel: formatExamClassesLabel(s),
    }));
}

export function formatPeriodExamEntry(entry: PeriodExamEntry): string {
  const base = `${entry.grade}학년 ${entry.subject}`;
  return entry.classesLabel ? `${base} (${entry.classesLabel})` : base;
}

/** 선택한 날짜의 (교시 × 감독종류) 열 그룹 — 교시마다 정·부·자습 3열 고정 */
export function teacherGridPeriodGroupsForDate(
  exam: Exam,
  date: string,
  periods: number[],
): TeacherGridPeriodGroup[] {
  const standardSet = new Set<string>(STANDARD_DUTY_NAMES);
  const groups: TeacherGridPeriodGroup[] = [];

  for (const period of periods) {
    const periodHasSlot = exam.dutySlots.some((s) => s.date === date && s.period === period);
    if (!periodHasSlot) continue;

    const columns: TeacherGridColumn[] = [];

    for (let i = 0; i < STANDARD_DUTY_NAMES.length; i++) {
      const name = STANDARD_DUTY_NAMES[i];
      const dt = exam.dutyTypes.find((d) => d.name === name);
      if (!dt) continue;
      const hasSlots = exam.dutySlots.some(
        (s) => s.date === date && s.period === period && s.dutyTypeId === dt.id,
      );
      columns.push({
        key: `${period}|${dt.id}`,
        period,
        dutyTypeId: dt.id,
        dutyTypeName: dt.name,
        shortLabel: dutyTypeShortLabel(dt.name),
        hasSlots,
        isFirstInPeriod: i === 0,
      });
    }

    const extraTypes = exam.dutyTypes
      .filter(
        (dt) =>
          !standardSet.has(dt.name as (typeof STANDARD_DUTY_NAMES)[number]) &&
          exam.dutySlots.some(
            (s) => s.date === date && s.period === period && s.dutyTypeId === dt.id,
          ),
      )
      .sort(compareDutyTypesByDisplayOrder);

    extraTypes.forEach((dt, i) => {
      columns.push({
        key: `${period}|${dt.id}`,
        period,
        dutyTypeId: dt.id,
        dutyTypeName: dt.name,
        shortLabel: dutyTypeShortLabel(dt.name),
        hasSlots: true,
        isFirstInPeriod: columns.length === 0 && i === 0,
      });
    });

    if (columns.length === 0) continue;

    groups.push({
      period,
      columns,
      examEntries: getPeriodExamEntries(exam, date, period),
    });
  }
  return groups;
}

function paddingColumn(period: number, index: number): TeacherGridColumn {
  return {
    key: `${period}|pad-${index}`,
    period,
    dutyTypeId: "",
    dutyTypeName: "",
    shortLabel: "",
    hasSlots: false,
    isFirstInPeriod: false,
    isPadding: true,
  };
}

/** 교시 그룹마다 열 수를 맞춰 전체 블록 너비를 통일 */
export function normalizePeriodGroups(groups: TeacherGridPeriodGroup[]): {
  groups: TeacherGridPeriodGroup[];
  colsPerPeriod: number;
} {
  const colsPerPeriod = Math.max(
    STANDARD_DUTY_COL_COUNT,
    ...groups.map((g) => g.columns.length),
    1,
  );
  const normalized = groups.map((g) => {
    if (g.columns.length >= colsPerPeriod) return g;
    const columns = [...g.columns];
    for (let i = columns.length; i < colsPerPeriod; i++) {
      columns.push(paddingColumn(g.period, i));
    }
    return { ...g, columns };
  });
  return { groups: normalized, colsPerPeriod };
}

export function periodGroupWidthRem(colsPerPeriod: number): number {
  return colsPerPeriod * TEACHER_GRID_DUTY_COL_REM;
}

export function flattenTeacherGridColumns(groups: TeacherGridPeriodGroup[]): TeacherGridColumn[] {
  return groups.flatMap((g) => g.columns);
}

/** 교사 × (교시|감독종류) → 배정 슬롯 */
export function buildTeacherSlotLookup(
  exam: Exam,
  date: string,
): Map<string, Map<string, TeacherCellData>> {
  const roomById = new Map(exam.rooms.map((r) => [r.id, r.name]));
  const assignmentBySlot = new Map(exam.assignments.map((a) => [a.dutySlotId, a]));
  const lookup = new Map<string, Map<string, TeacherCellData>>();

  for (const slot of exam.dutySlots) {
    if (slot.date !== date) continue;
    const assignment = assignmentBySlot.get(slot.id);
    if (!assignment) continue;
    const colKey = `${slot.period}|${slot.dutyTypeId}`;
    const roomName = roomById.get(slot.roomId) ?? slot.roomId;
    const byCol = lookup.get(assignment.teacherId) ?? new Map();
    byCol.set(colKey, { slot, assignment, roomName });
    lookup.set(assignment.teacherId, byCol);
  }
  return lookup;
}

export function teacherDutyCounts(exam: Exam, teacherId: string): TeacherDutyCounts {
  const slotById = new Map(exam.dutySlots.map((slot) => [slot.id, slot]));
  const dutyById = new Map(exam.dutyTypes.map((duty) => [duty.id, duty.name]));
  const counts: TeacherDutyCounts = { chief: 0, assistant: 0, selfStudy: 0 };

  for (const assignment of exam.assignments) {
    if (assignment.teacherId !== teacherId) continue;
    const slot = slotById.get(assignment.dutySlotId);
    if (!slot) continue;
    const dutyName = dutyById.get(slot.dutyTypeId);
    if (dutyName === "정감독") counts.chief += 1;
    else if (dutyName === "부감독") counts.assistant += 1;
    else if (dutyName === "자습감독") counts.selfStudy += 1;
  }

  return counts;
}

export function teacherFatigueBreakdown(exam: Exam, teacher: Teacher): TeacherFatigueBreakdown {
  const previous = (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio;
  const current = teacherTotalFatigue(exam, teacher) - previous;
  return {
    previous,
    current,
    total: previous + current,
  };
}

export function formatTimetableClassRoom(row: TeacherTimetable): string {
  if (row.grade && row.className) return `${row.grade}-${row.className}`;
  if (row.className) return String(row.className);
  if (row.grade) return `${row.grade}학년`;
  return "수업";
}

export function formatTimetableClassLabel(row: TeacherTimetable): string {
  if (row.grade && row.className) return `${row.grade}-${row.className}`;
  const parts: string[] = [];
  if (row.grade) parts.push(`${row.grade}학년`);
  if (row.subject) parts.push(row.subject);
  else if (row.className) parts.push(`${row.className}반`);
  return parts.length > 0 ? parts.join(" ") : "수업";
}

export function formatTimetableClassTitle(row: TeacherTimetable): string {
  const room = formatTimetableClassRoom(row);
  if (row.subject) return `정규 수업: ${room} (${row.subject})`;
  return `정규 수업: ${room}`;
}

/** 교사 × 교시 → STEP 7 시간표 수업 (시험 전 학년만) */
export function buildTeacherClassLookup(
  exam: Exam,
  date: string,
  periods: number[],
  teachers: Teacher[],
): Map<string, Map<number, TeacherTimetable>> {
  const lookup = new Map<string, Map<number, TeacherTimetable>>();
  for (const teacher of teachers) {
    for (const period of periods) {
      const row = timetableConflict(exam, teacher, date, period);
      if (!row) continue;
      const byPeriod = lookup.get(teacher.id) ?? new Map();
      byPeriod.set(period, row);
      lookup.set(teacher.id, byPeriod);
    }
  }
  return lookup;
}

/** STEP 12 화면·엑셀 공통 — 누적도 내림차순, 동점 시 이름순 */
export function sortTeachersForTeacherGridDisplay(exam: Exam, teachers: Teacher[]): Teacher[] {
  return [...teachers].sort((a, b) => {
    const diff = teacherTotalFatigue(exam, b) - teacherTotalFatigue(exam, a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ko");
  });
}
