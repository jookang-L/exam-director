import type { Exam } from "@/lib/types";

export const MAJOR_EXAM_CLASS_THRESHOLD = 6;

export function normalizeSubject(subject: string): string {
  return subject.trim();
}

const UNICODE_ROMAN_TO_DIGIT: Record<string, string> = {
  "Ⅰ": "1",
  "Ⅱ": "2",
  "Ⅲ": "3",
  "Ⅳ": "4",
  "Ⅴ": "5",
  "Ⅵ": "6",
  "Ⅶ": "7",
  "Ⅷ": "8",
  "Ⅸ": "9",
  "Ⅹ": "10",
  "Ⅺ": "11",
  "Ⅻ": "12",
  "ⅰ": "1",
  "ⅱ": "2",
  "ⅲ": "3",
  "ⅳ": "4",
  "ⅴ": "5",
  "ⅵ": "6",
  "ⅶ": "7",
  "ⅷ": "8",
  "ⅸ": "9",
  "ⅹ": "10",
  "ⅺ": "11",
  "ⅻ": "12",
};

/** 끝의 영문 로마숫자만. 긴 표기부터 맞춰 Ⅱ·II가 I로 잘리지 않게 한다. */
const ASCII_ROMAN_SUFFIX: ReadonlyArray<readonly [string, string]> = [
  ["XII", "12"],
  ["XI", "11"],
  ["IX", "9"],
  ["VIII", "8"],
  ["VII", "7"],
  ["VI", "6"],
  ["IV", "4"],
  ["X", "10"],
  ["V", "5"],
  ["III", "3"],
  ["II", "2"],
  ["I", "1"],
];

/** 비교용 — 공백 제거, 전각 숫자·로마숫자를 아라비아 숫자로 */
export function canonicalSubject(subject: string): string {
  const compact = normalizeSubject(subject).replace(/[\s\u3000\u00a0]+/g, "");
  const digits = compact.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  const roman = digits.replace(/[Ⅰ-Ⅻⅰ-ⅻ]/g, (ch) => UNICODE_ROMAN_TO_DIGIT[ch] ?? ch);
  const upper = roman.toUpperCase();
  for (const [suffix, digit] of ASCII_ROMAN_SUFFIX) {
    if (upper.endsWith(suffix) && roman.length > suffix.length) {
      return roman.slice(0, roman.length - suffix.length) + digit;
    }
  }
  return roman;
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
