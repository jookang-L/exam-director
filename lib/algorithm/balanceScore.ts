import type { Assignment, Exam, Teacher } from "@/lib/types";
import {
  DEFAULT_DUTY_WEIGHT_FALLBACK,
  ROLE_BALANCE_ALLOWED_SPREAD,
} from "@/lib/fatigueWeights";
import { hasNoPreviousFatigue, isIncludedInAverageFatigue } from "./averageFatigue";
import { buildExamLookups, type ExamLookups } from "./constraintIndexes";
import { timetableClassBurden } from "./timetableFatigue";
import { buildFixedAssignments } from "./fixed";
import {
  buildAssignedMassTargets,
  buildBalancePlan,
  type BalancePlan,
} from "./targetFatigue";

export type BalanceSpreads = {
  chiefSpread: number;
  assistantSpread: number;
  totalFatigueSpread: number;
  eligibleCount: number;
};

export type SolverRunScore = {
  constraintErrors: number;
  unassigned: number;
  chiefSpread: number;
  assistantSpread: number;
  totalFatigueSpread: number;
  roleBalanceAcceptable: boolean;
  maxTargetExcess: number;
  targetSSD: number;
};

/** 평균 누적도와 동일 — 강사·영양·평가담당·고사기간 전체 제외 제외. 해당 후보 없으면 전체 후보 사용 */
export function teachersForBalanceStats(exam: Exam, candidates: Teacher[]): Teacher[] {
  const included = candidates.filter((t) => isIncludedInAverageFatigue(exam, t));
  return included.length > 0 ? included : candidates;
}

function spread(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

function countChiefAssistant(assignments: Assignment[], lookups: ExamLookups) {
  const chief = new Map<string, number>();
  const assistant = new Map<string, number>();
  for (const a of assignments) {
    const slot = lookups.slotById.get(a.dutySlotId);
    if (!slot) continue;
    const dt = lookups.dutyTypeById.get(slot.dutyTypeId);
    if (dt?.name === "정감독") {
      chief.set(a.teacherId, (chief.get(a.teacherId) ?? 0) + 1);
    } else if (dt?.name === "부감독") {
      assistant.set(a.teacherId, (assistant.get(a.teacherId) ?? 0) + 1);
    }
  }
  return { chief, assistant };
}

function teacherTotalFatigueFast(exam: Exam, teacher: Teacher, lookups: ExamLookups): number {
  let dutyWeight = 0;
  for (const a of exam.assignments) {
    if (a.teacherId !== teacher.id) continue;
    const slot = lookups.slotById.get(a.dutySlotId);
    if (!slot) continue;
    dutyWeight += lookups.dutyTypeById.get(slot.dutyTypeId)?.weight ?? DEFAULT_DUTY_WEIGHT_FALLBACK;
  }
  const current = dutyWeight + timetableClassBurden(exam, teacher.id);
  return (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio + current;
}

/** 정·부 횟수는 균형 대상 전체, 총피로도 편차는 이전 곤란도가 있는 사람만. 신규만 있으면 전체를 쓴다. */
export function computeBalanceSpreads(exam: Exam, lookups?: ExamLookups): BalanceSpreads {
  const lu = lookups ?? buildExamLookups(exam);
  const eligible = exam.teachers.filter((t) => isIncludedInAverageFatigue(exam, t));
  const veterans = eligible.filter((t) => !hasNoPreviousFatigue(t));
  const fatiguePool = veterans.length > 0 ? veterans : eligible;
  const { chief, assistant } = countChiefAssistant(exam.assignments, lu);

  const chiefVals = eligible.map((t) => chief.get(t.id) ?? 0);
  const assistantVals = eligible.map((t) => assistant.get(t.id) ?? 0);
  const totalVals = fatiguePool.map((t) => teacherTotalFatigueFast(exam, t, lu));

  return {
    chiefSpread: spread(chiefVals),
    assistantSpread: spread(assistantVals),
    totalFatigueSpread: spread(totalVals),
    eligibleCount: eligible.length,
  };
}

/** 목표 초과·SSD는 계획 목표가 아니라, 이번에 배정된 감독 점수로 다시 만든 목표를 쓴다. */
export function scoreSolverResult(
  exam: Exam,
  result: {
    assignments: Assignment[];
    unassigned: unknown[];
    validationErrors?: unknown[];
  },
  providedPlan?: BalancePlan,
): SolverRunScore {
  const lookups = buildExamLookups(exam);
  const trial = { ...exam, assignments: result.assignments };
  const spreads = computeBalanceSpreads(trial, lookups);
  const plan = providedPlan ?? buildScoreBalancePlan(exam, lookups);
  const targets = buildAssignedMassTargets(exam, plan, result.assignments, lookups);
  const totals = new Map<string, number>();
  for (const teacher of exam.teachers) {
    if (!plan.eligibleTeacherIds.has(teacher.id)) continue;
    totals.set(teacher.id, teacherTotalFatigueFast(trial, teacher, lookups));
  }
  let maxTargetExcess = 0;
  let targetSSD = 0;
  for (const [teacherId, total] of totals) {
    const target = targets.get(teacherId) ?? total;
    const delta = total - target;
    maxTargetExcess = Math.max(maxTargetExcess, delta);
    targetSSD += delta * delta;
  }
  return {
    constraintErrors: result.validationErrors?.length ?? 0,
    unassigned: result.unassigned.length,
    chiefSpread: spreads.chiefSpread,
    assistantSpread: spreads.assistantSpread,
    totalFatigueSpread: spreads.totalFatigueSpread,
    roleBalanceAcceptable:
      spreads.chiefSpread <= ROLE_BALANCE_ALLOWED_SPREAD &&
      spreads.assistantSpread <= ROLE_BALANCE_ALLOWED_SPREAD,
    maxTargetExcess: Math.max(0, maxTargetExcess),
    targetSSD,
  };
}

function buildScoreBalancePlan(exam: Exam, lookups: ExamLookups): BalancePlan {
  const initial = buildFixedAssignments(exam);
  const filled = new Set(initial.map((assignment) => assignment.dutySlotId));
  const remaining = exam.dutySlots.filter((slot) => !filled.has(slot.id));
  return buildBalancePlan(exam, initial, remaining, lookups);
}

export function isBetterSolverScore(next: SolverRunScore, best: SolverRunScore | null): boolean {
  if (!best) return true;
  if (next.constraintErrors !== best.constraintErrors) {
    return next.constraintErrors < best.constraintErrors;
  }
  if (next.unassigned !== best.unassigned) return next.unassigned < best.unassigned;
  if (next.roleBalanceAcceptable !== best.roleBalanceAcceptable) {
    return next.roleBalanceAcceptable;
  }
  if (next.maxTargetExcess !== best.maxTargetExcess) {
    return next.maxTargetExcess < best.maxTargetExcess;
  }
  if (next.targetSSD !== best.targetSSD) return next.targetSSD < best.targetSSD;
  const nextBalance = next.chiefSpread + next.assistantSpread;
  const bestBalance = best.chiefSpread + best.assistantSpread;
  if (nextBalance !== bestBalance) return nextBalance < bestBalance;
  if (next.totalFatigueSpread !== best.totalFatigueSpread) {
    return next.totalFatigueSpread < best.totalFatigueSpread;
  }
  return false;
}
