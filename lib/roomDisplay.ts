import type { Grade } from "@/lib/types";

/** 고사실 이름에서 학년 추출 (예: "2-18" → 2) */
export function roomGrade(name: string): Grade | null {
  const m = name.match(/^([123])-/);
  if (!m) return null;
  return Number(m[1]) as Grade;
}

/** 이전 고사실과 학년이 바뀌는 열인지 */
export function isGradeColumnStart(name: string, prevName: string | null): boolean {
  const g = roomGrade(name);
  if (g === null) return false;
  if (prevName === null) return true;
  return roomGrade(prevName) !== g;
}

/** 일반 반 교실 (예: "2-18") */
export function isClassRoom(name: string): boolean {
  return /^[123]-\d+$/.test(name);
}

/** 특별실 등 긴 이름은 학년 / 나머지 2줄로 표시 */
export function roomHeaderLines(name: string): { line1: string; line2?: string } {
  const m = name.match(/^([123])-(.+)$/);
  if (!m) return { line1: name };
  const grade = m[1];
  const rest = m[2];
  if (/^\d+$/.test(rest)) return { line1: name };
  return { line1: `${grade}-`, line2: rest };
}
