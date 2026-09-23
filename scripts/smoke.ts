// Smoke test: build sample exam, run solver, print stats.
// Usage: npx tsx scripts/smoke.ts  (after `npm i -D tsx`)
import { createSampleExam } from "../lib/sample";
import { runSolver } from "../lib/algorithm/solver";
import { runFullValidation } from "../lib/validation/rules";

const exam = createSampleExam();
console.log("=== 샘플 시험 ===");
console.log("교사 수:", exam.teachers.length);
console.log("고사실 수:", exam.rooms.length);
console.log("시험 일정 수:", exam.examSlots.length);
console.log("감독 수요 수:", exam.dutyDemands.length);
console.log("감독 슬롯 수:", exam.dutySlots.length);

console.log("\n=== Solver 실행 ===");
const t0 = Date.now();
const r = runSolver(exam);
const dt = Date.now() - t0;
console.log(`Solver 완료 ${dt}ms`);
console.log("배정:", r.assignments.length);
console.log("미배정:", r.unassigned.length);
console.log("iterations:", r.iterations);
console.log("backtracks:", r.backtracks);

const final = { ...exam, assignments: r.assignments };
const issues = runFullValidation(final);
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
console.log(`\n=== Validation === errors=${errors.length} warnings=${warnings.length}`);
for (const e of errors.slice(0, 10)) {
  console.log("[E]", e.ruleId, "-", e.message);
}
for (const w of warnings.slice(0, 5)) {
  console.log("[W]", w.ruleId, "-", w.message);
}

// Fatigue spread
const w = new Map<string, number>();
for (const a of r.assignments) {
  const s = exam.dutySlots.find((x) => x.id === a.dutySlotId);
  if (!s) continue;
  const dt = exam.dutyTypes.find((d) => d.id === s.dutyTypeId);
  w.set(a.teacherId, (w.get(a.teacherId) ?? 0) + (dt?.weight ?? 1));
}
const vals = Array.from(w.values()).sort((a, b) => a - b);
console.log(
  `\n=== Fatigue === min=${vals[0]?.toFixed(1)} max=${vals[vals.length - 1]?.toFixed(1)} mean=${(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)}`,
);
