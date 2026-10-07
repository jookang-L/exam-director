import {
  evaluateAll,
  MANUAL_C4_OVERRIDE_REASON,
  type ConstraintContext,
  type ConstraintReason,
} from "@/lib/algorithm/constraints";
import type { DutySlot, Teacher } from "@/lib/types";

export const C4_CONSTRAINT_CODE = "C4";
export const C7B_CONSTRAINT_CODE = "C7b";
export const C8_CONSTRAINT_CODE = "C8";

export const MANUAL_C8_OVERRIDE_REASON = "manual-C8-override";
export { MANUAL_C4_OVERRIDE_REASON };

export function isManualOverrideReason(reason: string | undefined): boolean {
  return reason === MANUAL_C4_OVERRIDE_REASON || reason === MANUAL_C8_OVERRIDE_REASON;
}

export function isC4Reason(reason: ConstraintReason): boolean {
  return reason.code === C4_CONSTRAINT_CODE;
}

export function isC7bReason(reason: ConstraintReason): boolean {
  return reason.code === C7B_CONSTRAINT_CODE;
}

export function isC8Reason(reason: ConstraintReason): boolean {
  return reason.code === C8_CONSTRAINT_CODE;
}

export function splitConstraintReasons(reasons: readonly ConstraintReason[]): {
  blocking: ConstraintReason[];
  c4: ConstraintReason[];
  c7b: ConstraintReason[];
  c8: ConstraintReason[];
} {
  const c4: ConstraintReason[] = [];
  const c7b: ConstraintReason[] = [];
  const c8: ConstraintReason[] = [];
  const blocking: ConstraintReason[] = [];
  for (const reason of reasons) {
    if (isC4Reason(reason)) c4.push(reason);
    else if (isC7bReason(reason)) c7b.push(reason);
    else if (isC8Reason(reason)) c8.push(reason);
    else blocking.push(reason);
  }
  return { blocking, c4, c7b, c8 };
}

export type ManualAssignEvaluation = {
  allowed: boolean;
  needsC4Confirm: boolean;
  needsC7bConfirm: boolean;
  needsC8Confirm: boolean;
  blocking: ConstraintReason[];
  c4: ConstraintReason[];
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
      needsC4Confirm: false,
      needsC7bConfirm: false,
      needsC8Confirm: false,
      blocking: [],
      c4: [],
      c7b: [],
      c8: [],
    };
  }
  const { blocking, c4, c7b, c8 } = splitConstraintReasons(result.reasons);
  if (blocking.length === 0 && (c4.length > 0 || c7b.length > 0 || c8.length > 0)) {
    return {
      allowed: true,
      needsC4Confirm: c4.length > 0,
      needsC7bConfirm: c7b.length > 0,
      needsC8Confirm: c8.length > 0,
      blocking,
      c4,
      c7b,
      c8,
    };
  }
  return {
    allowed: false,
    needsC4Confirm: false,
    needsC7bConfirm: false,
    needsC8Confirm: false,
    blocking,
    c4,
    c7b,
    c8,
  };
}

export type ManualAssignFit = "ok" | "warning" | "blocked";

export function classifyManualAssignFit(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ManualAssignFit {
  const evaluation = evaluateForManualAssign(ctx, slot, teacher);
  const needsConfirm =
    evaluation.needsC4Confirm || evaluation.needsC7bConfirm || evaluation.needsC8Confirm;
  if (evaluation.allowed && !needsConfirm) return "ok";
  if (evaluation.allowed && needsConfirm) return "warning";
  return "blocked";
}

/** 후보 목록·툴팁에 보여줄 사유 문구 (차단 사유 + 확인이 필요한 예외 사유). */
export function manualAssignReasonMessages(evaluation: ManualAssignEvaluation): string[] {
  return [...evaluation.blocking, ...evaluation.c4, ...evaluation.c7b, ...evaluation.c8].map(
    (reason) => reason.message,
  );
}

/** 이 수동 배정을 예외로 남길 때 STEP 9에 기록할 사유. 예외가 없으면 null. */
export function manualOverrideReasonFor(evaluation: ManualAssignEvaluation): string | null {
  if (evaluation.needsC4Confirm) return MANUAL_C4_OVERRIDE_REASON;
  if (evaluation.needsC8Confirm) return MANUAL_C8_OVERRIDE_REASON;
  return null;
}

export function c4ConfirmMessage(c4: readonly ConstraintReason[]): string {
  const lines = c4.map((reason) => `· ${reason.message}`);
  return [
    "C4 경고: 강사는 부감독만 맡는 것이 원칙입니다.",
    ...lines,
    "",
    "자동 배정에서는 금지되지만, 수동 수정에서 의도적으로 예외 배정으로 반영합니다.",
    "그래도 배정하시겠습니까?",
  ].join("\n");
}

export function confirmManualC4Override(c4: readonly ConstraintReason[]): boolean {
  if (c4.length === 0) return true;
  return confirm(c4ConfirmMessage(c4));
}

export function c7bConfirmMessage(c7b: readonly ConstraintReason[]): string {
  const lines = c7b.map((reason) => `· ${reason.message}`);
  return [
    "C7b 경고: 하루 3교시 배정 시 가운데 교시는 자습감독 또는 복도감독이어야 합니다.",
    ...lines,
    "",
    "수동 반영 시에는 예외로 허용할 수 있습니다.",
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
