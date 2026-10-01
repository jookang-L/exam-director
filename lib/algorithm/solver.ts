import type { Assignment, DutySlot, Exam, Teacher } from "@/lib/types";
import { newId } from "@/lib/types";
import {
  CHIEF_ASSISTANT_BALANCE_PENALTY,
  DEFAULT_DUTY_WEIGHT_FALLBACK,
  ROLE_BALANCE_ALLOWED_SPREAD,
  SOLVER_MULTI_RUN_COUNT,
  SOLVER_DEFAULT_RUN_COUNT,
} from "@/lib/fatigueWeights";
import {
  applyAssignmentToIndexes,
  buildAssignmentIndexes,
  buildExamLookups,
  type ExamLookups,
  type AssignmentIndexes,
} from "./constraintIndexes";
import { isIncludedInAverageFatigue } from "./averageFatigue";
import { isBetterSolverScore, scoreSolverResult, teachersForBalanceStats } from "./balanceScore";
import {
  evaluateAll,
  isEvaluationOfficer,
  type ConstraintContext,
  type ConstraintReason,
} from "./constraints";
import { buildFixedAssignments } from "./fixed";
import { timetableClassBurden } from "./timetableFatigue";
import { buildBalancePlan, type BalancePlan } from "./targetFatigue";
import { fixedSolverSeeds } from "./solverSeeds";

export type SolverValidationError = {
  assignmentId?: string;
  dutySlotId?: string;
  teacherId?: string;
  reasons: ConstraintReason[];
};

export type SolverResult = {
  assignments: Assignment[];
  unassigned: DutySlot[];
  iterations: number;
  backtracks: number;
  validationErrors: SolverValidationError[];
};

export type MultiSolverResult = SolverResult & {
  runs: number;
  pickedSeed: number;
  score: ReturnType<typeof scoreSolverResult>;
};

export type SolverOptions = {
  /** 다회 실행 시 탐색 경로를 바꾸는 시드 */
  seed?: number;
  /** 부분 재배정에서 변경을 허용할 슬롯. 생략하면 모든 비고정 슬롯 허용 */
  mutableSlotIds?: string[];
  allowedTeacherIds?: string[];
};

const MAX_BACKTRACK = 50;

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AssignmentCache = {
  weight: Map<string, number>;
  chief: Map<string, number>;
  assistant: Map<string, number>;
};

function createAssignmentCache(): AssignmentCache {
  return { weight: new Map(), chief: new Map(), assistant: new Map() };
}

function slotWeight(lookups: ExamLookups, dutyTypeId: string): number {
  return lookups.dutyTypeById.get(dutyTypeId)?.weight ?? DEFAULT_DUTY_WEIGHT_FALLBACK;
}

function dutyTypeName(lookups: ExamLookups, dutyTypeId: string): string {
  return lookups.dutyTypeById.get(dutyTypeId)?.name ?? "";
}

function buildTeacherBaseFatigue(exam: Exam): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of exam.teachers) {
    map.set(
      t.id,
      (t.previousFatigueScore ?? 0) * exam.carryOverRatio + timetableClassBurden(exam, t.id),
    );
  }
  return map;
}

function fatigueOf(
  teacher: Teacher,
  assignments: Assignment[],
  weightCache: Map<string, number>,
  slotById: Map<string, DutySlot>,
  lookups: ExamLookups,
  teacherBaseFatigue: Map<string, number>,
): number {
  let cur = weightCache.get(teacher.id);
  if (cur === undefined) {
    cur = 0;
    for (const a of assignments) {
      if (a.teacherId !== teacher.id) continue;
      const slot = slotById.get(a.dutySlotId);
      if (!slot) continue;
      cur += slotWeight(lookups, slot.dutyTypeId);
    }
    weightCache.set(teacher.id, cur);
  }
  return (teacherBaseFatigue.get(teacher.id) ?? 0) + cur;
}

function projectedFatigueOf(
  teacher: Teacher,
  assignments: Assignment[],
  weightCache: Map<string, number>,
  pendingSlot: DutySlot,
  slotById: Map<string, DutySlot>,
  lookups: ExamLookups,
  teacherBaseFatigue: Map<string, number>,
): number {
  return (
    fatigueOf(teacher, assignments, weightCache, slotById, lookups, teacherBaseFatigue) +
    slotWeight(lookups, pendingSlot.dutyTypeId)
  );
}

function chiefAssistantMinCount(
  slot: DutySlot,
  candidates: Teacher[],
  cache: AssignmentCache,
  lookups: ExamLookups,
  exam: Exam,
): number | null {
  const name = dutyTypeName(lookups, slot.dutyTypeId);
  if (name !== "정감독" && name !== "부감독") return null;
  const counts = name === "정감독" ? cache.chief : cache.assistant;
  const basis = teachersForBalanceStats(exam, candidates);
  let min = Infinity;
  for (const t of basis) {
    min = Math.min(min, counts.get(t.id) ?? 0);
  }
  return Number.isFinite(min) ? min : null;
}

/** 후보 교사 중 정/부 최소 횟수 대비 초과분 × 가중치 (피로도와 별도) */
function chiefAssistantBalancePenalty(
  exam: Exam,
  slot: DutySlot,
  teacher: Teacher,
  cache: AssignmentCache,
  lookups: ExamLookups,
  balanceMin: number | null,
): number {
  if (balanceMin === null) return 0;
  if (!isIncludedInAverageFatigue(exam, teacher)) return 0;
  const name = dutyTypeName(lookups, slot.dutyTypeId);
  const counts = name === "정감독" ? cache.chief : cache.assistant;
  const excess = (counts.get(teacher.id) ?? 0) - balanceMin;
  if (excess <= 0) return 0;
  return excess * CHIEF_ASSISTANT_BALANCE_PENALTY;
}

function projectedScore(
  exam: Exam,
  teacher: Teacher,
  assignments: Assignment[],
  cache: AssignmentCache,
  slot: DutySlot,
  lookups: ExamLookups,
  teacherBaseFatigue: Map<string, number>,
  balanceMin: number | null,
  balancePlan: BalancePlan,
): number {
  const before = fatigueOf(
    teacher,
    assignments,
    cache.weight,
    lookups.slotById,
    lookups,
    teacherBaseFatigue,
  );
  const weight = slotWeight(lookups, slot.dutyTypeId);
  const after = before + weight;
  const target = balancePlan.targetByTeacher.get(teacher.id);
  const balanceScore =
    target == null
      ? after
      : ((after - target) ** 2 - (before - target) ** 2) /
        (2 * Math.max(1, Math.abs(weight)));
  return (
    balanceScore +
    chiefAssistantBalancePenalty(exam, slot, teacher, cache, lookups, balanceMin)
  );
}

function seedAssignmentCache(
  cache: AssignmentCache,
  assignments: Assignment[],
  lookups: ExamLookups,
) {
  for (const a of assignments) {
    const slot = lookups.slotById.get(a.dutySlotId);
    if (!slot) continue;
    const w = slotWeight(lookups, slot.dutyTypeId);
    cache.weight.set(a.teacherId, (cache.weight.get(a.teacherId) ?? 0) + w);
    const name = dutyTypeName(lookups, slot.dutyTypeId);
    if (name === "정감독") {
      cache.chief.set(a.teacherId, (cache.chief.get(a.teacherId) ?? 0) + 1);
    } else if (name === "부감독") {
      cache.assistant.set(a.teacherId, (cache.assistant.get(a.teacherId) ?? 0) + 1);
    }
  }
}

function bumpAssignmentCache(
  cache: AssignmentCache,
  exam: Exam,
  teacherId: string,
  dutyTypeId: string,
  sign: 1 | -1,
  indexes: AssignmentIndexes,
  lookups: ExamLookups,
  dutySlotId: string,
) {
  const w = slotWeight(lookups, dutyTypeId) * sign;
  cache.weight.set(teacherId, (cache.weight.get(teacherId) ?? 0) + w);

  const name = dutyTypeName(lookups, dutyTypeId);
  if (name === "정감독") {
    cache.chief.set(teacherId, (cache.chief.get(teacherId) ?? 0) + sign);
  } else if (name === "부감독") {
    cache.assistant.set(teacherId, (cache.assistant.get(teacherId) ?? 0) + sign);
  }

  applyAssignmentToIndexes(
    teacherId,
    dutySlotId,
    sign,
    indexes.teacherPeriodSlot,
    indexes.healthTeacherByPeriod,
    indexes.teacherDaySlotIds,
    lookups,
    exam,
  );
}

function sortCandidatesByScore(
  cands: Teacher[],
  exam: Exam,
  assignments: Assignment[],
  cache: AssignmentCache,
  slot: DutySlot,
  lookups: ExamLookups,
  teacherBaseFatigue: Map<string, number>,
  balancePlan: BalancePlan,
  rng: (() => number) | null,
): Teacher[] {
  const balanceMin = chiefAssistantMinCount(slot, cands, cache, lookups, exam);
  const scored = cands.map((t) => ({
    t,
    score: projectedScore(
      exam,
      t,
      assignments,
      cache,
      slot,
      lookups,
      teacherBaseFatigue,
      balanceMin,
      balancePlan,
    ),
    typeCount: typeCountForSort(cache, slot, lookups, t.id),
    prevFatigue: t.previousFatigueScore ?? 0,
  }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.typeCount !== b.typeCount) return a.typeCount - b.typeCount;
    if (rng) return rng() - 0.5;
    return a.prevFatigue - b.prevFatigue;
  });
  return scored.map((x) => x.t);
}

function candidatesFor(
  ctx: ConstraintContext,
  slot: DutySlot,
  teachers: Teacher[],
): Teacher[] {
  const ok: Teacher[] = [];
  for (const t of teachers) {
    const r = evaluateAll(ctx, slot, t);
    if (r.ok) ok.push(t);
  }
  return ok;
}

function typeCountForSort(
  cache: AssignmentCache,
  slot: DutySlot,
  lookups: ExamLookups,
  teacherId: string,
): number {
  const name = dutyTypeName(lookups, slot.dutyTypeId);
  if (name === "정감독") return cache.chief.get(teacherId) ?? 0;
  if (name === "부감독") return cache.assistant.get(teacherId) ?? 0;
  return 0;
}

export function runSolver(exam: Exam, options?: SolverOptions): SolverResult {
  const rng = options?.seed != null ? createRng(options.seed) : null;
  const mutableSlotIds = options?.mutableSlotIds
    ? new Set(options.mutableSlotIds)
    : null;
  const allowedTeacherIds = options?.allowedTeacherIds
    ? new Set(options.allowedTeacherIds)
    : null;
  const autoTeachers = exam.teachers.filter((teacher) => !isEvaluationOfficer(teacher));
  const candidateTeachers = allowedTeacherIds
    ? autoTeachers.filter((teacher) => allowedTeacherIds.has(teacher.id))
    : autoTeachers;
  const lookups = buildExamLookups(exam);
  const teacherBaseFatigue = buildTeacherBaseFatigue(exam);
  const initial = buildFixedAssignments(exam);
  const assignments: Assignment[] = [...initial];
  const cache = createAssignmentCache();
  const indexes = buildAssignmentIndexes(assignments, lookups, exam);
  seedAssignmentCache(cache, assignments, lookups);

  const filledSlotIds = new Set(assignments.map((a) => a.dutySlotId));
  const remaining = exam.dutySlots.filter(
    (s) =>
      !filledSlotIds.has(s.id) &&
      (!mutableSlotIds || mutableSlotIds.has(s.id)),
  );
  const balancePlan = buildBalancePlan(
    exam,
    initial,
    remaining,
    lookups,
    allowedTeacherIds,
  );

  const ctx: ConstraintContext = { exam, assignments, lookups, indexes };

  function sortRemaining(slots: DutySlot[]): DutySlot[] {
    const scored = slots.map((s) => {
      const cands = candidatesFor(ctx, s, candidateTeachers);
      return { s, n: cands.length, w: slotWeight(lookups, s.dutyTypeId) };
    });
    scored.sort((a, b) => {
      if (a.n !== b.n) return a.n - b.n;
      if (a.w !== b.w) return b.w - a.w;
      return rng ? rng() - 0.5 : 0;
    });
    return scored.map((x) => x.s);
  }

  const unassigned: DutySlot[] = [];
  let iterations = 0;
  let backtracks = 0;
  let queue = sortRemaining(remaining);

  while (queue.length > 0) {
    iterations += 1;
    const slot = queue.shift()!;
    const cands = candidatesFor(ctx, slot, candidateTeachers);
    if (cands.length === 0) {
      if (backtracks >= MAX_BACKTRACK) {
        unassigned.push(slot);
        continue;
      }
      const freedSlot = tryBacktrack(
        exam,
        ctx,
        assignments,
        cache,
        slot,
        candidateTeachers,
        indexes,
        lookups,
        mutableSlotIds,
      );
      if (freedSlot) {
        backtracks += 1;
        queue.unshift(freedSlot);
        queue.unshift(slot);
        continue;
      }
      unassigned.push(slot);
      continue;
    }

    const sorted = sortCandidatesByScore(
      cands,
      exam,
      assignments,
      cache,
      slot,
      lookups,
      teacherBaseFatigue,
      balancePlan,
      rng,
    );

    const winner = sorted[0];
    assignments.push({
      id: newId(),
      teacherId: winner.id,
      dutySlotId: slot.id,
      fixed: false,
    });
    bumpAssignmentCache(cache, exam, winner.id, slot.dutyTypeId, 1, indexes, lookups, slot.id);
  }

  c7PostProcess(exam, ctx, assignments, cache, indexes, lookups, mutableSlotIds);
  balancePostProcess(
    exam,
    assignments,
    cache,
    indexes,
    lookups,
    teacherBaseFatigue,
    balancePlan,
    mutableSlotIds,
  );

  const validationErrors = validateSolverAssignments(
    exam,
    assignments,
    initial,
    mutableSlotIds,
  );

  return { assignments, unassigned, iterations, backtracks, validationErrors };
}

export type SolverBestOfHooks = {
  onRunComplete?: (completed: number, total: number) => void;
};

/** 여러 시드로 runSolver 후 미배정·정/부·총 누적도 편차가 가장 작은 결과 선택 */
export function runSolverBestOf(
  exam: Exam,
  runsOrSeeds: number | readonly number[] = SOLVER_MULTI_RUN_COUNT,
  hooks?: SolverBestOfHooks,
  options?: Omit<SolverOptions, "seed">,
): MultiSolverResult {
  const seeds =
    typeof runsOrSeeds === "number"
      ? fixedSolverSeeds(runsOrSeeds)
      : Array.from(runsOrSeeds);
  let best: SolverResult | null = null;
  let bestScore = null as ReturnType<typeof scoreSolverResult> | null;
  let pickedSeed = 0;
  const scorePlan = buildBalancePlanForOptions(exam, options);

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const result = runSolver(exam, { ...options, seed });
    const score = scoreSolverResult(exam, result, scorePlan);
    if (isBetterSolverScore(score, bestScore)) {
      best = result;
      bestScore = score;
      pickedSeed = seed;
    }
    hooks?.onRunComplete?.(i + 1, seeds.length);
  }

  if (!best || !bestScore) {
    const fallback = runSolver(exam, options);
    return {
      ...fallback,
      runs: 1,
      pickedSeed: 0,
      score: scoreSolverResult(exam, fallback, scorePlan),
    };
  }

  return { ...best, runs: seeds.length, pickedSeed, score: bestScore };
}

export function buildBalancePlanForOptions(
  exam: Exam,
  options?: Omit<SolverOptions, "seed">,
): BalancePlan {
  const lookups = buildExamLookups(exam);
  const initial = buildFixedAssignments(exam);
  const filled = new Set(initial.map((assignment) => assignment.dutySlotId));
  const mutable = options?.mutableSlotIds
    ? new Set(options.mutableSlotIds)
    : null;
  const allowedTeacherIds = options?.allowedTeacherIds
    ? new Set(options.allowedTeacherIds)
    : null;
  const remaining = exam.dutySlots.filter(
    (slot) =>
      !filled.has(slot.id) &&
      (!mutable || mutable.has(slot.id)),
  );
  return buildBalancePlan(exam, initial, remaining, lookups, allowedTeacherIds);
}

function tryBacktrack(
  exam: Exam,
  ctx: ConstraintContext,
  assignments: Assignment[],
  cache: AssignmentCache,
  blocked: DutySlot,
  candidateTeachers: Teacher[],
  indexes: AssignmentIndexes,
  lookups: ExamLookups,
  mutableSlotIds: Set<string> | null,
): DutySlot | null {
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a.fixed) continue;
    if (mutableSlotIds && !mutableSlotIds.has(a.dutySlotId)) continue;
    const aSlot = lookups.slotById.get(a.dutySlotId);
    if (!aSlot) continue;
    const removed = assignments.splice(i, 1)[0];
    bumpAssignmentCache(cache, exam, removed.teacherId, aSlot.dutyTypeId, -1, indexes, lookups, aSlot.id);
    const cands = candidatesFor(ctx, blocked, candidateTeachers);
    if (cands.length > 0) {
      const freedCands = candidatesFor(ctx, aSlot, candidateTeachers);
      const otherFreedCands = freedCands.filter((t) => t.id !== removed.teacherId);
      if (otherFreedCands.length > 0) {
        return aSlot;
      }
    }
    assignments.splice(i, 0, removed);
    bumpAssignmentCache(cache, exam, removed.teacherId, aSlot.dutyTypeId, 1, indexes, lookups, aSlot.id);
  }
  return null;
}

function c7PostProcess(
  exam: Exam,
  ctx: ConstraintContext,
  assignments: Assignment[],
  cache: AssignmentCache,
  indexes: AssignmentIndexes,
  lookups: ExamLookups,
  mutableSlotIds: Set<string> | null,
) {
  type DayAssign = { idx: number; slot: DutySlot; dtName: string };
  const byTeacherDay = new Map<string, Map<string, DayAssign[]>>();
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const slot = lookups.slotById.get(a.dutySlotId);
    if (!slot) continue;
    const dt = lookups.dutyTypeById.get(slot.dutyTypeId);
    if (!dt) continue;
    let perDay = byTeacherDay.get(a.teacherId);
    if (!perDay) {
      perDay = new Map();
      byTeacherDay.set(a.teacherId, perDay);
    }
    const arr = perDay.get(slot.date) ?? [];
    arr.push({ idx: i, slot, dtName: dt?.name ?? "" });
    perDay.set(slot.date, arr);
  }
  byTeacherDay.forEach((perDay, teacherId) => {
    const teacher = exam.teachers.find((t) => t.id === teacherId);
    if (teacher?.roleType === "강사") return;
    perDay.forEach((arr) => {
      if (arr.length !== 3) return;
      const sorted = [...arr].sort((a, b) => a.slot.period - b.slot.period);
      const minPeriod = sorted[0]!.slot.period;
      const maxPeriod = sorted[sorted.length - 1]!.slot.period;
      const hasMiddleSelfStudy = sorted.some(
        (x) => x.dtName === "자습감독" && x.slot.period > minPeriod && x.slot.period < maxPeriod,
      );
      if (hasMiddleSelfStudy) return;
      for (const cur of arr) {
        const curAssign = assignments[cur.idx]!;
        if (curAssign.fixed) continue;
        if (mutableSlotIds && !mutableSlotIds.has(curAssign.dutySlotId)) continue;
        const candidateSwaps = assignments.filter((other) => {
          if (other.fixed) return false;
          if (mutableSlotIds && !mutableSlotIds.has(other.dutySlotId)) return false;
          if (other.id === curAssign.id) return false;
          const otherSlot = lookups.slotById.get(other.dutySlotId);
          if (!otherSlot) return false;
          if (otherSlot.date !== cur.slot.date) return false;
          if (otherSlot.period <= minPeriod || otherSlot.period >= maxPeriod) return false;
          const otherDt = lookups.dutyTypeById.get(otherSlot.dutyTypeId);
          return otherDt?.name === "자습감독";
        });
        for (const swap of candidateSwaps) {
          const swapSlot = lookups.slotById.get(swap.dutySlotId)!;
          const aT = curAssign.teacherId;
          const bT = swap.teacherId;
          curAssign.teacherId = bT;
          swap.teacherId = aT;
          // swap 검증 — assignments는 갱신됐지만 indexes는 아직 swap 전이므로 indexes 제외
          const ctxValidate: ConstraintContext = { exam, assignments, lookups };
          const teacherA = exam.teachers.find((t) => t.id === aT)!;
          const teacherB = exam.teachers.find((t) => t.id === bT)!;
          const rA = evaluateAll(ctxValidate, swapSlot, teacherA);
          const rB = evaluateAll(ctxValidate, cur.slot, teacherB);
          if (rA.ok && rB.ok) {
            bumpAssignmentCache(cache, exam, aT, cur.slot.dutyTypeId, -1, indexes, lookups, cur.slot.id);
            bumpAssignmentCache(cache, exam, aT, swapSlot.dutyTypeId, 1, indexes, lookups, swapSlot.id);
            bumpAssignmentCache(cache, exam, bT, swapSlot.dutyTypeId, -1, indexes, lookups, swapSlot.id);
            bumpAssignmentCache(cache, exam, bT, cur.slot.dutyTypeId, 1, indexes, lookups, cur.slot.id);
            return;
          }
          curAssign.teacherId = aT;
          swap.teacherId = bT;
        }
      }
    });
  });
}

function mapSpread(
  counts: Map<string, number>,
  teacherIds: Set<string>,
  fromId?: string,
  toId?: string,
): number {
  const values: number[] = [];
  for (const teacherId of teacherIds) {
    let value = counts.get(teacherId) ?? 0;
    if (teacherId === fromId) value -= 1;
    if (teacherId === toId) value += 1;
    values.push(value);
  }
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

function roleBalanceAllowsMove(
  slot: DutySlot,
  fromId: string,
  toId: string,
  cache: AssignmentCache,
  lookups: ExamLookups,
  eligibleTeacherIds: Set<string>,
): boolean {
  const name = dutyTypeName(lookups, slot.dutyTypeId);
  const counts = name === "정감독" ? cache.chief : name === "부감독" ? cache.assistant : null;
  if (!counts) return true;
  const current = mapSpread(counts, eligibleTeacherIds);
  const next = mapSpread(counts, eligibleTeacherIds, fromId, toId);
  return next <= Math.max(current, ROLE_BALANCE_ALLOWED_SPREAD);
}

function maximumTargetExcess(
  totals: Map<string, number>,
  targets: Map<string, number>,
  overrides?: Map<string, number>,
): number {
  let max = 0;
  for (const [teacherId, total] of totals) {
    const value = overrides?.get(teacherId) ?? total;
    max = Math.max(max, value - (targets.get(teacherId) ?? value));
  }
  return Math.max(0, max);
}

function balancePostProcess(
  exam: Exam,
  assignments: Assignment[],
  cache: AssignmentCache,
  indexes: AssignmentIndexes,
  lookups: ExamLookups,
  teacherBaseFatigue: Map<string, number>,
  balancePlan: BalancePlan,
  mutableSlotIds: Set<string> | null,
) {
  const eligibleTeachers = exam.teachers.filter((teacher) =>
    balancePlan.eligibleTeacherIds.has(teacher.id),
  );
  if (eligibleTeachers.length < 2) return;

  const teacherById = new Map(exam.teachers.map((teacher) => [teacher.id, teacher]));
  const maxIterations = Math.min(75, Math.max(10, assignments.length));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const totals = new Map<string, number>();
    for (const teacher of eligibleTeachers) {
      totals.set(
        teacher.id,
        (teacherBaseFatigue.get(teacher.id) ?? 0) + (cache.weight.get(teacher.id) ?? 0),
      );
    }
    const currentMaxExcess = maximumTargetExcess(
      totals,
      balancePlan.targetByTeacher,
    );
    const donorIds = [...balancePlan.eligibleTeacherIds]
      .sort(
        (a, b) =>
          (totals.get(b) ?? 0) - (balancePlan.targetByTeacher.get(b) ?? 0) -
          ((totals.get(a) ?? 0) - (balancePlan.targetByTeacher.get(a) ?? 0)),
      )
      .slice(0, 8);
    const receiverIds = [...balancePlan.eligibleTeacherIds]
      .sort(
        (a, b) =>
          (totals.get(a) ?? 0) - (balancePlan.targetByTeacher.get(a) ?? 0) -
          ((totals.get(b) ?? 0) - (balancePlan.targetByTeacher.get(b) ?? 0)),
      )
      .slice(0, 12);

    let best:
      | {
          assignment: Assignment;
          slot: DutySlot;
          fromId: string;
          toId: string;
          deltaSSD: number;
        }
      | null = null;

    for (const assignment of assignments) {
      if (assignment.fixed || !donorIds.includes(assignment.teacherId)) continue;
      if (mutableSlotIds && !mutableSlotIds.has(assignment.dutySlotId)) continue;
      const slot = lookups.slotById.get(assignment.dutySlotId);
      if (!slot) continue;
      const weight = slotWeight(lookups, slot.dutyTypeId);
      const fromId = assignment.teacherId;
      const fromBefore = totals.get(fromId) ?? 0;
      const fromTarget = balancePlan.targetByTeacher.get(fromId) ?? fromBefore;

      for (const toId of receiverIds) {
        if (toId === fromId) continue;
        const receiver = teacherById.get(toId);
        if (!receiver) continue;
        const toBefore = totals.get(toId) ?? 0;
        const toTarget = balancePlan.targetByTeacher.get(toId) ?? toBefore;
        const deltaSSD =
          (fromBefore - weight - fromTarget) ** 2 - (fromBefore - fromTarget) ** 2 +
          (toBefore + weight - toTarget) ** 2 - (toBefore - toTarget) ** 2;
        if (deltaSSD >= -1e-9 || (best && deltaSSD >= best.deltaSSD)) continue;
        if (
          !roleBalanceAllowsMove(
            slot,
            fromId,
            toId,
            cache,
            lookups,
            balancePlan.eligibleTeacherIds,
          )
        ) {
          continue;
        }

        const overrides = new Map<string, number>([
          [fromId, fromBefore - weight],
          [toId, toBefore + weight],
        ]);
        if (
          maximumTargetExcess(totals, balancePlan.targetByTeacher, overrides) >
          currentMaxExcess + 1e-9
        ) {
          continue;
        }

        assignment.teacherId = toId;
        const validation = evaluateAll(
          { exam, assignments, lookups },
          slot,
          receiver,
        );
        assignment.teacherId = fromId;
        if (!validation.ok) continue;

        best = { assignment, slot, fromId, toId, deltaSSD };
      }
    }

    if (!best) break;
    best.assignment.teacherId = best.toId;
    bumpAssignmentCache(
      cache,
      exam,
      best.fromId,
      best.slot.dutyTypeId,
      -1,
      indexes,
      lookups,
      best.slot.id,
    );
    bumpAssignmentCache(
      cache,
      exam,
      best.toId,
      best.slot.dutyTypeId,
      1,
      indexes,
      lookups,
      best.slot.id,
    );
  }
}

export function validateSolverAssignments(
  exam: Exam,
  assignments: Assignment[],
  initialAssignments: Assignment[],
  mutableSlotIds: Set<string> | null,
): SolverValidationError[] {
  const errors: SolverValidationError[] = [];
  const assignmentBySlot = new Map<string, Assignment>();

  for (const assignment of assignments) {
    const duplicate = assignmentBySlot.get(assignment.dutySlotId);
    if (duplicate) {
      errors.push({
        assignmentId: assignment.id,
        dutySlotId: assignment.dutySlotId,
        teacherId: assignment.teacherId,
        reasons: [{ code: "SLOT", message: "동일 감독 슬롯에 배정이 중복되었습니다" }],
      });
    } else {
      assignmentBySlot.set(assignment.dutySlotId, assignment);
    }
  }

  for (const initial of initialAssignments) {
    if (!initial.fixed) continue;
    const actual = assignmentBySlot.get(initial.dutySlotId);
    if (!actual || actual.teacherId !== initial.teacherId) {
      errors.push({
        assignmentId: actual?.id,
        dutySlotId: initial.dutySlotId,
        teacherId: initial.teacherId,
        reasons: [{ code: "FIXED", message: "고정 배정이 변경되었습니다" }],
      });
    }
  }

  if (mutableSlotIds) {
    for (const original of exam.assignments) {
      if (mutableSlotIds.has(original.dutySlotId)) continue;
      const actual = assignmentBySlot.get(original.dutySlotId);
      if (!actual || actual.teacherId !== original.teacherId) {
        errors.push({
          assignmentId: actual?.id,
          dutySlotId: original.dutySlotId,
          teacherId: original.teacherId,
          reasons: [{ code: "SCOPE", message: "재배정 범위 밖의 배정이 변경되었습니다" }],
        });
      }
    }
  }

  for (const assignment of assignments) {
    const slot = exam.dutySlots.find((item) => item.id === assignment.dutySlotId);
    const teacher = exam.teachers.find((item) => item.id === assignment.teacherId);
    if (!slot || !teacher) {
      errors.push({
        assignmentId: assignment.id,
        dutySlotId: assignment.dutySlotId,
        teacherId: assignment.teacherId,
        reasons: [{ code: "REF", message: "배정이 존재하지 않는 교사 또는 슬롯을 참조합니다" }],
      });
      continue;
    }
    const result = evaluateAll(
      {
        exam,
        assignments: assignments.filter((item) => item.id !== assignment.id),
      },
      slot,
      teacher,
    );
    if (!result.ok) {
      errors.push({
        assignmentId: assignment.id,
        dutySlotId: assignment.dutySlotId,
        teacherId: assignment.teacherId,
        reasons: result.reasons,
      });
    }
  }

  return errors;
}

export function reassignSubset(exam: Exam, slotIds: string[]): Assignment[] {
  const next = exam.assignments.filter((a) => {
    if (!slotIds.includes(a.dutySlotId)) return true;
    return a.fixed;
  });
  const subExam: Exam = { ...exam, assignments: next };
  return runSolverBestOf(
    subExam,
    SOLVER_DEFAULT_RUN_COUNT,
    undefined,
    { mutableSlotIds: slotIds },
  ).assignments;
}
