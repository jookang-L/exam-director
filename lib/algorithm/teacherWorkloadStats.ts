import type { Exam, Teacher } from "@/lib/types";
import { DEFAULT_DUTY_WEIGHT_FALLBACK } from "@/lib/fatigueWeights";
import { buildExamLookups } from "./constraintIndexes";
import { timetableClassBurden } from "./timetableFatigue";

export type TeacherWorkloadRow = {
  teacher: Teacher;
  totalDutyCount: number;
  chiefCount: number;
  assistantCount: number;
  selfStudyCount: number;
  classBurden: number;
  totalFatigue: number;
  currentExamFatigue: number;
  previousCarriedFatigue: number;
};

export type TeacherWorkloadSortKey = keyof Pick<
  TeacherWorkloadRow,
  | "totalDutyCount"
  | "chiefCount"
  | "assistantCount"
  | "selfStudyCount"
  | "classBurden"
  | "totalFatigue"
  | "currentExamFatigue"
  | "previousCarriedFatigue"
> | "name";

export function buildTeacherWorkloadRows(exam: Exam): TeacherWorkloadRow[] {
  const lookups = buildExamLookups(exam);
  const counts = new Map<
    string,
    { total: number; chief: number; assistant: number; selfStudy: number; dutyWeight: number }
  >();

  for (const a of exam.assignments) {
    const slot = lookups.slotById.get(a.dutySlotId);
    if (!slot) continue;
    const dt = lookups.dutyTypeById.get(slot.dutyTypeId);
    const cur = counts.get(a.teacherId) ?? { total: 0, chief: 0, assistant: 0, selfStudy: 0, dutyWeight: 0 };
    cur.total += 1;
    cur.dutyWeight += dt?.weight ?? DEFAULT_DUTY_WEIGHT_FALLBACK;
    if (dt?.name === "정감독") cur.chief += 1;
    else if (dt?.name === "부감독") cur.assistant += 1;
    else if (dt?.name === "자습감독") cur.selfStudy += 1;
    counts.set(a.teacherId, cur);
  }

  const classBurdenCache = new Map<string, number>();

  return exam.teachers.map((t) => {
    const c = counts.get(t.id) ?? { total: 0, chief: 0, assistant: 0, selfStudy: 0, dutyWeight: 0 };
    let classBurden = classBurdenCache.get(t.id);
    if (classBurden === undefined) {
      classBurden = timetableClassBurden(exam, t.id);
      classBurdenCache.set(t.id, classBurden);
    }
    const previousCarriedFatigue = (t.previousFatigueScore ?? 0) * exam.carryOverRatio;
    const currentExamFatigue = c.dutyWeight + classBurden;
    const totalFatigue = previousCarriedFatigue + currentExamFatigue;
    return {
      teacher: t,
      totalDutyCount: c.total,
      chiefCount: c.chief,
      assistantCount: c.assistant,
      selfStudyCount: c.selfStudy,
      classBurden,
      totalFatigue,
      currentExamFatigue,
      previousCarriedFatigue,
    };
  });
}

export function sortTeacherWorkloadRows(
  rows: TeacherWorkloadRow[],
  key: TeacherWorkloadSortKey,
  dir: "asc" | "desc",
): TeacherWorkloadRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") {
      return mul * a.teacher.name.localeCompare(b.teacher.name, "ko");
    }
    const av = a[key];
    const bv = b[key];
    if (av !== bv) return mul * (av - bv);
    return a.teacher.name.localeCompare(b.teacher.name, "ko");
  });
}
