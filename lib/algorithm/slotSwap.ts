import type { ConstraintContext } from "@/lib/algorithm/constraints";
import {
  evaluateForManualAssign,
  isManualOverrideReason,
  manualOverrideReasonFor,
  type ManualAssignEvaluation,
} from "@/lib/algorithm/manualAssignValidation";
import { newId } from "@/lib/types";
import type { Assignment, DutySlot, Exam, Preassign, Teacher } from "@/lib/types";

export type SlotSwapSide = {
  /** 이 교체로 새 슬롯을 맡게 되는 교사 */
  teacher: Teacher;
  fromSlot: DutySlot;
  toSlot: DutySlot;
  evaluation: ManualAssignEvaluation;
};

export type SlotSwapPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      sides: [SlotSwapSide, SlotSwapSide];
      /** 확인이 필요한 예외(C4·C7b·C8). 비어 있으면 바로 교체해도 된다. */
      exceptionMessages: string[];
      /** 교체 후의 배정·우선/고정 목록. 한 번에 patchExam 하면 실행 취소도 한 단계가 된다. */
      assignments: Assignment[];
      preassigns: Preassign[];
    };

function slotLabel(exam: Exam, slot: DutySlot): string {
  const room = exam.rooms.find((r) => r.id === slot.roomId)?.name ?? slot.roomId;
  const duty = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId)?.name ?? "";
  return `${slot.date} ${slot.period}교시 ${room}${duty ? ` ${duty}` : ""}`;
}

/**
 * 두 슬롯에 배정된 교사를 서로 맞바꾼다 (A의 슬롯 ↔ B의 슬롯).
 * 새 배치마다 수동 배정과 같은 검증을 하며, 차단 사유가 있으면 교체하지 않고
 * C4·C7b·C8 같은 확인 가능한 예외는 exceptionMessages로 돌려준다.
 */
export function planSlotSwap(exam: Exam, slotIdA: string, slotIdB: string): SlotSwapPlan {
  if (slotIdA === slotIdB) return { ok: false, message: "서로 다른 두 칸을 선택하세요." };

  const slotA = exam.dutySlots.find((s) => s.id === slotIdA);
  const slotB = exam.dutySlots.find((s) => s.id === slotIdB);
  if (!slotA || !slotB) return { ok: false, message: "선택한 감독 슬롯을 찾을 수 없습니다." };

  const assignmentA = exam.assignments.find((a) => a.dutySlotId === slotA.id);
  const assignmentB = exam.assignments.find((a) => a.dutySlotId === slotB.id);
  if (!assignmentA || !assignmentB) {
    return { ok: false, message: "배정된 칸끼리만 바꿀 수 있습니다." };
  }

  const teacherA = exam.teachers.find((t) => t.id === assignmentA.teacherId);
  const teacherB = exam.teachers.find((t) => t.id === assignmentB.teacherId);
  if (!teacherA || !teacherB) return { ok: false, message: "배정된 교사를 찾을 수 없습니다." };
  if (teacherA.id === teacherB.id) {
    return { ok: false, message: "같은 교사의 두 칸은 바꿀 수 없습니다." };
  }
  if (assignmentA.fixed || assignmentB.fixed) {
    return { ok: false, message: "고정된 배정은 바꿀 수 없습니다. 먼저 고정을 해제하세요." };
  }

  // 두 슬롯에 남아 있는 이전 수동 예외는 새 교사에게 해당하지 않으므로 평가에서 뺀다.
  const staleOverride = (p: Preassign) =>
    isManualOverrideReason(p.reason) && (p.dutySlotId === slotA.id || p.dutySlotId === slotB.id);
  const evalExam: Exam = { ...exam, preassigns: exam.preassigns.filter((p) => !staleOverride(p)) };
  const remaining = exam.assignments.filter((a) => a.id !== assignmentA.id && a.id !== assignmentB.id);

  // A → B의 슬롯, 그다음 B → A의 슬롯. 뒤쪽 평가에는 앞쪽 새 배치를 반영한다.
  const toSlotB: Assignment = { ...assignmentB, teacherId: teacherA.id };
  const toSlotA: Assignment = { ...assignmentA, teacherId: teacherB.id };
  const ctxA: ConstraintContext = { exam: evalExam, assignments: remaining };
  const ctxB: ConstraintContext = { exam: evalExam, assignments: [...remaining, toSlotB] };
  const sides: [SlotSwapSide, SlotSwapSide] = [
    {
      teacher: teacherA,
      fromSlot: slotA,
      toSlot: slotB,
      evaluation: evaluateForManualAssign(ctxA, slotB, teacherA),
    },
    {
      teacher: teacherB,
      fromSlot: slotB,
      toSlot: slotA,
      evaluation: evaluateForManualAssign(ctxB, slotA, teacherB),
    },
  ];

  const blocked = sides.filter((side) => !side.evaluation.allowed);
  if (blocked.length > 0) {
    const lines = blocked.map(
      (side) =>
        `${side.teacher.name} → ${slotLabel(exam, side.toSlot)}: ${side.evaluation.blocking
          .map((reason) => reason.message)
          .join(" · ")}`,
    );
    return { ok: false, message: lines.join("\n") };
  }

  const exceptionMessages = sides.flatMap((side) => {
    const { c4, c7b, c8 } = side.evaluation;
    return [...c4, ...c7b, ...c8].map(
      (reason) =>
        `[${reason.code}] ${side.teacher.name} → ${slotLabel(exam, side.toSlot)}: ${reason.message}`,
    );
  });

  const overrides: Preassign[] = sides.flatMap((side) => {
    const reason = manualOverrideReasonFor(side.evaluation);
    return reason
      ? [
          {
            id: newId(),
            teacherId: side.teacher.id,
            dutySlotId: side.toSlot.id,
            priority: "preferred" as const,
            reason,
          },
        ]
      : [];
  });

  return {
    ok: true,
    sides,
    exceptionMessages,
    assignments: exam.assignments.map((a) =>
      a.id === assignmentA.id ? toSlotA : a.id === assignmentB.id ? toSlotB : a,
    ),
    preassigns: [...exam.preassigns.filter((p) => !staleOverride(p)), ...overrides],
  };
}

export function swapConfirmMessage(exceptionMessages: readonly string[]): string {
  return [
    "바꾸려면 아래 예외를 확인해야 합니다.",
    ...exceptionMessages.map((message) => `· ${message}`),
    "",
    "자동 배정에서는 금지되거나 권장되지 않지만, 수동 수정에서 의도적으로 예외 배정으로 반영합니다.",
    "그래도 바꾸시겠습니까?",
  ].join("\n");
}
