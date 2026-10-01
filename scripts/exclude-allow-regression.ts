import assert from "node:assert/strict";
import type { DutySlot, Exam, Exclude, Teacher } from "../lib/types";
import { createSampleExam } from "../lib/sample";
import { evaluateAll, type ConstraintContext } from "../lib/algorithm/constraints";
import { computeAverageTotalFatigue, isFullyExcludedDuringExam } from "../lib/algorithm/averageFatigue";
import { conflictsByExclude, conflictsFor } from "../lib/algorithm/excludeConflicts";
import { isTeacherExcludedForPeriod } from "../lib/algorithm/excludeVisualization";
import { runSolver } from "../lib/algorithm/solver";
import { runFullValidation } from "../lib/validation/rules";

const sample = createSampleExam();
const teacher: Teacher = sample.teachers.find((t) => t.roleType === "정교사") ?? sample.teachers[0];
const slot: DutySlot = sample.dutySlots[0];
const dutyOf = (name: string) => sample.dutyTypes.find((d) => d.name === name)!.id;
const [chiefId, assistantId, selfStudyId] = [dutyOf("정감독"), dutyOf("부감독"), dutyOf("자습감독")];

function withExcludes(excludes: Exclude[]): Exam {
  return { ...sample, assignments: [], excludes };
}
function rule(id: string, extra: Partial<Exclude> = {}): Exclude {
  return { id, teacherId: teacher.id, date: slot.date, ...extra };
}
function reasonsFor(exam: Exam, dutyTypeId: string): string[] {
  const ctx: ConstraintContext = { exam, assignments: [] };
  return evaluateAll(ctx, { ...slot, dutyTypeId }, teacher)
    .reasons.filter((r) => r.code === "EX")
    .map((r) => r.message);
}

// 허용 조건 — 부감독만: 정감독·자습감독은 EX로 막히고 부감독은 EX가 없다.
const assistantOnly = withExcludes([rule("a1", { allowedDutyTypeIds: [assistantId] })]);
assert.equal(reasonsFor(assistantOnly, assistantId).length, 0);
assert.equal(reasonsFor(assistantOnly, chiefId).length, 1);
assert.match(reasonsFor(assistantOnly, chiefId)[0], /부감독만 가능/);
assert.equal(reasonsFor(assistantOnly, selfStudyId).length, 1);

// 다른 날짜는 영향이 없다.
const otherDate = withExcludes([
  rule("a1", { date: "1999-01-01", allowedDutyTypeIds: [assistantId] }),
]);
assert.equal(reasonsFor(otherDate, chiefId).length, 0);

// 교시 지정 — 해당 교시만 제한된다.
const periodOnly = withExcludes([
  rule("a1", { period: slot.period + 1, allowedDutyTypeIds: [assistantId] }),
]);
assert.equal(reasonsFor(periodOnly, chiefId).length, 0);

// 허용 조건은 전체 제외로 취급되지 않는다 (평균 제외·교시 음영·고사기간 전체 제외).
const wholeAllow = withExcludes([{ id: "w", teacherId: teacher.id, allowedDutyTypeIds: [assistantId] }]);
assert.equal(isFullyExcludedDuringExam(wholeAllow, teacher), false);
assert.equal(isTeacherExcludedForPeriod(assistantOnly, teacher.id, slot.date, slot.period), false);
assert.equal(
  computeAverageTotalFatigue(wholeAllow).count,
  computeAverageTotalFatigue(withExcludes([])).count,
);
// 기존 전체 제외는 그대로 동작한다.
const fullExclude = withExcludes([{ id: "f", teacherId: teacher.id }]);
assert.equal(isFullyExcludedDuringExam(fullExclude, teacher), true);
assert.equal(reasonsFor(withExcludes([rule("f")]), assistantId).length, 1);

// 교집합 — 부·자습 허용 + 부·복도 허용 → 부감독만, 자습은 불가.
const intersect = withExcludes([
  rule("i1", { allowedDutyTypeIds: [assistantId, selfStudyId] }),
  rule("i2", { allowedDutyTypeIds: [assistantId, chiefId] }),
]);
assert.equal(reasonsFor(intersect, assistantId).length, 0);
assert.equal(reasonsFor(intersect, selfStudyId).length, 1);
assert.equal(reasonsFor(intersect, chiefId).length, 1);

// 충돌 — 전체 제외와 허용 조건, 교집합이 빈 허용 조건, 교집합이 남는 허용 조건.
const conflicting = withExcludes([
  rule("full"),
  rule("allow", { allowedDutyTypeIds: [assistantId] }),
]);
const byId = conflictsByExclude(conflicting);
assert.equal(byId.get("full")?.[0].kind, "fullExclude");
assert.equal(byId.get("allow")?.[0].kind, "fullExclude");

const empty = withExcludes([
  rule("p", { allowedDutyTypeIds: [assistantId] }),
  rule("q", { allowedDutyTypeIds: [chiefId] }),
]);
assert.equal(conflictsByExclude(empty).get("p")?.[0].kind, "emptyIntersection");
assert.equal(reasonsFor(empty, assistantId).length, 1);
assert.equal(reasonsFor(empty, chiefId).length, 1);

const partial = conflictsByExclude(intersect).get("i1")?.[0];
assert.equal(partial?.kind, "intersection");
assert.equal(partial?.severity, "info");

// 같은 조건 중복·다른 교사·겹치지 않는 날짜는 충돌이 아니다.
assert.equal(
  conflictsFor(
    withExcludes([rule("x", { allowedDutyTypeIds: [assistantId] })]),
    rule("y", { allowedDutyTypeIds: [assistantId] }),
  ).length,
  0,
);
assert.equal(
  conflictsFor(
    withExcludes([rule("x", { allowedDutyTypeIds: [assistantId] })]),
    rule("y", { teacherId: "other", allowedDutyTypeIds: [chiefId] }),
  ).length,
  0,
);
assert.equal(
  conflictsFor(
    withExcludes([rule("x", { allowedDutyTypeIds: [assistantId] })]),
    rule("y", { date: "1999-01-01", allowedDutyTypeIds: [chiefId] }),
  ).length,
  0,
);

// 사전 검증 — 경고 조건 충돌만 보고한다 (info 교집합은 제외).
const conflictIssues = (exam: Exam) =>
  runFullValidation(exam).filter((i) => i.ruleId === "exclude.conflict");
assert.equal(conflictIssues(conflicting).length, 1);
assert.equal(conflictIssues(empty).length, 1);
assert.equal(conflictIssues(intersect).length, 0);

// 자동 배정 — 허용 조건 날짜에 해당 교사는 부감독 외에 배정되지 않는다.
const dayRule = withExcludes([rule("d", { allowedDutyTypeIds: [assistantId] })]);
const solved = runSolver(dayRule, { seed: 1 });
assert.equal(solved.validationErrors.length, 0);
const slotById = new Map(dayRule.dutySlots.map((s) => [s.id, s]));
for (const a of solved.assignments) {
  if (a.teacherId !== teacher.id) continue;
  const s = slotById.get(a.dutySlotId)!;
  if (s.date === slot.date) assert.equal(s.dutyTypeId, assistantId, "허용 조건 위반 배정");
}

console.log("exclude-allow regression: ok");
