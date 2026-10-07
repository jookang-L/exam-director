import type { Assignment, DutySlot, Exam } from "@/lib/types";
import { nutritionTeacherSchedule } from "@/lib/algorithm/nutritionTeachers";
import { isManualOverrideReason } from "@/lib/algorithm/manualAssignValidation";
import { dateWithWeekday } from "@/lib/utils";

function findDutyTypeIdByName(exam: Exam, name: string): string | undefined {
  return exam.dutyTypes.find((d) => d.name === name)?.id;
}

function gradeFirstExamDate(exam: Exam, grade: number): string | undefined {
  return exam.gradeSchedule.find((g) => g.grade === grade)?.startDate;
}

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

function assignmentBySlot(assignments: Assignment[]): Map<string, Assignment> {
  return new Map(assignments.map((a) => [a.dutySlotId, a]));
}

function teacherName(exam: Exam, teacherId: string | undefined): string {
  if (!teacherId) return "(미배정)";
  return exam.teachers.find((t) => t.id === teacherId)?.name ?? teacherId;
}

/** C2: 각 학년 시험 첫날 1교시 → 담임 본인 반 자습감독 */
export function checkC2Compliance(exam: Exam, assignments: Assignment[]): string[] {
  const selfStudyId = findDutyTypeIdByName(exam, "자습감독");
  if (!selfStudyId) return [];

  const bySlot = assignmentBySlot(assignments);
  const failures: string[] = [];

  for (const teacher of exam.teachers) {
    if (!teacher.homeroomGrade || !teacher.homeroomClass) continue;
    const firstDate = gradeFirstExamDate(exam, teacher.homeroomGrade);
    if (!firstDate) continue;

    const slot = findHomeroomSlot(
      exam,
      teacher.homeroomGrade,
      teacher.homeroomClass,
      firstDate,
      1,
      selfStudyId,
    );
    if (!slot) {
      failures.push(
        `${teacher.name}: ${dateWithWeekday(firstDate)} 1교시 ${teacher.homeroomGrade}-${teacher.homeroomClass}반 자습감독 슬롯 없음`,
      );
      continue;
    }

    const assigned = bySlot.get(slot.id);
    if (!assigned || assigned.teacherId !== teacher.id) {
      failures.push(
        `${teacher.name}: ${dateWithWeekday(firstDate)} 1교시 본인 반(${teacher.homeroomGrade}-${teacher.homeroomClass}) 자습감독 — 기대 ${teacher.name}, 실제 ${teacherName(exam, assigned?.teacherId)}`,
      );
    }
  }

  return failures;
}

/** C9: 영양교사 지정 2일·2교시 부감독 배정 완료 */
export function checkC9ScheduleCompliance(exam: Exam, assignments: Assignment[]): string[] {
  const assistantId = findDutyTypeIdByName(exam, "부감독");
  if (!assistantId) return [];

  const failures: string[] = [];
  const schedule = nutritionTeacherSchedule(exam);

  for (const [teacherId, dates] of schedule) {
    const teacher = exam.teachers.find((t) => t.id === teacherId);
    if (!teacher) continue;
    for (const date of dates) {
      const ok = assignments.some((a) => {
        if (a.teacherId !== teacherId) return false;
        const slot = exam.dutySlots.find((s) => s.id === a.dutySlotId);
        return (
          slot != null &&
          slot.date === date &&
          slot.period === 2 &&
          slot.dutyTypeId === assistantId
        );
      });
      if (!ok) {
        failures.push(`${teacher.name}: ${dateWithWeekday(date)} 2교시 부감독 미배정`);
      }
    }
  }

  return failures;
}

export type PreassignComplianceResult = {
  /** STEP 9 「고정」 지정이 지켜지지 않은 건 */
  fixed: string[];
  /** STEP 9 「우선」 지정이 지켜지지 않은 건 */
  preferred: string[];
};

/**
 * STEP 9: 지정한 교사가 지정한 슬롯에 실제로 배정되어 있는지.
 * STEP 12 수동 예외(C4·C8 확인)로 자동 생성된 항목은 사용자가 STEP 9에서 입력한 지정이 아니므로 제외한다.
 */
export function checkPreassignCompliance(
  exam: Exam,
  assignments: Assignment[],
): PreassignComplianceResult {
  const bySlot = assignmentBySlot(assignments);
  const result: PreassignComplianceResult = { fixed: [], preferred: [] };

  for (const p of exam.preassigns) {
    if (isManualOverrideReason(p.reason)) continue;
    const bucket = p.priority === "fixed" ? result.fixed : result.preferred;
    const teacher = exam.teachers.find((t) => t.id === p.teacherId);
    const slot = exam.dutySlots.find((s) => s.id === p.dutySlotId);
    if (!teacher) {
      bucket.push(`지정한 교사를 찾을 수 없음 (id: ${p.teacherId})`);
      continue;
    }
    if (!slot) {
      bucket.push(`${teacher.name}: 지정한 감독 슬롯을 찾을 수 없음`);
      continue;
    }

    const assigned = bySlot.get(slot.id);
    if (assigned?.teacherId === teacher.id) continue;

    const room = exam.rooms.find((r) => r.id === slot.roomId)?.name ?? slot.roomId;
    const dutyName = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId)?.name ?? "";
    bucket.push(
      `${teacher.name} → ${dateWithWeekday(slot.date)} ${slot.period}교시 ${room} ${dutyName} — ${
        assigned ? `실제 ${teacherName(exam, assigned.teacherId)}` : "미배정"
      }`,
    );
  }

  return result;
}
