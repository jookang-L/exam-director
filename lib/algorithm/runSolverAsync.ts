"use client";

import type { Assignment, Exam } from "@/lib/types";
import { SOLVER_DEFAULT_RUN_COUNT } from "@/lib/fatigueWeights";
import type { MultiSolverResult } from "./solver";
import type { SolverWorkerMessage, SolverWorkerRequest } from "./solver.worker";
import { fixedSolverSeeds } from "./solverSeeds";

export type SolverProgress = { completed: number; total: number };

function runsForExam(_exam: Exam, runs?: number): number {
  return runs ?? SOLVER_DEFAULT_RUN_COUNT;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Worker 실패 시 메인 스레드에서 1회씩 양보하며 실행 (동기 일괄 실행 금지) */
async function runSolverBestOfOnMainThread(
  exam: Exam,
  seeds: number[],
  mutableSlotIds?: string[],
  allowedTeacherIds?: string[],
  onProgress?: (progress: SolverProgress) => void,
): Promise<MultiSolverResult> {
  const [
    { buildBalancePlanForOptions, runSolver },
    { isBetterSolverScore, scoreSolverResult },
  ] = await Promise.all([
    import("./solver"),
    import("./balanceScore"),
  ]);

  let best: Awaited<ReturnType<typeof runSolver>> | null = null;
  let bestScore: ReturnType<typeof scoreSolverResult> | null = null;
  let pickedSeed = 0;
  const solverOptions =
    mutableSlotIds || allowedTeacherIds ? { mutableSlotIds, allowedTeacherIds } : undefined;
  const scorePlan = buildBalancePlanForOptions(exam, solverOptions);

  for (let i = 0; i < seeds.length; i++) {
    await yieldToMain();
    const seed = seeds[i];
    const result = runSolver(exam, { ...solverOptions, seed });
    const score = scoreSolverResult(exam, result, scorePlan);
    if (isBetterSolverScore(score, bestScore)) {
      best = result;
      bestScore = score;
      pickedSeed = seed;
    }
    onProgress?.({ completed: i + 1, total: seeds.length });
  }

  if (!best || !bestScore) {
    await yieldToMain();
    const fallback = runSolver(exam, solverOptions);
    return {
      ...fallback,
      runs: 1,
      pickedSeed: 0,
      score: scoreSolverResult(exam, fallback, scorePlan),
    };
  }

  return { ...best, runs: seeds.length, pickedSeed, score: bestScore };
}

function runSolverInWorker(
  exam: Exam,
  seeds: number[],
  mutableSlotIds?: string[],
  allowedTeacherIds?: string[],
  onProgress?: (progress: SolverProgress) => void,
): Promise<MultiSolverResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./solver.worker.ts", import.meta.url));
    } catch (err) {
      reject(err);
      return;
    }

    worker.onmessage = (event: MessageEvent<SolverWorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress?.({ completed: msg.completed, total: msg.total });
        return;
      }
      worker.terminate();
      resolve(msg.result);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    const payload: SolverWorkerRequest = { exam, seeds, mutableSlotIds, allowedTeacherIds };
    worker.postMessage(payload);
  });
}

/** Web Worker에서 솔버 실행 — 메인 스레드(UI) 블로킹 방지 */
export async function runSolverBestOfAsync(
  exam: Exam,
  options?: {
    runs?: number;
    seeds?: number[];
    mutableSlotIds?: string[];
    allowedTeacherIds?: string[];
    onProgress?: (progress: SolverProgress) => void;
  },
): Promise<MultiSolverResult> {
  const seeds = options?.seeds ?? fixedSolverSeeds(runsForExam(exam, options?.runs));

  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    try {
      return await runSolverInWorker(
        exam,
        seeds,
        options?.mutableSlotIds,
        options?.allowedTeacherIds,
        options?.onProgress,
      );
    } catch (err) {
      console.warn("Worker 솔버 실패, 메인 스레드 폴백", err);
    }
  }

  return runSolverBestOfOnMainThread(
    exam,
    seeds,
    options?.mutableSlotIds,
    options?.allowedTeacherIds,
    options?.onProgress,
  );
}

/** 기존 화면 배정을 솔버 결과와 같은 검증·점수 척도로 평가한다. */
export async function evaluateAssignmentCandidateAsync(
  exam: Exam,
  assignments: Assignment[],
): Promise<MultiSolverResult> {
  const [
    { buildBalancePlanForOptions, validateSolverAssignments },
    { scoreSolverResult },
    { buildFixedAssignments },
  ] = await Promise.all([
    import("./solver"),
    import("./balanceScore"),
    import("./fixed"),
  ]);
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.dutySlotId));
  const result = {
    assignments,
    unassigned: exam.dutySlots.filter((slot) => !assignedSlotIds.has(slot.id)),
    iterations: 0,
    backtracks: 0,
    validationErrors: validateSolverAssignments(
      exam,
      assignments,
      buildFixedAssignments(exam),
      null,
    ),
  };
  return {
    ...result,
    runs: 0,
    pickedSeed: 0,
    score: scoreSolverResult(exam, result, buildBalancePlanForOptions(exam)),
  };
}

export async function reassignSubsetAsync(
  exam: Exam,
  slotIds: string[],
  options?: { allowedTeacherIds?: string[]; onProgress?: (progress: SolverProgress) => void },
): Promise<Assignment[]> {
  const next = exam.assignments.filter((a) => {
    if (!slotIds.includes(a.dutySlotId)) return true;
    return a.fixed;
  });
  const subExam: Exam = { ...exam, assignments: next };
  const result = await runSolverBestOfAsync(subExam, {
    ...options,
    mutableSlotIds: slotIds,
  });
  return result.assignments;
}
