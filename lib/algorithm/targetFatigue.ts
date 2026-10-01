import type { Assignment, DutySlot, Exam, Teacher } from "@/lib/types";
import { DEFAULT_DUTY_WEIGHT_FALLBACK } from "@/lib/fatigueWeights";
import { hasNoPreviousFatigue, isIncludedInAverageFatigue } from "./averageFatigue";
import { buildExamLookups, type ExamLookups } from "./constraintIndexes";
import { evaluateAll, type ConstraintContext } from "./constraints";
import { timetableClassBurden } from "./timetableFatigue";

export type FeasibleSlot = {
  id: string;
  date: string;
  period: number;
  selfStudy: boolean;
  weight: number;
};

export type BalancePlan = {
  eligibleTeacherIds: Set<string>;
  baselineByTeacher: Map<string, number>;
  capacityByTeacher: Map<string, number>;
  targetByTeacher: Map<string, number>;
  balanceableRemainingWeight: number;
  /** 계획 시점에 남은 슬롯 중, 균형 대상 누군가가 맡을 수 있는 슬롯 */
  openSlotIds: Set<string>;
  /** 교사별로 제약 검사를 통과한 남은 슬롯. 점수 계산은 이 목록을 배정된 슬롯으로 거른다. */
  feasibleSlotsByTeacher: Map<string, FeasibleSlot[]>;
};

type PeriodOption = { period: number; selfStudy: boolean; weight: number };
type DayEntry = { period: number; selfStudy: boolean };

function slotWeight(lookups: ExamLookups, slot: DutySlot): number {
  return lookups.dutyTypeById.get(slot.dutyTypeId)?.weight ?? DEFAULT_DUTY_WEIGHT_FALLBACK;
}

function assignmentWeightByTeacher(
  assignments: Assignment[],
  lookups: ExamLookups,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const assignment of assignments) {
    const slot = lookups.slotById.get(assignment.dutySlotId);
    if (!slot) continue;
    result.set(
      assignment.teacherId,
      (result.get(assignment.teacherId) ?? 0) + slotWeight(lookups, slot),
    );
  }
  return result;
}

function initialDayEntries(
  teacherId: string,
  assignments: Assignment[],
  lookups: ExamLookups,
): Map<string, DayEntry[]> {
  const byDate = new Map<string, DayEntry[]>();
  for (const assignment of assignments) {
    if (assignment.teacherId !== teacherId) continue;
    const slot = lookups.slotById.get(assignment.dutySlotId);
    if (!slot) continue;
    const selfStudy = lookups.dutyTypeById.get(slot.dutyTypeId)?.name === "자습감독";
    const entries = byDate.get(slot.date) ?? [];
    entries.push({ period: slot.period, selfStudy });
    byDate.set(slot.date, entries);
  }
  return byDate;
}

function validC7Pattern(teacher: Teacher, entries: DayEntry[]): boolean {
  if (entries.length > 3) return false;
  if (entries.length < 3 || teacher.roleType === "강사") return true;
  const sorted = [...entries].sort((a, b) => a.period - b.period);
  const minPeriod = sorted[0]!.period;
  const maxPeriod = sorted[sorted.length - 1]!.period;
  return sorted.some(
    (entry) => entry.selfStudy && entry.period > minPeriod && entry.period < maxPeriod,
  );
}

function maxAdditionalDayCapacity(
  teacher: Teacher,
  existing: DayEntry[],
  optionsByPeriod: Map<number, PeriodOption[]>,
): number {
  const maxAdds = Math.max(0, 3 - existing.length);
  if (maxAdds === 0 || optionsByPeriod.size === 0) return 0;

  const periods = [...optionsByPeriod.keys()].sort((a, b) => a - b);
  let best = 0;

  function visit(index: number, selected: PeriodOption[], weight: number) {
    if (selected.length > maxAdds) return;
    if (index >= periods.length) {
      const combined = [
        ...existing,
        ...selected.map((option) => ({
          period: option.period,
          selfStudy: option.selfStudy,
        })),
      ];
      if (validC7Pattern(teacher, combined)) best = Math.max(best, weight);
      return;
    }

    visit(index + 1, selected, weight);
    if (selected.length >= maxAdds) return;
    for (const option of optionsByPeriod.get(periods[index]!) ?? []) {
      selected.push(option);
      visit(index + 1, selected, weight + option.weight);
      selected.pop();
    }
  }

  visit(0, [], 0);
  return best;
}

function collectFeasibleSlots(
  exam: Exam,
  teacher: Teacher,
  initialAssignments: Assignment[],
  remainingSlots: DutySlot[],
  lookups: ExamLookups,
  openSlotIds: Set<string>,
): FeasibleSlot[] {
  const ctx: ConstraintContext = { exam, assignments: initialAssignments, lookups };
  const found: FeasibleSlot[] = [];
  for (const slot of remainingSlots) {
    if (!evaluateAll(ctx, slot, teacher).ok) continue;
    openSlotIds.add(slot.id);
    found.push({
      id: slot.id,
      date: slot.date,
      period: slot.period,
      selfStudy: lookups.dutyTypeById.get(slot.dutyTypeId)?.name === "자습감독",
      weight: slotWeight(lookups, slot),
    });
  }
  return found;
}

function capacityFromFeasibleSlots(
  teacher: Teacher,
  existingByDate: Map<string, DayEntry[]>,
  slots: FeasibleSlot[],
): number {
  const optionsByDate = new Map<string, Map<number, PeriodOption[]>>();
  for (const slot of slots) {
    let periods = optionsByDate.get(slot.date);
    if (!periods) {
      periods = new Map();
      optionsByDate.set(slot.date, periods);
    }
    const options = periods.get(slot.period) ?? [];
    const sameKind = options.find((option) => option.selfStudy === slot.selfStudy);
    if (sameKind) {
      sameKind.weight = Math.max(sameKind.weight, slot.weight);
    } else {
      options.push({ period: slot.period, selfStudy: slot.selfStudy, weight: slot.weight });
    }
    periods.set(slot.period, options);
  }

  let capacity = 0;
  for (const [date, options] of optionsByDate) {
    capacity += maxAdditionalDayCapacity(teacher, existingByDate.get(date) ?? [], options);
  }
  return capacity;
}

function teacherBaseline(exam: Exam, teacher: Teacher, alreadyDuty: number): number {
  return (
    (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio +
    timetableClassBurden(exam, teacher.id) +
    alreadyDuty
  );
}

/**
 * 신규 몫과 기존 물 채우기.
 * 계획과 점수는 같은 식을 쓰고, 감독량·상한·고정분 보정만 다르게 넘긴다.
 * floorFreshTargetToAlready는 점수 계산에서만 켠다. 고정 배정이 μ를 넘으면 목표를 그 양까지 올린다.
 */
function allocateBalanceTargets(
  exam: Exam,
  included: Teacher[],
  alreadyByTeacher: Map<string, number>,
  capacityByTeacher: Map<string, number>,
  baselineByTeacher: Map<string, number>,
  dutyWeightTotal: number,
  distributableAdditional: number,
  floorFreshTargetToAlready: boolean,
): Map<string, number> {
  const classSum = included.reduce(
    (sum, teacher) => sum + timetableClassBurden(exam, teacher.id),
    0,
  );
  // μ는 E 전체(신규+기존)의 이번 감독 점수와 수업 점수 평균이다.
  // 수업이 기존 사람에게 몰리면 μ가 올라가고 신규 목표도 같이 올라간다.
  const mu = included.length > 0 ? (dutyWeightTotal + classSum) / included.length : 0;

  const targetByTeacher = new Map<string, number>();
  let freshReservedAdditional = 0;
  for (const teacher of included) {
    if (!hasNoPreviousFatigue(teacher)) continue;
    const already = alreadyByTeacher.get(teacher.id) ?? 0;
    const classScore = timetableClassBurden(exam, teacher.id);
    const dutyCap = already + (capacityByTeacher.get(teacher.id) ?? 0);
    let dutyTarget = Math.min(dutyCap, Math.max(0, mu - classScore));
    if (floorFreshTargetToAlready) dutyTarget = Math.max(dutyTarget, already);
    targetByTeacher.set(teacher.id, classScore + dutyTarget);
    freshReservedAdditional += Math.max(0, dutyTarget - already);
  }

  const veteranEligible = included.filter(
    (teacher) => !hasNoPreviousFatigue(teacher) && (capacityByTeacher.get(teacher.id) ?? 0) > 0,
  );
  const veteranBaselines = new Map<string, number>();
  const veteranCaps = new Map<string, number>();
  for (const teacher of veteranEligible) {
    veteranBaselines.set(teacher.id, baselineByTeacher.get(teacher.id) ?? 0);
    veteranCaps.set(teacher.id, capacityByTeacher.get(teacher.id) ?? 0);
  }
  const veteranTargets = waterFillTargets(
    veteranEligible,
    veteranBaselines,
    veteranCaps,
    Math.max(0, distributableAdditional - freshReservedAdditional),
  );
  for (const [teacherId, target] of veteranTargets) targetByTeacher.set(teacherId, target);
  for (const teacher of included) {
    if (hasNoPreviousFatigue(teacher) || targetByTeacher.has(teacher.id)) continue;
    targetByTeacher.set(teacher.id, baselineByTeacher.get(teacher.id) ?? 0);
  }
  return targetByTeacher;
}

export function waterFillTargets(
  teachers: Teacher[],
  baselineByTeacher: Map<string, number>,
  capacityByTeacher: Map<string, number>,
  requestedWork: number,
): Map<string, number> {
  const targets = new Map<string, number>();
  if (teachers.length === 0) return targets;

  const totalCapacity = teachers.reduce(
    (sum, teacher) => sum + (capacityByTeacher.get(teacher.id) ?? 0),
    0,
  );
  const work = Math.max(0, Math.min(requestedWork, totalCapacity));
  let low = Math.min(...teachers.map((teacher) => baselineByTeacher.get(teacher.id) ?? 0));
  let high = Math.max(
    ...teachers.map(
      (teacher) =>
        (baselineByTeacher.get(teacher.id) ?? 0) +
        (capacityByTeacher.get(teacher.id) ?? 0),
    ),
  );

  const allocatedAt = (level: number) =>
    teachers.reduce((sum, teacher) => {
      const baseline = baselineByTeacher.get(teacher.id) ?? 0;
      const capacity = capacityByTeacher.get(teacher.id) ?? 0;
      return sum + Math.max(0, Math.min(level - baseline, capacity));
    }, 0);

  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2;
    if (allocatedAt(mid) < work) low = mid;
    else high = mid;
  }

  for (const teacher of teachers) {
    const baseline = baselineByTeacher.get(teacher.id) ?? 0;
    const capacity = capacityByTeacher.get(teacher.id) ?? 0;
    const additional = Math.max(0, Math.min(high - baseline, capacity));
    targets.set(teacher.id, baseline + additional);
  }
  return targets;
}

export function buildBalancePlan(
  exam: Exam,
  initialAssignments: Assignment[],
  remainingSlots: DutySlot[],
  providedLookups?: ExamLookups,
  allowedTeacherIds?: Set<string> | null,
): BalancePlan {
  const lookups = providedLookups ?? buildExamLookups(exam);
  const assignmentWeights = assignmentWeightByTeacher(initialAssignments, lookups);
  const baselineByTeacher = new Map<string, number>();
  const capacityByTeacher = new Map<string, number>();
  const feasibleSlotsByTeacher = new Map<string, FeasibleSlot[]>();
  const openSlotIds = new Set<string>();

  const included = exam.teachers.filter(
    (teacher) =>
      isIncludedInAverageFatigue(exam, teacher) &&
      (!allowedTeacherIds || allowedTeacherIds.has(teacher.id)),
  );
  for (const teacher of included) {
    const already = assignmentWeights.get(teacher.id) ?? 0;
    baselineByTeacher.set(teacher.id, teacherBaseline(exam, teacher, already));
    const feasible = collectFeasibleSlots(
      exam,
      teacher,
      initialAssignments,
      remainingSlots,
      lookups,
      openSlotIds,
    );
    feasibleSlotsByTeacher.set(teacher.id, feasible);
    capacityByTeacher.set(
      teacher.id,
      capacityFromFeasibleSlots(
        teacher,
        initialDayEntries(teacher.id, initialAssignments, lookups),
        feasible,
      ),
    );
  }

  const eligible = included.filter((teacher) => (capacityByTeacher.get(teacher.id) ?? 0) > 0);
  const eligibleTeacherIds = new Set(eligible.map((teacher) => teacher.id));
  const balanceableRemainingWeight = remainingSlots.reduce(
    (sum, slot) => sum + (openSlotIds.has(slot.id) ? slotWeight(lookups, slot) : 0),
    0,
  );
  const assignedToIncluded = included.reduce(
    (sum, teacher) => sum + (assignmentWeights.get(teacher.id) ?? 0),
    0,
  );
  const targetByTeacher = allocateBalanceTargets(
    exam,
    included,
    assignmentWeights,
    capacityByTeacher,
    baselineByTeacher,
    assignedToIncluded + balanceableRemainingWeight,
    balanceableRemainingWeight,
    false,
  );

  return {
    eligibleTeacherIds,
    baselineByTeacher,
    capacityByTeacher,
    targetByTeacher,
    balanceableRemainingWeight,
    openSlotIds,
    feasibleSlotsByTeacher,
  };
}

/** 점수 전용 목표. 계획은 그대로 두고, 이번에 배정된 감독 점수만으로 같은 식을 다시 계산한다. */
export function buildAssignedMassTargets(
  exam: Exam,
  plan: BalancePlan,
  assignments: Assignment[],
  providedLookups?: ExamLookups,
): Map<string, number> {
  const lookups = providedLookups ?? buildExamLookups(exam);
  const included = exam.teachers.filter((teacher) => plan.baselineByTeacher.has(teacher.id));
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.dutySlotId));
  const locked = assignments.filter((assignment) => !plan.openSlotIds.has(assignment.dutySlotId));
  const lockedWeights = assignmentWeightByTeacher(locked, lookups);
  const actualWeights = assignmentWeightByTeacher(assignments, lookups);

  const alreadyByTeacher = new Map<string, number>();
  const capacityByTeacher = new Map<string, number>();
  const baselineByTeacher = new Map<string, number>();
  let actualDuty = 0;
  let lockedDuty = 0;

  for (const teacher of included) {
    const already = lockedWeights.get(teacher.id) ?? 0;
    alreadyByTeacher.set(teacher.id, already);
    actualDuty += actualWeights.get(teacher.id) ?? 0;
    lockedDuty += already;
    const feasible = (plan.feasibleSlotsByTeacher.get(teacher.id) ?? []).filter((slot) =>
      assignedSlotIds.has(slot.id),
    );
    capacityByTeacher.set(
      teacher.id,
      capacityFromFeasibleSlots(teacher, initialDayEntries(teacher.id, locked, lookups), feasible),
    );
    baselineByTeacher.set(teacher.id, teacherBaseline(exam, teacher, already));
  }

  return allocateBalanceTargets(
    exam,
    included,
    alreadyByTeacher,
    capacityByTeacher,
    baselineByTeacher,
    actualDuty,
    Math.max(0, actualDuty - lockedDuty),
    true,
  );
}
