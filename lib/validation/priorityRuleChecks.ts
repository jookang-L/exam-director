import type { Assignment, DutySlot, Exam } from "@/lib/types";
import { nutritionTeacherSchedule } from "@/lib/algorithm/nutritionTeachers";
import { shortDate } from "@/lib/utils";

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
        `${teacher.name}: ${shortDate(firstDate)} 1교시 ${teacher.homeroomGrade}-${teacher.homeroomClass}반 자습감독 슬롯 없음`,
      );
      continue;
    }

    const assigned = bySlot.get(slot.id);
    if (!assigned || assigned.teacherId !== teacher.id) {
      failures.push(
        `${teacher.name}: ${shortDate(firstDate)} 1교시 본인 반(${teacher.homeroomGrade}-${teacher.homeroomClass}) 자습감독 — 기대 ${teacher.name}, 실제 ${teacherName(exam, assigned?.teacherId)}`,
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
        failures.push(`${teacher.name}: ${shortDate(date)} 2교시 부감독 미배정`);
      }
    }
  }

  return failures;
}
