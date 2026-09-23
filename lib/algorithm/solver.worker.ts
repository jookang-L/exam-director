import type { Exam } from "@/lib/types";
import { runSolverBestOf, type MultiSolverResult } from "./solver";
import { fixedSolverSeeds } from "./solverSeeds";

export type SolverWorkerRequest = {
  exam: Exam;
  seeds?: number[];
  mutableSlotIds?: string[];
  allowedTeacherIds?: string[];
};

export type SolverWorkerMessage =
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; result: MultiSolverResult };

self.onmessage = (event: MessageEvent<SolverWorkerRequest>) => {
  const {
    exam,
    seeds = fixedSolverSeeds(1),
    mutableSlotIds,
    allowedTeacherIds,
  } = event.data;
  const result = runSolverBestOf(exam, seeds, {
    onRunComplete: (completed, total) => {
      const msg: SolverWorkerMessage = { type: "progress", completed, total };
      self.postMessage(msg);
    },
  }, { mutableSlotIds, allowedTeacherIds });
  const done: SolverWorkerMessage = { type: "done", result };
  self.postMessage(done);
};
