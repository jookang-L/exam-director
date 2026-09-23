import type { Grade } from "@/lib/types";

/** 2·3학년 공통 특별실 (6곳) */
const SPECIAL_ROOMS_BASE = [
  "2층음악실A",
  "2층과학실A",
  "2층과학실C",
  "4층음악실B",
  "4층정보실",
  "기술실",
] as const;

/** 2학년 특별실 (시험표 번호 16~21) */
export const SPECIAL_ROOM_NAMES_GRADE_2 = SPECIAL_ROOMS_BASE;

/** 3학년 특별실 — 공통 6곳 + 영어실·수학실 (시험표 번호 14~21) */
export const SPECIAL_ROOM_NAMES_GRADE_3 = [
  ...SPECIAL_ROOMS_BASE,
  "영어실",
  "수학실",
] as const;

/** @deprecated 학년별 목록은 specialRoomNamesForGrade 사용 */
export const SPECIAL_ROOM_NAMES = SPECIAL_ROOM_NAMES_GRADE_2;

export function specialRoomNamesForGrade(grade: Grade): readonly string[] {
  if (grade === 2) return SPECIAL_ROOM_NAMES_GRADE_2;
  if (grade === 3) return SPECIAL_ROOM_NAMES_GRADE_3;
  return [];
}

function buildSpecialClassMap(
  names: readonly string[],
  startNum: number,
): Record<number, string> {
  const map: Record<number, string> = {};
  names.forEach((name, i) => {
    map[startNum + i] = name;
  });
  return map;
}

/**
 * STEP 2 시험표 반 번호 ↔ STEP 3 특별실 고사실 매핑.
 * - 2학년: 일반 1~15 + 특별실 16~21 (6곳)
 * - 3학년: 일반 1~13 + 특별실 14~21 (8곳)
 */
export const SPECIAL_CLASS_BY_GRADE: Record<Grade, Record<number, string>> = {
  1: {},
  2: buildSpecialClassMap(SPECIAL_ROOM_NAMES_GRADE_2, 16),
  3: buildSpecialClassMap(SPECIAL_ROOM_NAMES_GRADE_3, 14),
};

/** 시험표 반 번호 → 고사실 roomId */
export function classNumberToRoomId(grade: Grade, classNum: number): string {
  const suffix = SPECIAL_CLASS_BY_GRADE[grade][classNum];
  if (suffix) return `r${grade}-${suffix}`;
  return `r${grade}-${classNum}`;
}

/** 고사실 roomId → 해당하는 시험표 반 번호 목록 */
export function classNumbersForRoomId(
  roomId: string,
): { grade: Grade; classNums: number[] } | null {
  const m = roomId.match(/^r([123])-(.+)$/);
  if (!m) return null;
  const grade = Number(m[1]) as Grade;
  const tail = m[2];
  if (/^\d+$/.test(tail)) {
    return { grade, classNums: [Number(tail)] };
  }
  const classNums: number[] = [];
  for (const [cn, suffix] of Object.entries(SPECIAL_CLASS_BY_GRADE[grade])) {
    if (suffix === tail) classNums.push(Number(cn));
  }
  return classNums.length > 0 ? { grade, classNums } : null;
}

export function isSpecialClassNumber(grade: Grade, classNum: number): boolean {
  return SPECIAL_CLASS_BY_GRADE[grade][classNum] !== undefined;
}

export function specialClassLabel(grade: Grade, classNum: number): string | undefined {
  return SPECIAL_CLASS_BY_GRADE[grade][classNum];
}

export function classNumberFromSpecialName(grade: Grade, name: string): number | undefined {
  const trimmed = name.trim();
  for (const [cn, suffix] of Object.entries(SPECIAL_CLASS_BY_GRADE[grade])) {
    if (suffix === trimmed) return Number(cn);
  }
  return undefined;
}

/** 시험표·UI 표시 (특별실은 이름만, 일반반은 번호) */
export function formatClassNumberLabel(grade: Grade, classNum: number): string {
  return specialClassLabel(grade, classNum) ?? String(classNum);
}

/** 학년별 일반 반 최대 번호 */
export const REGULAR_CLASS_MAX: Record<Grade, number> = {
  1: 13,
  2: 15,
  3: 13,
};

/** 학년별 선택 가능한 반 번호 (일반반 + 특별실) */
export function selectableClassNumbers(grade: Grade): number[] {
  const regular = Array.from({ length: REGULAR_CLASS_MAX[grade] }, (_, i) => i + 1);
  const special = Object.keys(SPECIAL_CLASS_BY_GRADE[grade])
    .map(Number)
    .sort((a, b) => a - b);
  return [...regular, ...special];
}

export function specialClassNumbers(grade: Grade): number[] {
  return Object.keys(SPECIAL_CLASS_BY_GRADE[grade])
    .map(Number)
    .sort((a, b) => a - b);
}

/** 반 선택 버튼 호버 안내 */
export function classButtonTooltip(grade: Grade, classNum: number): string {
  const suffix = SPECIAL_CLASS_BY_GRADE[grade][classNum];
  if (suffix) return `${grade}-${suffix}`;
  return `${grade}-${classNum}`;
}

/** 시험반 입력·표시용 (특별실은 이름, 일반반은 1-8 형식) */
export function formatClassesDisplay(grade: Grade, classes: number[]): string {
  if (classes.length === 0) return "";
  const sorted = [...classes].sort((a, b) => a - b);
  const segments: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const n = sorted[i];
    if (isSpecialClassNumber(grade, n)) {
      segments.push(SPECIAL_CLASS_BY_GRADE[grade][n]!);
      i++;
      continue;
    }
    let start = n;
    let prev = n;
    i++;
    while (
      i < sorted.length &&
      !isSpecialClassNumber(grade, sorted[i]) &&
      sorted[i] === prev + 1
    ) {
      prev = sorted[i];
      i++;
    }
    segments.push(start === prev ? String(start) : `${start}-${prev}`);
  }
  return segments.join(", ");
}

/** 시험반 텍스트 → 반 번호 (특별실 이름·번호·범위 모두 허용) */
export function parseClassesDisplayInput(grade: Grade, s: string): number[] {
  if (!s.trim()) return [];
  const result = new Set<number>();
  const parts = s.split(/[,，]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const byName = classNumberFromSpecialName(grade, part);
    if (byName !== undefined) {
      result.add(byName);
      continue;
    }
    const legacy = part.match(/^(\d+)\([^)]+\)$/);
    if (legacy) {
      result.add(Number(legacy[1]));
      continue;
    }
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) result.add(i);
      continue;
    }
    if (/^\d+$/.test(part)) {
      result.add(Number(part));
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}
