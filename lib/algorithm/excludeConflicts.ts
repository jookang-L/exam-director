import type { Exam, Exclude as ExcludeT } from "@/lib/types";
import { isDutyAllowRule } from "./constraints";

export type ExcludeConflictKind = "fullExclude" | "emptyIntersection" | "intersection";

export type ExcludeConflict = {
  kind: ExcludeConflictKind;
  /** warning: 의도와 다르게 동작할 수 있음, info: 교집합으로 좁혀짐 */
  severity: "warning" | "info";
  message: string;
  otherId: string;
};

/** 같은 교사·겹치는 날짜/교시/고사실인지 */
function overlaps(a: ExcludeT, b: ExcludeT): boolean {
  if (a.teacherId !== b.teacherId) return false;
  if (a.date && b.date && a.date !== b.date) return false;
  if (a.period != null && b.period != null && Number(a.period) !== Number(b.period)) return false;
  if (a.roomId && b.roomId && a.roomId !== b.roomId) return false;
  return true;
}

function dutyNames(exam: Exam, ids: Iterable<string>): string {
  const names: string[] = [];
  for (const id of ids) names.push(exam.dutyTypes.find((d) => d.id === id)?.name ?? id);
  return names.join("·");
}

/** a 기준으로 본 b와의 충돌. 충돌이 없으면 null. */
function conflictBetween(exam: Exam, a: ExcludeT, b: ExcludeT): ExcludeConflict | null {
  if (a.id === b.id || !overlaps(a, b)) return null;
  const aAllow = isDutyAllowRule(a);
  const bAllow = isDutyAllowRule(b);
  if (!aAllow && !bAllow) return null;

  if (aAllow !== bAllow) {
    return {
      kind: "fullExclude",
      severity: "warning",
      otherId: b.id,
      message: aAllow
        ? "같은 시간대에 전체 제외가 있어 이 허용 조건은 적용되지 않습니다."
        : "같은 시간대에 허용 조건이 있지만 전체 제외가 우선이라 허용 조건은 적용되지 않습니다.",
    };
  }

  const aIds = new Set(a.allowedDutyTypeIds);
  const bIds = new Set(b.allowedDutyTypeIds);
  const common = [...aIds].filter((id) => bIds.has(id));
  if (common.length === 0) {
    return {
      kind: "emptyIntersection",
      severity: "warning",
      otherId: b.id,
      message: "겹치는 허용 조건의 교집합이 비어 있어 이 시간대에는 어떤 감독도 배정할 수 없습니다.",
    };
  }
  if (common.length === aIds.size && common.length === bIds.size) return null;
  return {
    kind: "intersection",
    severity: "info",
    otherId: b.id,
    message: `겹치는 허용 조건이 있어 교집합인 '${dutyNames(exam, common)}'만 허용됩니다.`,
  };
}

/** 조건 한 건(후보 포함)이 기존 조건들과 일으키는 충돌 */
export function conflictsFor(exam: Exam, rule: ExcludeT): ExcludeConflict[] {
  const out: ExcludeConflict[] = [];
  for (const other of exam.excludes) {
    const c = conflictBetween(exam, rule, other);
    if (c) out.push(c);
  }
  return out;
}

/** 등록된 모든 조건의 충돌 (조건 id별) */
export function conflictsByExclude(exam: Exam): Map<string, ExcludeConflict[]> {
  const map = new Map<string, ExcludeConflict[]>();
  for (const rule of exam.excludes) {
    const list = conflictsFor(exam, rule);
    if (list.length > 0) map.set(rule.id, list);
  }
  return map;
}
