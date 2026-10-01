import type { DutySlot, Exam, Teacher } from "@/lib/types";
import { isDutyAllowRule, teacherExcludedAt } from "@/lib/algorithm/constraints";

function excludeMatchesDutyColumn(
  exam: Exam,
  teacherId: string,
  date: string,
  period: number,
): boolean {
  return exam.excludes.some((exclude) => {
    if (isDutyAllowRule(exclude)) return false;
    if (exclude.teacherId !== teacherId) return false;
    if (exclude.roomId) return false;
    if (exclude.date && exclude.date !== date) return false;
    if (exclude.period != null && Number(exclude.period) !== period) return false;
    return true;
  });
}

/** STEP 12 — 해당 교시 열(정·부·자습) 전체에 빨간 음영 */
export function isTeacherExcludedForPeriod(
  exam: Exam,
  teacherId: string,
  date: string,
  period: number,
): boolean {
  return excludeMatchesDutyColumn(exam, teacherId, date, period);
}

export function getTeacherPeriodExcludeLabel(
  exam: Exam,
  teacherId: string,
  date: string,
  period: number,
): string | null {
  const match = exam.excludes.find((exclude) => {
    if (isDutyAllowRule(exclude)) return false;
    if (exclude.teacherId !== teacherId) return false;
    if (exclude.roomId) return false;
    if (exclude.date && exclude.date !== date) return false;
    if (exclude.period != null && Number(exclude.period) !== period) return false;
    return true;
  });
  if (!match) return null;
  return match.reason ? `제외 (${match.reason})` : "STEP 7 제외";
}

/** 배정된 슬롯 — 고사실 단위 제외 포함 */
export function isTeacherExcludedForSlot(
  exam: Exam,
  teacher: Teacher,
  slot: DutySlot,
): boolean {
  return teacherExcludedAt(exam, teacher, slot.date, slot.period, slot.roomId) != null;
}

export function getTeacherSlotExcludeLabel(
  exam: Exam,
  teacher: Teacher,
  slot: DutySlot,
): string | null {
  const match = teacherExcludedAt(exam, teacher, slot.date, slot.period, slot.roomId);
  if (!match) return null;
  return match.reason ? `제외 (${match.reason})` : "STEP 7 제외";
}
