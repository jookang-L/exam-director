import type { Exam, Teacher } from "@/lib/types";

export function isNutritionTeacher(t: Teacher): boolean {
  return t.roleType === "영양교사";
}

export function examDates(exam: Exam): string[] {
  return Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();
}

/** 영양교사별 배정일: 전체 시험일을 순서대로 2일씩 나눔 (A→1~2일, B→3~4일 …) */
export function nutritionTeacherSchedule(exam: Exam): Map<string, string[]> {
  const dates = examDates(exam);
  const teachers = exam.teachers.filter(isNutritionTeacher);
  const schedule = new Map<string, string[]>();
  let dateIdx = 0;

  for (const teacher of teachers) {
    const days: string[] = [];
    for (let d = 0; d < 2 && dateIdx < dates.length; d++) {
      days.push(dates[dateIdx]);
      dateIdx++;
    }
    if (days.length > 0) schedule.set(teacher.id, days);
  }

  return schedule;
}

export function nutritionTeacherDates(exam: Exam, teacherId: string): string[] {
  return nutritionTeacherSchedule(exam).get(teacherId) ?? [];
}
