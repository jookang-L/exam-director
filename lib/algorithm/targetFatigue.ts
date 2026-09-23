import type { Assignment, DutySlot, Exam, Teacher } from "@/lib/types";
import { DEFAULT_DUTY_WEIGHT_FALLBACK } from "@/lib/fatigueWeights";
import { isIncludedInAverageFatigue } from "./averageFatigue";
import { buildExamLookups, type ExamLookups } from "./constraintIndexes";
import { evaluateAll, type ConstraintContext } from "./constraints";
import { timetableClassBurden } from "./timetableFatigue";

export type BalancePlan = {
  eligibleTeacherIds: Set<string>;
  baselineByTeacher: Map<string, number>;
  capacityByTeacher: Map<string, number>;
  targetByTeacher: Map<string, number>;
  balanceableRemainingWeight: number;
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

function buildTeacherCapacity(
  exam: Exam,
  teacher: Teacher,
  initialAssignments: Assignment[],
  remainingSlots: DutySlot[],
  lookups: ExamLookups,
  eligibleSlotIds: Set<string>,
): number {
  const ctx: ConstraintContext = { exam, assignments: initialAssignments, lookups };
  const existingByDate = initialDayEntries(teacher.id, initialAssignments, lookups);
  const optionsByDate = new Map<string, Map<number, PeriodOption[]>>();

  for (const slot of remainingSlots) {
    if (!evaluateAll(ctx, slot, teacher).ok) continue;
    eligibleSlotIds.add(slot.id);

    let periods = optionsByDate.get(slot.date);
    if (!periods) {
      periods = new Map();
      optionsByDate.set(slot.date, periods);
    }
    const selfStudy = lookups.dutyTypeById.get(slot.dutyTypeId)?.name === "자습감독";
    const options = periods.get(slot.period) ?? [];
    const sameKind = options.find((option) => option.selfStudy === selfStudy);
    const weight = slotWeight(lookups, slot);
    if (sameKind) {
      sameKind.weight = Math.max(sameKind.weight, weight);
    } else {
      options.push({ period: slot.period, selfStudy, weight });
    }
    periods.set(slot.period, options);
  }

  let capacity = 0;
  for (const [date, options] of optionsByDate) {
    capacity += maxAdditionalDayCapacity(
      teacher,
      existingByDate.get(date) ?? [],
      options,
    );
  }
  return capacity;
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
  const eligibleSlotIds = new Set<string>();

  const included = exam.teachers.filter(
    (teacher) =>
      isIncludedInAverageFatigue(exam, teacher) &&
      (!allowedTeacherIds || allowedTeacherIds.has(teacher.id)),
  );
  for (const teacher of included) {
    baselineByTeacher.set(
      teacher.id,
      (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio +
        timetableClassBurden(exam, teacher.id) +
        (assignmentWeights.get(teacher.id) ?? 0),
    );
    capacityByTeacher.set(
      teacher.id,
      buildTeacherCapacity(
        exam,
        teacher,
        initialAssignments,
        remainingSlots,
        lookups,
        eligibleSlotIds,
      ),
    );
  }

  const eligible = included.filter((teacher) => (capacityByTeacher.get(teacher.id) ?? 0) > 0);
  const eligibleTeacherIds = new Set(eligible.map((teacher) => teacher.id));
  const balanceableRemainingWeight = remainingSlots.reduce(
    (sum, slot) => sum + (eligibleSlotIds.has(slot.id) ? slotWeight(lookups, slot) : 0),
    0,
  );
  const targetByTeacher = waterFillTargets(
    eligible,
    baselineByTeacher,
    capacityByTeacher,
    balanceableRemainingWeight,
  );

  return {
    eligibleTeacherIds,
    baselineByTeacher,
    capacityByTeacher,
    targetByTeacher,
    balanceableRemainingWeight,
  };
}
