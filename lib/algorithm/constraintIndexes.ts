import type { Assignment, DutySlot, DutyType, Exam } from "@/lib/types";

export type ExamLookups = {
  slotById: Map<string, DutySlot>;
  dutyTypeById: Map<string, DutyType>;
};

export type AssignmentIndexes = {
  /** teacherId → `${date}|${period}` → dutySlotId */
  teacherPeriodSlot: Map<string, Map<string, string>>;
  /** `${date}|${period}` → 보건교사 teacherId */
  healthTeacherByPeriod: Map<string, string>;
  /** teacherId → date → 배정 슬롯 id 목록 (C7) */
  teacherDaySlotIds: Map<string, Map<string, string[]>>;
};

export function buildExamLookups(exam: Exam): ExamLookups {
  const slotById = new Map<string, DutySlot>();
  for (const s of exam.dutySlots) slotById.set(s.id, s);

  const dutyTypeById = new Map<string, DutyType>();
  for (const d of exam.dutyTypes) dutyTypeById.set(d.id, d);

  return { slotById, dutyTypeById };
}

export function periodKey(date: string, period: number): string {
  return `${date}|${period}`;
}

export function buildAssignmentIndexes(
  assignments: Assignment[],
  lookups: ExamLookups,
  exam: Exam,
): AssignmentIndexes {
  const teacherPeriodSlot = new Map<string, Map<string, string>>();
  const healthTeacherByPeriod = new Map<string, string>();
  const teacherDaySlotIds = new Map<string, Map<string, string[]>>();

  for (const a of assignments) {
    applyAssignmentToIndexes(
      a.teacherId,
      a.dutySlotId,
      1,
      teacherPeriodSlot,
      healthTeacherByPeriod,
      teacherDaySlotIds,
      lookups,
      exam,
    );
  }

  return { teacherPeriodSlot, healthTeacherByPeriod, teacherDaySlotIds };
}

export function applyAssignmentToIndexes(
  teacherId: string,
  dutySlotId: string,
  sign: 1 | -1,
  teacherPeriodSlot: Map<string, Map<string, string>>,
  healthTeacherByPeriod: Map<string, string>,
  teacherDaySlotIds: Map<string, Map<string, string[]>>,
  lookups: ExamLookups,
  exam: Exam,
): void {
  const slot = lookups.slotById.get(dutySlotId);
  if (!slot) return;

  const pk = periodKey(slot.date, slot.period);

  if (sign === 1) {
    let perTeacher = teacherPeriodSlot.get(teacherId);
    if (!perTeacher) {
      perTeacher = new Map();
      teacherPeriodSlot.set(teacherId, perTeacher);
    }
    perTeacher.set(pk, dutySlotId);

    const teacher = exam.teachers.find((t) => t.id === teacherId);
    if (teacher?.roleType === "보건교사") {
      healthTeacherByPeriod.set(pk, teacherId);
    }

    let perDay = teacherDaySlotIds.get(teacherId);
    if (!perDay) {
      perDay = new Map();
      teacherDaySlotIds.set(teacherId, perDay);
    }
    const daySlots = perDay.get(slot.date) ?? [];
    daySlots.push(dutySlotId);
    perDay.set(slot.date, daySlots);
    return;
  }

  const perTeacher = teacherPeriodSlot.get(teacherId);
  const existing = perTeacher?.get(pk);
  if (existing === dutySlotId) perTeacher!.delete(pk);

  if (healthTeacherByPeriod.get(pk) === teacherId) {
    healthTeacherByPeriod.delete(pk);
  }

  const perDay = teacherDaySlotIds.get(teacherId);
  const daySlots = perDay?.get(slot.date);
  if (daySlots) {
    const idx = daySlots.indexOf(dutySlotId);
    if (idx >= 0) daySlots.splice(idx, 1);
    if (daySlots.length === 0) perDay!.delete(slot.date);
  }
}
