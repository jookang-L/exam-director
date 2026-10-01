import type {
  Assignment,
  DutySlot,
  Exam,
  Teacher,
} from "@/lib/types";
import { newId } from "@/lib/types";
import { evaluateAll, isEvaluationOfficer, type ConstraintContext } from "@/lib/algorithm/constraints";
import { nutritionTeacherSchedule } from "@/lib/algorithm/nutritionTeachers";

function canAssignTeacherToSlot(
  exam: Exam,
  result: Assignment[],
  teacher: Teacher,
  slot: DutySlot,
): boolean {
  const ctx: ConstraintContext = {
    exam,
    assignments: result.filter((a) => a.dutySlotId !== slot.id),
  };
  return evaluateAll(ctx, slot, teacher).ok;
}

function findDutyTypeIdByName(exam: Exam, name: string): string | undefined {
  return exam.dutyTypes.find((d) => d.name === name)?.id;
}

function isStep9Assignment(exam: Exam, assignment: Assignment): boolean {
  return exam.preassigns.some(
    (p) => p.teacherId === assignment.teacherId && p.dutySlotId === assignment.dutySlotId,
  );
}

function getFirstExamDate(exam: Exam, grade: number): string | undefined {
  const gs = exam.gradeSchedule.find((g) => g.grade === grade);
  return gs?.startDate;
}

// Find a duty slot for a specific homeroom class on first-day P1.
// Heuristic: match by date/period and prefer a room whose name contains "<grade>-<class>".
function findHomeroomSlot(
  exam: Exam,
  grade: number,
  cls: number,
  date: string,
  period: number,
  dutyTypeId: string,
): DutySlot | undefined {
  const candidates = exam.dutySlots.filter(
    (s) => s.date === date && s.period === period && s.dutyTypeId === dutyTypeId,
  );
  if (candidates.length === 0) return undefined;
  const key = `${grade}-${cls}`;
  const named = candidates.find((s) => {
    const room = exam.rooms.find((r) => r.id === s.roomId);
    return room?.name.includes(key);
  });
  return named ?? candidates[0];
}

// Build fixed assignments — does NOT mutate the input exam. Returns new assignments[].
export function buildFixedAssignments(exam: Exam): Assignment[] {
  const result: Assignment[] = exam.assignments.map((assignment) => ({ ...assignment }));

  const selfStudyId = findDutyTypeIdByName(exam, "자습감독");
  const assistantId = findDutyTypeIdByName(exam, "부감독");

  // 1) Apply manual preassigns from STEP 9 first. These are the strongest placements.
  for (const p of exam.preassigns) {
    const slot = exam.dutySlots.find((s) => s.id === p.dutySlotId);
    if (!slot) continue;
    const teacher = exam.teachers.find((t) => t.id === p.teacherId);
    if (!teacher) continue;

    const fixed = p.priority === "fixed";
    const existing = result.find((a) => a.dutySlotId === slot.id);
    if (existing) {
      existing.teacherId = p.teacherId;
      existing.fixed = fixed;
      existing.fixedReason = fixed ? p.reason ?? "manual-fixed" : "manual-preferred";
    } else {
      result.push({
        id: newId(),
        teacherId: p.teacherId,
        dutySlotId: slot.id,
        fixed,
        fixedReason: fixed ? p.reason ?? "manual-fixed" : "manual-preferred",
      });
    }
  }

  // 2) Rule 2: 각 학년 시험 첫날 1교시 → 담임 자습감독
  if (selfStudyId) {
    for (const teacher of exam.teachers) {
      if (isEvaluationOfficer(teacher)) continue;
      if (!teacher.homeroomGrade || !teacher.homeroomClass) continue;
      const firstDate = getFirstExamDate(exam, teacher.homeroomGrade);
      if (!firstDate) continue;
      const slot = findHomeroomSlot(
        exam,
        teacher.homeroomGrade,
        teacher.homeroomClass,
        firstDate,
        1,
        selfStudyId,
      );
      if (!slot) continue;
      if (!canAssignTeacherToSlot(exam, result, teacher, slot)) continue;
      const already = result.find((a) => a.dutySlotId === slot.id);
      if (already) {
        if (isStep9Assignment(exam, already)) continue;
        if (already.teacherId !== teacher.id) {
          // Overwrite if not fixed by user.
          if (!already.fixed) {
            already.teacherId = teacher.id;
            already.fixed = true;
            already.fixedReason = "homeroom-D1P1";
          }
        } else {
          already.fixed = true;
          already.fixedReason = already.fixedReason ?? "homeroom-D1P1";
        }
        continue;
      }
      result.push({
        id: newId(),
        teacherId: teacher.id,
        dutySlotId: slot.id,
        fixed: true,
        fixedReason: "homeroom-D1P1",
      });
    }
  }

  // 3) Rule C9: 영양교사 — 2교시 부감독, 교사당 연속 2일
  if (assistantId) {
    const schedule = nutritionTeacherSchedule(exam);
    for (const [teacherId, dates] of schedule) {
      const teacher = exam.teachers.find((t) => t.id === teacherId);
      if (!teacher) continue;
      for (const date of dates) {
        const slots = exam.dutySlots.filter(
          (s) => s.date === date && s.period === 2 && s.dutyTypeId === assistantId,
        );
        const slot = slots.find((s) => {
          const existing = result.find((a) => a.dutySlotId === s.id);
          return !existing?.fixed && (existing == null || !isStep9Assignment(exam, existing));
        });
        if (!slot || !canAssignTeacherToSlot(exam, result, teacher, slot)) continue;

        const existing = result.find((a) => a.dutySlotId === slot.id);
        if (existing) {
          if (existing.teacherId !== teacher.id) {
            existing.teacherId = teacher.id;
          }
          existing.fixed = true;
          existing.fixedReason = existing.fixedReason ?? "nutrition-C9";
        } else {
          result.push({
            id: newId(),
            teacherId: teacher.id,
            dutySlotId: slot.id,
            fixed: true,
            fixedReason: "nutrition-C9",
          });
        }
      }
    }
  }

  return result;
}
