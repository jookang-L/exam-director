import type { Assignment, DutySlot, DutyType, Exam, Teacher } from "@/lib/types";
import { dutyTypeWeightById } from "@/lib/fatigueWeights";
import { timetableClassBurden } from "./timetableFatigue";

export type FatigueMap = Map<string, number>; // teacherId -> totalFatigue

export function dutyTypeWeight(dutyTypes: DutyType[], dutyTypeId: string): number {
  return dutyTypeWeightById(dutyTypes, dutyTypeId);
}

export function computeCurrentWeight(
  assignments: Assignment[],
  dutySlots: DutySlot[],
  dutyTypes: DutyType[],
  teacherId: string,
): number {
  let w = 0;
  for (const a of assignments) {
    if (a.teacherId !== teacherId) continue;
    const slot = dutySlots.find((s) => s.id === a.dutySlotId);
    if (!slot) continue;
    w += dutyTypeWeight(dutyTypes, slot.dutyTypeId);
  }
  return w;
}

/** 감독 곤란도 + 시험 기간 수업 부담(30×회) */
export function teacherExamBurden(exam: Exam, teacherId: string): number {
  return (
    computeCurrentWeight(exam.assignments, exam.dutySlots, exam.dutyTypes, teacherId) +
    timetableClassBurden(exam, teacherId)
  );
}

export function computeFatigueMap(exam: Exam): FatigueMap {
  const map: FatigueMap = new Map();
  const { teachers, carryOverRatio } = exam;
  for (const t of teachers) {
    const current = teacherExamBurden(exam, t.id);
    const total = (t.previousFatigueScore ?? 0) * carryOverRatio + current;
    map.set(t.id, total);
  }
  return map;
}

export function teacherCurrentWeight(exam: Exam, teacherId: string): number {
  return teacherExamBurden(exam, teacherId);
}

export function teacherDutyWeight(exam: Exam, teacherId: string): number {
  return computeCurrentWeight(exam.assignments, exam.dutySlots, exam.dutyTypes, teacherId);
}

export function teacherTotalFatigue(exam: Exam, teacher: Teacher): number {
  const current = teacherExamBurden(exam, teacher.id);
  return (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio + current;
}
