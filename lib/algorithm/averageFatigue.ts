import type { Exam, Teacher } from "@/lib/types";
import { isEvaluationOfficer } from "./constraints";
import { teacherTotalFatigue } from "./fatigue";
import { examPeriodDates } from "./timetableFatigue";

export function isLecturerOrNutritionTeacher(teacher: Teacher): boolean {
  return (
    teacher.roleType === "강사" ||
    teacher.roleType === "영양교사" ||
    isEvaluationOfficer(teacher)
  );
}

/** STEP 7 — 날짜 없음(전체) 또는 고사기간 매일 날짜 단위 전체 제외 */
export function isFullyExcludedDuringExam(exam: Exam, teacher: Teacher): boolean {
  const teacherExcludes = exam.excludes.filter((e) => e.teacherId === teacher.id);
  if (teacherExcludes.some((e) => !e.date)) return true;

  const dates = examPeriodDates(exam);
  if (dates.length === 0) return false;

  const wholeDayDates = new Set(
    teacherExcludes.filter((e) => e.date && e.period == null).map((e) => e.date!),
  );
  return dates.every((d) => wholeDayDates.has(d));
}

export function isIncludedInAverageFatigue(exam: Exam, teacher: Teacher): boolean {
  if (isLecturerOrNutritionTeacher(teacher)) return false;
  if (isFullyExcludedDuringExam(exam, teacher)) return false;
  return true;
}

export type FatigueTeacherExtreme = {
  teacher: Teacher;
  total: number;
};

export type AverageTotalFatigueResult = {
  average: number;
  count: number;
  excludedByRole: number;
  excludedByFullExclude: number;
  highest: FatigueTeacherExtreme | null;
  lowest: FatigueTeacherExtreme | null;
};

/** 강사·영양·평가담당·고사기간 전체 제외 교사를 빼고 총합(이월 반영) 평균·최고·최저 */
export function computeAverageTotalFatigue(exam: Exam): AverageTotalFatigueResult {
  const eligible: FatigueTeacherExtreme[] = [];
  let excludedByRole = 0;
  let excludedByFullExclude = 0;

  for (const t of exam.teachers) {
    if (isLecturerOrNutritionTeacher(t)) {
      excludedByRole++;
      continue;
    }
    if (isFullyExcludedDuringExam(exam, t)) {
      excludedByFullExclude++;
      continue;
    }
    eligible.push({ teacher: t, total: teacherTotalFatigue(exam, t) });
  }

  const count = eligible.length;
  if (count === 0) {
    return {
      average: 0,
      count: 0,
      excludedByRole,
      excludedByFullExclude,
      highest: null,
      lowest: null,
    };
  }

  eligible.sort((a, b) => a.total - b.total || a.teacher.name.localeCompare(b.teacher.name, "ko"));
  const sum = eligible.reduce((s, e) => s + e.total, 0);

  return {
    average: sum / count,
    count,
    excludedByRole,
    excludedByFullExclude,
    lowest: eligible[0],
    highest: eligible[eligible.length - 1],
  };
}
