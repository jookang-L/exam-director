import type { Exam } from "@/lib/types";

export const MAJOR_EXAM_CLASS_THRESHOLD = 6;

export function normalizeSubject(subject: string): string {
  return subject.trim();
}

/** 비교용 — 공백 제거 (화법과 작문 ↔ 화법과작문) */
export function canonicalSubject(subject: string): string {
  return normalizeSubject(subject).replace(/\s+/g, "");
}

function subjectKey(subject: string): string {
  const canonical = canonicalSubject(subject);
  return canonical.replace(/1$/g, "");
}

export function subjectsMatch(a: string, b: string): boolean {
  return subjectKey(a) === subjectKey(b);
}

/** 교사 교과란 — 쉼표(,)로 여러 과목 구분 */
export function parseTeacherSubjects(subjectField: string): string[] {
  if (!subjectField.trim()) return [];
  return subjectField
    .split(/[,，]/)
    .map((s) => normalizeSubject(s))
    .filter(Boolean);
}

/** 교사가 해당 시험 과목을 가르치는지 (복수 교과·공백 차이 허용) */
export function teacherTeachesSubject(teacherSubjectField: string, examSubject: string): boolean {
  const exam = subjectKey(examSubject);
  if (!exam) return false;
  return parseTeacherSubjects(teacherSubjectField).some((t) => {
    return subjectKey(t) === exam;
  });
}

/** 같은 날·교시에 시험이 있는 모든 과목 (교과 교사 감독 배정 금지) */
export function examSubjectsAt(
  exam: Exam,
  date: string,
  period: number,
): Set<string> {
  const subjects = new Set<string>();
  for (const s of exam.examSlots) {
    if (s.date !== date || s.period !== period) continue;
    if (s.classes.length > 0) subjects.add(normalizeSubject(s.subject));
  }
  return subjects;
}

export function teacherBlockedByExamSubject(
  exam: Exam,
  teacherSubjectField: string,
  date: string,
  period: number,
): string | null {
  const subjects = examSubjectsAt(exam, date, period);
  for (const subject of subjects) {
    if (teacherTeachesSubject(teacherSubjectField, subject)) return subject;
  }
  return null;
}
