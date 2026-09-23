import {
  evaluateAll,
  type ConstraintContext,
  type ConstraintReason,
} from "@/lib/algorithm/constraints";
import type { DutySlot, Teacher } from "@/lib/types";

export const C7B_CONSTRAINT_CODE = "C7b";
export const C8_CONSTRAINT_CODE = "C8";

export function isC7bReason(reason: ConstraintReason): boolean {
  return reason.code === C7B_CONSTRAINT_CODE;
}

export function isC8Reason(reason: ConstraintReason): boolean {
  return reason.code === C8_CONSTRAINT_CODE;
}

export function splitConstraintReasons(reasons: readonly ConstraintReason[]): {
  blocking: ConstraintReason[];
  c7b: ConstraintReason[];
  c8: ConstraintReason[];
} {
  const c7b: ConstraintReason[] = [];
  const c8: ConstraintReason[] = [];
  const blocking: ConstraintReason[] = [];
  for (const reason of reasons) {
    if (isC7bReason(reason)) c7b.push(reason);
    else if (isC8Reason(reason)) c8.push(reason);
    else blocking.push(reason);
  }
  return { blocking, c7b, c8 };
}

export type ManualAssignEvaluation = {
  allowed: boolean;
  needsC7bConfirm: boolean;
  needsC8Confirm: boolean;
  blocking: ConstraintReason[];
  c7b: ConstraintReason[];
  c8: ConstraintReason[];
};

export function evaluateForManualAssign(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ManualAssignEvaluation {
  const result = evaluateAll(ctx, slot, teacher);
  if (result.ok) {
    return {
      allowed: true,
      needsC7bConfirm: false,
      needsC8Confirm: false,
      blocking: [],
      c7b: [],
      c8: [],
    };
  }
  const { blocking, c7b, c8 } = splitConstraintReasons(result.reasons);
  if (blocking.length === 0 && (c7b.length > 0 || c8.length > 0)) {
    return {
      allowed: true,
      needsC7bConfirm: c7b.length > 0,
      needsC8Confirm: c8.length > 0,
      blocking,
      c7b,
      c8,
    };
  }
  return { allowed: false, needsC7bConfirm: false, needsC8Confirm: false, blocking, c7b, c8 };
}

export type ManualAssignFit = "ok" | "warning" | "blocked";

export function classifyManualAssignFit(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ManualAssignFit {
  const evaluation = evaluateForManualAssign(ctx, slot, teacher);
  if (evaluation.allowed && !evaluation.needsC7bConfirm && !evaluation.needsC8Confirm) return "ok";
  if (evaluation.allowed && (evaluation.needsC7bConfirm || evaluation.needsC8Confirm)) return "warning";
  return "blocked";
}

export function c7bConfirmMessage(c7b: readonly ConstraintReason[]): string {
  const lines = c7b.map((reason) => `· ${reason.message}`);
  return [
    "C7b 경고: 하루 3교시 배정 시 가운데 교시는 자습감독이어야 합니다.",
    ...lines,
    "",
    "자동 배정에서는 적용되지 않지만, 수동 반영 시 예외로 허용할 수 있습니다.",
    "그래도 배정하시겠습니까?",
  ].join("\n");
}

export function confirmManualC7bOverride(c7b: readonly ConstraintReason[]): boolean {
  if (c7b.length === 0) return true;
  return confirm(c7bConfirmMessage(c7b));
}

export function c8ConfirmMessage(c8: readonly ConstraintReason[]): string {
  const lines = c8.map((reason) => `· ${reason.message}`);
  return [
    "C8 경고: 시험 과목 담당 교사는 해당 교시에 감독 배정하지 않는 것이 원칙입니다.",
    ...lines,
    "",
    "수동 수정에서 의도적으로 예외 배정으로 반영합니다.",
    "그래도 배정하시겠습니까?",
  ].join("\n");
}

export function confirmManualC8Override(c8: readonly ConstraintReason[]): boolean {
  if (c8.length === 0) return true;
  return confirm(c8ConfirmMessage(c8));
}
