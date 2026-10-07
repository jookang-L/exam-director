import assert from "node:assert/strict";
import type { Assignment, Exam, Teacher } from "../lib/types";
import { MANUAL_C4_OVERRIDE_REASON } from "../lib/algorithm/constraints";
import {
  computeAverageTotalFatigue,
  computeCurrentExamFatigue,
} from "../lib/algorithm/averageFatigue";
import {
  evaluateRuleChecklist,
  resolveChecklistItem,
  summarizeChecklist,
  type RuleChecklistItem,
} from "../lib/validation/ruleChecklist";

const veteran: Teacher = {
  id: "t1",
  name: "베테랑",
  subject: "",
  roleType: "정교사",
  previousFatigueScore: 100,
};
const fresh: Teacher = {
  id: "t2",
  name: "신규",
  subject: "",
  roleType: "정교사",
  previousFatigueScore: 0,
};
const lecturer: Teacher = {
  id: "t3",
  name: "강사",
  subject: "",
  roleType: "강사",
  previousFatigueScore: 0,
};

const baseExam: Exam = {
  id: "final-check-test",
  name: "final-check-test",
  createdAt: "",
  updatedAt: "",
  schemaVersion: 1,
  carryOverRatio: 0.5,
  gradeSchedule: [
    { grade: 1, startDate: "", endDate: "" },
    { grade: 2, startDate: "", endDate: "" },
    { grade: 3, startDate: "", endDate: "" },
  ],
  periodCount: 4,
  periodTimes: [],
  examSlots: [],
  rooms: [{ id: "r", name: "r" }],
  dutyDemands: [],
  teachers: [veteran, fresh, lecturer],
  dutyTypes: [
    { id: "chief", name: "정감독", weight: 100 },
    { id: "self", name: "자습감독", weight: 30 },
  ],
  timetable: [],
  excludes: [],
  preassigns: [],
  dutySlots: [
    { id: "s1", date: "2026-06-01", period: 2, roomId: "r", dutyTypeId: "chief" },
    { id: "s2", date: "2026-06-01", period: 3, roomId: "r", dutyTypeId: "self" },
  ],
  assignments: [],
};

const assignment = (id: string, dutySlotId: string, teacherId: string): Assignment => ({
  id,
  dutySlotId,
  teacherId,
  fixed: false,
});

const row = (items: RuleChecklistItem[], code: string): RuleChecklistItem => {
  const found = items.find((item) => item.code === code);
  assert.ok(found, `checklist row ${code}`);
  return found;
};

// STEP 9 — 고정 지정이 어긋나면 필수 규칙 미통과, 우선 지정이 지켜지면 통과.
const preassignExam: Exam = {
  ...baseExam,
  preassigns: [
    { id: "p-fixed", teacherId: "t1", dutySlotId: "s1", priority: "fixed" },
    { id: "p-pref", teacherId: "t2", dutySlotId: "s2", priority: "preferred" },
    // STEP 12 수동 예외로 자동 생성된 항목은 STEP 9 지정으로 보지 않는다.
    {
      id: "p-manual",
      teacherId: "t3",
      dutySlotId: "s2",
      priority: "preferred",
      reason: MANUAL_C4_OVERRIDE_REASON,
    },
  ],
  assignments: [assignment("a1", "s1", "t2"), assignment("a2", "s2", "t2")],
};
const checklist = evaluateRuleChecklist(preassignExam, preassignExam.assignments);
const fixedRow = row(checklist, "S9F");
assert.equal(fixedRow.required, true);
assert.equal(fixedRow.failures.length, 1);
assert.match(fixedRow.failures[0]!.message, /베테랑/);
assert.match(fixedRow.failures[0]!.message, /실제 신규/);
assert.equal(row(checklist, "S9P").passed, true);
assert.equal(row(checklist, "MISSING").passed, true);

// 필수 규칙 미통과는 확인하면 통과(확인됨)로 바뀌고, 확인을 취소하면 되돌아온다.
const none = new Set<string>();
assert.equal(resolveChecklistItem(fixedRow, none).status, "failed");
assert.equal(summarizeChecklist(checklist, none).requiredCleared, false);
const acknowledged = new Set(fixedRow.failures.map((f) => f.key));
assert.equal(resolveChecklistItem(fixedRow, acknowledged).status, "acknowledged");
const clearedSummary = summarizeChecklist(checklist, acknowledged);
assert.equal(clearedSummary.requiredCleared, true);
assert.equal(clearedSummary.acknowledged, 1);

// 확인한 뒤 새로 생긴 위반은 확인되지 않은 채로 남는다.
const changedAssignments = [assignment("a1", "s1", "t3"), assignment("a2", "s2", "t2")];
const changedChecklist = evaluateRuleChecklist(preassignExam, changedAssignments);
const changedFixed = row(changedChecklist, "S9F");
assert.equal(changedFixed.failures.length, 1);
assert.notEqual(changedFixed.failures[0]!.key, fixedRow.failures[0]!.key);
assert.equal(resolveChecklistItem(changedFixed, acknowledged).status, "failed");

// 경고 규칙(우선 지정)은 미통과여도 경고이고, 확인하면 확인됨이 된다.
const preferredMissed = evaluateRuleChecklist(preassignExam, [
  assignment("a1", "s1", "t1"),
  assignment("a2", "s2", "t1"),
]);
const preferredRow = row(preferredMissed, "S9P");
assert.equal(preferredRow.failures.length, 1);
assert.equal(resolveChecklistItem(preferredRow, none).status, "warning");
assert.equal(
  resolveChecklistItem(preferredRow, new Set(preferredRow.failures.map((f) => f.key))).status,
  "acknowledged",
);

// STEP 7 — 제외 조건을 어긴 배정은 EX 필수 규칙 미통과, 가리키는 교사가 없는 조건은 S7 경고.
const excludeExam: Exam = {
  ...baseExam,
  excludes: [
    { id: "e1", teacherId: "t1", date: "2026-06-01", period: 2, reason: "출장" },
    { id: "e2", teacherId: "ghost" },
  ],
  assignments: [assignment("a1", "s1", "t1"), assignment("a2", "s2", "t2")],
};
const excludeChecklist = evaluateRuleChecklist(excludeExam, excludeExam.assignments);
const exRow = row(excludeChecklist, "EX");
assert.equal(exRow.required, true);
assert.equal(exRow.passed, false);
assert.ok(exRow.failures.some((f) => f.message.includes("출장")));
const s7Row = row(excludeChecklist, "S7");
assert.equal(s7Row.required, false);
assert.equal(s7Row.passed, false);

// 이번 시험 곤란도: 이전 곤란도 0인 신규 교사도 포함하고, 강사는 뺀다.
const fatigueExam: Exam = {
  ...baseExam,
  assignments: [assignment("a1", "s1", "t2"), assignment("a2", "s2", "t2")],
};
const current = computeCurrentExamFatigue(fatigueExam);
assert.equal(current.count, 2);
assert.equal(current.average, 65);
assert.equal(current.highest?.teacher.id, "t2");
assert.equal(current.highest?.total, 130);
assert.equal(current.lowest?.teacher.id, "t1");
assert.equal(current.lowest?.total, 0);

// 최종 총 곤란도: 이전 곤란도 0 교사는 빠지고 이월 점수(100 × 0.5)가 더해진다.
const total = computeAverageTotalFatigue(fatigueExam);
assert.equal(total.count, 1);
assert.equal(total.average, 50);
assert.equal(total.highest?.teacher.id, "t1");
assert.equal(total.lowest?.teacher.id, "t1");

// 집계할 교사가 없으면 빈 결과.
const empty = computeCurrentExamFatigue({ ...fatigueExam, teachers: [lecturer] });
assert.equal(empty.count, 0);
assert.equal(empty.highest, null);
assert.equal(empty.lowest, null);

console.log("final-check regression: ok");
