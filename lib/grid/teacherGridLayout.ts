import type { Exam, Teacher } from "@/lib/types";
import {
  buildTeacherClassLookup,
  buildTeacherSlotLookup,
  TEACHER_GRID_FIXED_COL_COUNT,
  teacherGridPeriodGroupsForDate,
  type TeacherGridPeriodGroup,
} from "@/lib/grid/teacherDayGrid";
import { dateWithWeekday } from "@/lib/utils";

export const TEACHER_GRID_HEADER_TOP = 2;
export const TEACHER_GRID_HEADER_BOTTOM = 5;
export const TEACHER_GRID_DUTY_LABEL_ROW = 5;
export const TEACHER_GRID_DATA_START = 6;

export type TeacherGridLayoutGroup = TeacherGridPeriodGroup & { colStart: number };

export type TeacherGridLayoutDay = {
  date: string;
  label: string;
  groups: TeacherGridLayoutGroup[];
  colStart: number;
  colEnd: number;
  slotLookup: ReturnType<typeof buildTeacherSlotLookup>;
  classLookup: ReturnType<typeof buildTeacherClassLookup>;
};

function uniqueDates(exam: Exam): string[] {
  return Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();
}

function padGroupColumns(
  g: TeacherGridPeriodGroup,
  colsPerPeriod: number,
): TeacherGridPeriodGroup {
  if (g.columns.length >= colsPerPeriod) return g;
  const columns = [...g.columns];
  while (columns.length < colsPerPeriod) {
    columns.push({
      key: `${g.period}|pad-${columns.length}`,
      period: g.period,
      dutyTypeId: "",
      dutyTypeName: "",
      shortLabel: "",
      hasSlots: false,
      isFirstInPeriod: false,
      isPadding: true,
    });
  }
  return { ...g, columns };
}

export function buildTeacherGridLayout(
  exam: Exam,
  periods: number[],
  teachers: Teacher[] = [...exam.teachers].sort((a, b) => a.name.localeCompare(b.name, "ko")),
  fixedColCount: number = TEACHER_GRID_FIXED_COL_COUNT,
): { days: TeacherGridLayoutDay[]; totalCols: number; colsPerPeriod: number } {
  const dates = uniqueDates(exam);
  let colsPerPeriod = 3;
  const rawDays = dates.map((date) => {
    const rawGroups = teacherGridPeriodGroupsForDate(exam, date, periods);
    for (const g of rawGroups) {
      colsPerPeriod = Math.max(colsPerPeriod, g.columns.length);
    }
    return { date, rawGroups };
  });

  let col = fixedColCount + 1;
  const days: TeacherGridLayoutDay[] = rawDays
    .filter(({ rawGroups }) => rawGroups.length > 0)
    .map(({ date, rawGroups }) => {
      const groups = rawGroups.map((g) => padGroupColumns(g, colsPerPeriod));
      const colStart = col;
      const layoutGroups: TeacherGridLayoutGroup[] = groups.map((g) => {
        const lg = { ...g, colStart: col };
        col += g.columns.length;
        return lg;
      });
      const periodNums = groups.map((g) => g.period);
      return {
        date,
        label: dateWithWeekday(date),
        groups: layoutGroups,
        colStart,
        colEnd: col - 1,
        slotLookup: buildTeacherSlotLookup(exam, date),
        classLookup: buildTeacherClassLookup(exam, date, periodNums, teachers),
      };
    });

  return { days, totalCols: Math.max(col - 1, fixedColCount), colsPerPeriod };
}
