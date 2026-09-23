import type { Room } from "@/lib/types";
import {
  SPECIAL_ROOM_NAMES_GRADE_2,
  SPECIAL_ROOM_NAMES_GRADE_3,
} from "@/lib/roomClassMap";

/** 학년·반 교실 (예: 1-1 ~ 1-13) */
function classRooms(grade: 1 | 2 | 3, from: number, to: number): Room[] {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const c = from + i;
    const name = `${grade}-${c}`;
    return { id: `r${grade}-${c}`, name };
  });
}

function specialRoom(grade: 1 | 2 | 3, label: string, idSuffix: string): Room {
  const name = `${grade}-${label}`;
  return { id: `r${grade}-${idSuffix}`, name };
}

/** 학년별 기본 고사실 개수 (1학년 13 + 2학년 21 + 3학년 21 = 55) */
export const DEFAULT_ROOMS_BY_GRADE = {
  1: 13,
  2: 15 + SPECIAL_ROOM_NAMES_GRADE_2.length,
  3: 13 + SPECIAL_ROOM_NAMES_GRADE_3.length,
} as const;

/**
 * 학교 기본 고사실 목록 (STEP 3).
 * - 1학년 13: 1~13반
 * - 2학년 21: 1~15반 + 특별실 6곳 (시험표 번호 16~21)
 * - 3학년 21: 1~13반 + 특별실 8곳 (시험표 번호 14~21, 영어실·수학실 포함)
 */
export function createDefaultRooms(): Room[] {
  return [
    ...classRooms(1, 1, 13),
    ...classRooms(2, 1, 15),
    ...SPECIAL_ROOM_NAMES_GRADE_2.map((label) => specialRoom(2, label, label)),
    ...classRooms(3, 1, 13),
    ...SPECIAL_ROOM_NAMES_GRADE_3.map((label) => specialRoom(3, label, label)),
  ];
}

export const DEFAULT_ROOM_COUNT = createDefaultRooms().length;

/** 기본 고사실 중 빠진 항목을 추가하고, 기본 순서(학년·반)로 정렬합니다. 사용자 추가 고사실(강당 등)은 뒤에 유지. */
export function mergeMissingDefaultRooms(rooms: Room[]): Room[] {
  const defaults = createDefaultRooms();
  const defaultNames = new Set(defaults.map((d) => d.name));
  const defaultIds = new Set(defaults.map((d) => d.id));

  const byName = new Map(rooms.map((r) => [r.name, r]));
  const byId = new Map(rooms.map((r) => [r.id, r]));

  const ordered: Room[] = [];
  for (const d of defaults) {
    ordered.push(byName.get(d.name) ?? byId.get(d.id) ?? d);
  }
  for (const r of rooms) {
    if (!defaultNames.has(r.name) && !defaultIds.has(r.id)) {
      ordered.push(r);
    }
  }

  if (ordered.length === rooms.length && ordered.every((r, i) => r.id === rooms[i]?.id)) {
    return rooms;
  }
  return ordered;
}
