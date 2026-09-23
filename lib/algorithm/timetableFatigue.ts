import type { Exam } from "@/lib/types";
import { FATIGUE_WEIGHT } from "@/lib/fatigueWeights";
import { eachDate, weekdayKo } from "@/lib/utils";
import { gradeInExam } from "./constraints";

/** 학년별 시험 일정에 포함된 날짜(중복 제거) */
export function examPeriodDates(exam: Exam): string[] {
  const set = new Set<string>();
  for (const gs of exam.gradeSchedule) {
    if (!gs.startDate || !gs.endDate) continue;
    for (const d of eachDate(gs.startDate, gs.endDate)) {
      set.add(d);
    }
  }
  return Array.from(set).sort();
}

function isDateInAnyExamPeriod(exam: Exam, date: string): boolean {
  for (const gs of exam.gradeSchedule) {
    if (!gs.startDate || !gs.endDate) continue;
    if (date >= gs.startDate && date <= gs.endDate) return true;
  }
  return false;
}

/**
 * 시험 기간 중 아직 시험 보지 않는 학년의 정규 수업 부담 (C5와 동일 조건).
 * 수업 1회당 30점. opts.date가 있으면 해당 날짜만 집계.
 */
export function timetableClassBurden(
  exam: Exam,
  teacherId: string,
  opts?: { date?: string },
): number {
  const dates = opts?.date ? [opts.date] : examPeriodDates(exam);
  if (dates.length === 0) return 0;

  let total = 0;
  for (const date of dates) {
    if (!isDateInAnyExamPeriod(exam, date)) continue;
    const wd = weekdayKo(date);
    for (const row of exam.timetable) {
      if (row.teacherId !== teacherId) continue;
      if (row.weekday !== wd) continue;
      if (row.grade && gradeInExam(exam, row.grade, date)) continue;
      total += FATIGUE_WEIGHT.classLesson;
    }
  }
  return total;
}

export function timetableClassCount(
  exam: Exam,
  teacherId: string,
  opts?: { date?: string },
): number {
  return timetableClassBurden(exam, teacherId, opts) / FATIGUE_WEIGHT.classLesson;
}
