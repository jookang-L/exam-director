import type { Exam, Teacher } from "@/lib/types";
import { isDutyAllowRule, isEvaluationOfficer } from "./constraints";
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
  const teacherExcludes = exam.excludes.filter(
    (e) => e.teacherId === teacher.id && !isDutyAllowRule(e),
  );
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

/**
 * STEP 4에 저장된 이전 곤란도가 정확히 0인지.
 * 이월율을 곱한 값이 아니다. 0.5처럼 아주 작은 양수는 기존 사람이다.
 * 이월 후에는 신규와 시작점이 거의 같아져도 목표는 다르다.
 * 나중에 문제가 되면 임계값이나 신규 플래그로 바꿀 수 있다.
 */
export function hasNoPreviousFatigue(teacher: Teacher): boolean {
  return (teacher.previousFatigueScore ?? 0) === 0;
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
  excludedNoPrevious: number;
  /** 이전 곤란도가 있는 사람만으로 평균·최고·최저를 냈는지 */
  veteransOnly: boolean;
  highest: FatigueTeacherExtreme | null;
  lowest: FatigueTeacherExtreme | null;
};

/** 강사·영양·평가담당·고사기간 전체 제외를 뺀 뒤, 이전 곤란도 0은 평균·최고·최저에서 뺀다. */
export function computeAverageTotalFatigue(exam: Exam): AverageTotalFatigueResult {
  const eligible: FatigueTeacherExtreme[] = [];
  let excludedByRole = 0;
  let excludedByFullExclude = 0;
  let excludedNoPrevious = 0;

  for (const t of exam.teachers) {
    if (isLecturerOrNutritionTeacher(t)) {
      excludedByRole++;
      continue;
    }
    if (isFullyExcludedDuringExam(exam, t)) {
      excludedByFullExclude++;
      continue;
    }
    if (hasNoPreviousFatigue(t)) excludedNoPrevious++;
    eligible.push({ teacher: t, total: teacherTotalFatigue(exam, t) });
  }

  const veterans = eligible.filter((entry) => !hasNoPreviousFatigue(entry.teacher));
  const pool = veterans;
  const veteransOnly = true;
  const count = pool.length;
  if (count === 0) {
    return {
      average: 0,
      count: 0,
      excludedByRole,
      excludedByFullExclude,
      excludedNoPrevious,
      veteransOnly: false,
      highest: null,
      lowest: null,
    };
  }

  pool.sort((a, b) => a.total - b.total || a.teacher.name.localeCompare(b.teacher.name, "ko"));
  const sum = pool.reduce((s, e) => s + e.total, 0);

  return {
    average: sum / count,
    count,
    excludedByRole,
    excludedByFullExclude,
    excludedNoPrevious,
    veteransOnly,
    lowest: pool[0],
    highest: pool[pool.length - 1],
  };
}
