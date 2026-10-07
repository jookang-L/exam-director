import assert from "node:assert/strict";
import type { Assignment, DutySlot, Exam, Teacher } from "../lib/types";
import { teacherDutyWeight, teacherTotalFatigue } from "../lib/algorithm/fatigue";
import { createSampleExam } from "../lib/sample";
import { computeAverageTotalFatigue } from "../lib/algorithm/averageFatigue";
import { evaluateAll, MANUAL_C4_OVERRIDE_REASON } from "../lib/algorithm/constraints";
import {
  classifyManualAssignFit,
  evaluateForManualAssign,
  manualOverrideReasonFor,
} from "../lib/algorithm/manualAssignValidation";
import { teacherTeachesSubject } from "../lib/algorithm/examSubjectRules";
import { buildFixedAssignments } from "../lib/algorithm/fixed";
import { findBalanceHintSuggestions } from "../lib/algorithm/balanceHints";
import { computeBalanceSpreads, scoreSolverResult } from "../lib/algorithm/balanceScore";
import { buildBalancePlanForOptions, reassignSubset, runSolver } from "../lib/algorithm/solver";
import {
  buildAssignedMassTargets,
  buildBalancePlan,
  waterFillTargets,
} from "../lib/algorithm/targetFatigue";
import {
  buildEnhancedSolverSeeds,
  FIXED_SOLVER_SEEDS,
} from "../lib/algorithm/solverSeeds";

assert.deepEqual(FIXED_SOLVER_SEEDS, [1, 7920, 15839, 23758, 31677, 39596, 47515, 55434]);
const randomSeedValues = [1, 100, 101, 102];
const enhancedSeeds = buildEnhancedSolverSeeds(
  () => (randomSeedValues.shift() ?? 103) / 0x100000000,
);
assert.equal(enhancedSeeds.length, 11);
assert.deepEqual(enhancedSeeds.slice(-3), [100, 101, 102]);
assert.equal(teacherTeachesSubject("일본어", "일본어1"), true);
assert.equal(teacherTeachesSubject("중국어", "중국어1"), true);
assert.equal(teacherTeachesSubject("화학", "화학1"), true);
assert.equal(teacherTeachesSubject("물리학", "물리학1"), true);
assert.equal(teacherTeachesSubject("생명과학", "생명과학1"), true);
assert.equal(teacherTeachesSubject("공통국어", "공통국어1"), true);
assert.equal(teacherTeachesSubject("공통수학", "공통수학1"), true);
assert.equal(teacherTeachesSubject("공통영어", "공통영어1"), true);
assert.equal(teacherTeachesSubject("미적분1", "미적분Ⅰ"), true);
assert.equal(teacherTeachesSubject("미적분Ⅰ", "미적분1"), true);
assert.equal(teacherTeachesSubject("미적분2", "미적분Ⅱ"), true);
assert.equal(teacherTeachesSubject("미적분II", "미적분2"), true);
assert.equal(teacherTeachesSubject("현대사회와윤리", "현대사회와 윤리"), true);
assert.equal(teacherTeachesSubject("화법과작문", "화법과 작문"), true);
assert.equal(teacherTeachesSubject("미적분1", "미적분2"), false);
assert.equal(teacherTeachesSubject("화학", "화학2"), false);
assert.equal(teacherTeachesSubject("물리학", "물리학2"), false);
assert.equal(teacherTeachesSubject("생명과학", "생명과학2"), false);

const teacher: Teacher = {
  id: "t1",
  name: "A",
  subject: "",
  roleType: "정교사",
  previousFatigueScore: 0,
};

const baseExam: Exam = {
  id: "balance-test",
  name: "balance-test",
  createdAt: "",
  updatedAt: "",
  schemaVersion: 1,
  carryOverRatio: 0,
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
  teachers: [teacher],
  dutyTypes: [
    { id: "chief", name: "정감독", weight: 100 },
    { id: "self", name: "자습감독", weight: 30 },
  ],
  timetable: [],
  excludes: [],
  preassigns: [],
  dutySlots: [],
  assignments: [],
};

const samePeriodSlots: DutySlot[] = [1, 2, 3].map((index) => ({
  id: `same-${index}`,
  date: "2026-06-01",
  period: 1,
  roomId: "r",
  dutyTypeId: "chief",
}));
const samePeriodExam = { ...baseExam, dutySlots: samePeriodSlots };
const samePeriodPlan = buildBalancePlan(samePeriodExam, [], samePeriodSlots);
assert.equal(samePeriodPlan.capacityByTeacher.get(teacher.id), 100);

const c7Slots: DutySlot[] = [1, 2, 3, 4].map((period) => ({
  id: `chief-${period}`,
  date: "2026-06-01",
  period,
  roomId: "r",
  dutyTypeId: "chief",
}));
c7Slots.push({
  id: "self-2",
  date: "2026-06-01",
  period: 2,
  roomId: "r",
  dutyTypeId: "self",
});
const c7Exam = { ...baseExam, dutySlots: c7Slots };
const c7Plan = buildBalancePlan(c7Exam, [], c7Slots);
assert.equal(c7Plan.capacityByTeacher.get(teacher.id), 230);

const assignment = (id: string, dutySlotId: string): Assignment => ({
  id,
  dutySlotId,
  teacherId: teacher.id,
  fixed: false,
});
const constraintExam: Exam = {
  ...baseExam,
  dutySlots: [
    { id: "p1", date: "2026-06-01", period: 1, roomId: "r", dutyTypeId: "chief" },
    { id: "p1-other", date: "2026-06-01", period: 1, roomId: "r", dutyTypeId: "chief" },
    { id: "p2", date: "2026-06-01", period: 2, roomId: "r", dutyTypeId: "chief" },
    { id: "p2-self", date: "2026-06-01", period: 2, roomId: "r", dutyTypeId: "self" },
    { id: "p3", date: "2026-06-01", period: 3, roomId: "r", dutyTypeId: "chief" },
    { id: "p4", date: "2026-06-01", period: 4, roomId: "r", dutyTypeId: "chief" },
  ],
};
const slot = (id: string) => constraintExam.dutySlots.find((item) => item.id === id)!;

const concurrency = evaluateAll(
  { exam: constraintExam, assignments: [assignment("a1", "p1")] },
  slot("p1-other"),
  teacher,
);
assert.ok(concurrency.reasons.some((reason) => reason.code === "CC"));

const invalidC7b = evaluateAll(
  {
    exam: constraintExam,
    assignments: [assignment("a1", "p1"), assignment("a2", "p2")],
  },
  slot("p3"),
  teacher,
);
assert.ok(invalidC7b.reasons.some((reason) => reason.code === "C7b"));

const validC7b = evaluateAll(
  {
    exam: constraintExam,
    assignments: [assignment("a1", "p1"), assignment("a3", "p3")],
  },
  slot("p2-self"),
  teacher,
);
assert.equal(validC7b.ok, true);

// C7b: 가운데 교시가 복도감독이어도 통과
const hallC7bExam: Exam = {
  ...constraintExam,
  dutyTypes: [...constraintExam.dutyTypes, { id: "hall", name: "복도감독", weight: 30 }],
  dutySlots: [
    ...constraintExam.dutySlots,
    { id: "p2-hall", date: "2026-06-01", period: 2, roomId: "r", dutyTypeId: "hall" },
  ],
};
const validHallC7b = evaluateAll(
  {
    exam: hallC7bExam,
    assignments: [assignment("a1", "p1"), assignment("a3", "p3")],
  },
  hallC7bExam.dutySlots.find((item) => item.id === "p2-hall")!,
  teacher,
);
assert.equal(validHallC7b.ok, true);
const validHallC7bLast = evaluateAll(
  {
    exam: hallC7bExam,
    assignments: [assignment("a1", "p1"), assignment("a2", "p2-hall")],
  },
  hallC7bExam.dutySlots.find((item) => item.id === "p3")!,
  teacher,
);
assert.equal(validHallC7bLast.ok, true);

const japaneseTeacher: Teacher = {
  ...teacher,
  id: "jp",
  name: "일본어교사",
  subject: "일본어",
};
const c8Exam: Exam = {
  ...constraintExam,
  examSlots: [
    {
      id: "exam-jp",
      date: "2026-06-01",
      period: 1,
      grade: 2,
      subject: "일본어1",
      classes: [1],
    },
  ],
  teachers: [japaneseTeacher],
};
const c8SubjectTeacher = evaluateAll({ exam: c8Exam, assignments: [] }, slot("p1"), japaneseTeacher);
assert.ok(c8SubjectTeacher.reasons.some((reason) => reason.code === "C8"));
const c8Step9Override = evaluateAll(
  {
    exam: {
      ...c8Exam,
      preassigns: [{ id: "pre-jp", teacherId: "jp", dutySlotId: "p1", priority: "fixed" }],
    },
    assignments: [],
  },
  slot("p1"),
  japaneseTeacher,
);
assert.equal(c8Step9Override.ok, true);

const lecturer: Teacher = { ...teacher, id: "lec", name: "강사", roleType: "강사" };
const c4Exam: Exam = {
  ...constraintExam,
  teachers: [lecturer],
  dutyTypes: [...constraintExam.dutyTypes, { id: "assistant", name: "부감독", weight: 100 }],
  dutySlots: [
    ...constraintExam.dutySlots,
    { id: "p1-assistant", date: "2026-06-01", period: 1, roomId: "r", dutyTypeId: "assistant" },
  ],
};
const c4Slot = (id: string) => c4Exam.dutySlots.find((item) => item.id === id)!;
const c4Chief = evaluateAll({ exam: c4Exam, assignments: [] }, c4Slot("p1"), lecturer);
assert.ok(c4Chief.reasons.some((reason) => reason.code === "C4"));
assert.equal(
  evaluateAll({ exam: c4Exam, assignments: [] }, c4Slot("p1-assistant"), lecturer).ok,
  true,
);
// 수동 예외는 해당 (강사, 슬롯) 쌍에만 적용된다 — 같은 강사의 다른 정감독 슬롯은 계속 C4로 막힌다.
const c4ManualExam: Exam = {
  ...c4Exam,
  preassigns: [
    {
      id: "pre-c4",
      teacherId: "lec",
      dutySlotId: "p1",
      priority: "preferred",
      reason: MANUAL_C4_OVERRIDE_REASON,
    },
  ],
};
assert.equal(evaluateAll({ exam: c4ManualExam, assignments: [] }, c4Slot("p1"), lecturer).ok, true);
assert.ok(
  evaluateAll({ exam: c4ManualExam, assignments: [] }, c4Slot("p3"), lecturer).reasons.some(
    (reason) => reason.code === "C4",
  ),
);
// 같은 슬롯이라도 예외를 확인받은 강사가 아닌 다른 강사는 계속 C4로 막힌다.
const otherLecturer: Teacher = { ...lecturer, id: "lec2", name: "다른강사" };
assert.ok(
  evaluateAll(
    { exam: { ...c4ManualExam, teachers: [lecturer, otherLecturer] }, assignments: [] },
    c4Slot("p1"),
    otherLecturer,
  ).reasons.some((reason) => reason.code === "C4"),
);
// 일반 STEP 9 우선/고정 배정은 C4를 풀지 않는다.
const c4Step9Exam: Exam = {
  ...c4Exam,
  preassigns: [{ id: "pre-c4-step9", teacherId: "lec", dutySlotId: "p1", priority: "fixed" }],
};
assert.ok(
  evaluateAll({ exam: c4Step9Exam, assignments: [] }, c4Slot("p1"), lecturer).reasons.some(
    (reason) => reason.code === "C4",
  ),
);
// 수동 수정 평가: C4 단독이면 확인 후 허용, 다른 차단 사유가 겹치면 거부.
const c4Manual = evaluateForManualAssign({ exam: c4Exam, assignments: [] }, c4Slot("p1"), lecturer);
assert.equal(c4Manual.allowed, true);
assert.equal(c4Manual.needsC4Confirm, true);
assert.equal(manualOverrideReasonFor(c4Manual), MANUAL_C4_OVERRIDE_REASON);
assert.equal(
  classifyManualAssignFit({ exam: c4Exam, assignments: [] }, c4Slot("p1"), lecturer),
  "warning",
);
const c4WithBlocking = evaluateForManualAssign(
  { exam: c4Exam, assignments: [{ ...assignment("lec-a1", "p1"), teacherId: "lec" }] },
  c4Slot("p1-other"),
  lecturer,
);
assert.equal(c4WithBlocking.allowed, false);
assert.ok(c4WithBlocking.blocking.some((reason) => reason.code === "CC"));
// 자동 배정은 강사를 정감독에 쓰지 않는다 — 강사가 유일한 후보여도 정감독 슬롯은 비워 둔다.
const c4AutoExam: Exam = {
  ...c4Exam,
  teachers: [lecturer],
  dutySlots: c4Exam.dutySlots.filter((item) => item.id === "p1" || item.id === "p1-assistant"),
};
const c4AutoResult = runSolver(c4AutoExam, { seed: 1 });
assert.deepEqual(
  c4AutoResult.assignments.map((a) => a.dutySlotId),
  ["p1-assistant"],
  "자동 배정은 강사를 부감독에만 배정해야 한다",
);
assert.deepEqual(c4AutoResult.unassigned.map((s) => s.id), ["p1"]);

const invalidC7a = evaluateAll(
  {
    exam: constraintExam,
    assignments: [
      assignment("a1", "p1"),
      assignment("a2", "p2-self"),
      assignment("a3", "p3"),
    ],
  },
  slot("p4"),
  teacher,
);
assert.ok(
  invalidC7a.reasons.some(
    (reason) => reason.code === "C7" && reason.message.includes("최대"),
  ),
);

const targets = waterFillTargets(
  [{ ...teacher, id: "a" }, { ...teacher, id: "b" }],
  new Map([
    ["a", 0],
    ["b", 100],
  ]),
  new Map([
    ["a", 200],
    ["b", 200],
  ]),
  100,
);
assert.ok(Math.abs((targets.get("a") ?? 0) - 100) < 1e-6);
assert.ok(Math.abs((targets.get("b") ?? 0) - 100) < 1e-6);

const mixedTeachers: Teacher[] = [
  { id: "v1", name: "기존1", subject: "", roleType: "정교사", previousFatigueScore: 1000 },
  { id: "v2", name: "기존2", subject: "", roleType: "정교사", previousFatigueScore: 1000 },
  { id: "z1", name: "신규1", subject: "", roleType: "정교사", previousFatigueScore: 0 },
  { id: "z2", name: "신규2", subject: "", roleType: "정교사", previousFatigueScore: 0 },
];
const mixedSlots: DutySlot[] = [];
for (const date of ["2026-06-01", "2026-06-02"]) {
  for (const period of [1, 2]) {
    for (const roomId of ["r1", "r2"]) {
      mixedSlots.push({
        id: `${date}-${period}-${roomId}`,
        date,
        period,
        roomId,
        dutyTypeId: "chief",
      });
    }
  }
}
const mixedExam: Exam = {
  ...baseExam,
  carryOverRatio: 1,
  rooms: [
    { id: "r1", name: "r1" },
    { id: "r2", name: "r2" },
  ],
  teachers: mixedTeachers,
  dutySlots: mixedSlots,
};
const mixedSolved = runSolver(mixedExam, { seed: 1 });
const mixedWithAssignments = { ...mixedExam, assignments: mixedSolved.assignments };
const mixedDuty = (id: string) => teacherDutyWeight(mixedWithAssignments, id);
const freshDuty = [mixedDuty("z1"), mixedDuty("z2")];
const veteranDuty = [mixedDuty("v1"), mixedDuty("v2")];
const mixedWeight = mixedSlots.length * 100;
const perPersonThisExam = mixedWeight / mixedTeachers.length;
const mixedPlan = buildBalancePlan(mixedExam, [], mixedSlots);
assert.equal(mixedSolved.validationErrors.length, 0);
assert.equal(mixedSolved.unassigned.length, 0);
assert.ok(Math.abs((mixedPlan.targetByTeacher.get("z1") ?? 0) - perPersonThisExam) < 1e-6);
assert.ok(Math.abs((mixedPlan.targetByTeacher.get("z2") ?? 0) - perPersonThisExam) < 1e-6);
for (const duty of freshDuty) {
  assert.equal(
    duty,
    perPersonThisExam,
    `신규 감독이 이번 평균 ${perPersonThisExam}이어야 합니다. 신규 ${freshDuty.join(",")}, 기존 ${veteranDuty.join(",")}`,
  );
}

const cappedExcludes = ["z1", "z2"].flatMap((teacherId) =>
  [
    ["2026-06-01", 2],
    ["2026-06-02", 1],
    ["2026-06-02", 2],
  ].map(([date, period]) => ({
    id: `ex-${teacherId}-${date}-${period}`,
    teacherId,
    date: String(date),
    period: Number(period),
  })),
);
const cappedExam: Exam = { ...mixedExam, excludes: cappedExcludes };
const cappedPlan = buildBalancePlan(cappedExam, [], mixedSlots);
const cappedSolved = runSolver(cappedExam, { seed: 1 });
const cappedWithAssignments = { ...cappedExam, assignments: cappedSolved.assignments };
const cappedDuty = (id: string) => teacherDutyWeight(cappedWithAssignments, id);
assert.equal(cappedSolved.validationErrors.length, 0);
assert.equal(cappedSolved.unassigned.length, 0);
assert.ok(Math.abs((cappedPlan.targetByTeacher.get("z1") ?? 0) - 100) < 1e-6);
assert.ok(Math.abs((cappedPlan.targetByTeacher.get("z2") ?? 0) - 100) < 1e-6);
assert.equal(cappedDuty("z1"), 100);
assert.equal(cappedDuty("z2"), 100);
assert.ok(cappedDuty("v1") >= 200);
assert.ok(cappedDuty("v2") >= 200);

const sample = createSampleExam();
const fixed = buildFixedAssignments(sample).filter((assignment) => assignment.fixed);
const solved = runSolver(sample, { seed: 1 });
assert.equal(solved.validationErrors.length, 0);
for (const assignment of fixed) {
  assert.ok(
    solved.assignments.some(
      (actual) =>
        actual.dutySlotId === assignment.dutySlotId &&
        actual.teacherId === assignment.teacherId,
    ),
  );
}

const selectedDate = sample.dutySlots[0]?.date;
assert.ok(selectedDate);
const mutableSlotIds = sample.dutySlots
  .filter((slot) => slot.date === selectedDate)
  .map((slot) => slot.id);
const solvedExam = { ...sample, assignments: solved.assignments };
const outsideBefore = new Map(
  solved.assignments
    .filter(
      (assignment) =>
        !mutableSlotIds.includes(assignment.dutySlotId),
    )
    .map((assignment) => [assignment.dutySlotId, assignment.teacherId]),
);
const reassigned = reassignSubset(solvedExam, mutableSlotIds);
for (const [slotId, teacherId] of outsideBefore) {
  assert.equal(
    reassigned.find((assignment) => assignment.dutySlotId === slotId)?.teacherId,
    teacherId,
  );
}

const fixedOverSlots: DutySlot[] = [
  { id: "z1", date: "2026-06-01", period: 1, roomId: "r", dutyTypeId: "chief" },
  { id: "z2", date: "2026-06-01", period: 2, roomId: "r", dutyTypeId: "chief" },
  { id: "open", date: "2026-06-02", period: 1, roomId: "r", dutyTypeId: "chief" },
];
const fixedOverAssignments: Assignment[] = [
  { id: "a-z1", dutySlotId: "z1", teacherId: "z", fixed: true },
  { id: "a-z2", dutySlotId: "z2", teacherId: "z", fixed: true },
];
const fixedOverExam: Exam = {
  ...baseExam,
  carryOverRatio: 0,
  teachers: [
    { id: "z", name: "신규", subject: "", roleType: "정교사", previousFatigueScore: 0 },
    { id: "v1", name: "기존1", subject: "", roleType: "정교사", previousFatigueScore: 100 },
    { id: "v2", name: "기존2", subject: "", roleType: "정교사", previousFatigueScore: 100 },
  ],
  dutySlots: fixedOverSlots,
  assignments: fixedOverAssignments,
};
const fixedOverPlan = buildBalancePlan(
  fixedOverExam,
  fixedOverAssignments,
  fixedOverSlots.filter((slot) => slot.id === "open"),
);
const fixedOverTargets = buildAssignedMassTargets(
  fixedOverExam,
  fixedOverPlan,
  fixedOverAssignments,
);
const fixedOverScore = scoreSolverResult(
  fixedOverExam,
  {
    assignments: fixedOverAssignments,
    unassigned: fixedOverSlots.filter((slot) => slot.id === "open"),
    validationErrors: [],
  },
  fixedOverPlan,
);
assert.ok((fixedOverPlan.targetByTeacher.get("z") ?? 0) < 200);
assert.ok(Math.abs((fixedOverTargets.get("z") ?? 0) - 200) < 1e-6);
assert.equal(fixedOverScore.maxTargetExcess, 0);
assert.equal(fixedOverScore.targetSSD, 0);

const unevenDates = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-04",
  "2026-06-05",
  "2026-06-06",
  "2026-06-07",
  "2026-06-08",
];
const unevenSlots: DutySlot[] = unevenDates.map((date, index) => ({
  id: `u-${index}`,
  date,
  period: 1,
  roomId: "r",
  dutyTypeId: "chief",
}));
const unevenAssignments: Assignment[] = [0, 1, 2, 3].map((index) => ({
  id: `ua-${index}`,
  dutySlotId: `u-${index}`,
  teacherId: index < 3 ? "e1" : "e2",
  fixed: false,
}));
const unevenExam: Exam = {
  ...baseExam,
  carryOverRatio: 0,
  teachers: [
    { id: "e1", name: "기존A", subject: "", roleType: "정교사", previousFatigueScore: 100 },
    { id: "e2", name: "기존B", subject: "", roleType: "정교사", previousFatigueScore: 100 },
  ],
  dutySlots: unevenSlots,
};
const unevenPlan = buildBalancePlan(unevenExam, [], unevenSlots);
const unevenScore = scoreSolverResult(
  unevenExam,
  {
    assignments: unevenAssignments,
    unassigned: unevenSlots.slice(4),
    validationErrors: [],
  },
  unevenPlan,
);
const unevenTargetSum = [...buildAssignedMassTargets(unevenExam, unevenPlan, unevenAssignments).values()].reduce(
  (sum, value) => sum + value,
  0,
);
assert.ok(Math.abs(unevenScore.maxTargetExcess - 100) < 1e-4, String(unevenScore.maxTargetExcess));
assert.ok(Math.abs(unevenScore.targetSSD - 20000) < 1e-2, String(unevenScore.targetSSD));
assert.ok(Math.abs(unevenTargetSum - 400) < 1e-4, String(unevenTargetSum));

const freshOnlyExam: Exam = {
  ...baseExam,
  periodCount: 1,
  periodTimes: [{ period: 1, start: "09:00", end: "09:50" }],
  rooms: [
    { id: "r1", name: "r1" },
    { id: "r2", name: "r2" },
  ],
  teachers: [
    { id: "f1", name: "신규A", subject: "", roleType: "정교사", previousFatigueScore: 0 },
    { id: "f2", name: "신규B", subject: "", roleType: "정교사", previousFatigueScore: 0 },
  ],
  dutySlots: [
    { id: "hard", date: "2026-06-01", period: 1, roomId: "r1", dutyTypeId: "chief" },
    { id: "soft", date: "2026-06-01", period: 1, roomId: "r2", dutyTypeId: "self" },
  ],
  assignments: [
    { id: "fa-hard", dutySlotId: "hard", teacherId: "f1", fixed: false },
    { id: "fa-soft", dutySlotId: "soft", teacherId: "f2", fixed: false },
  ],
};
const freshAverage = computeAverageTotalFatigue(freshOnlyExam);
assert.equal(freshAverage.count, 0);
assert.equal(freshAverage.average, 0);
const freshSpreads = computeBalanceSpreads(freshOnlyExam);
assert.equal(freshSpreads.eligibleCount, 2);
assert.equal(freshSpreads.totalFatigueSpread, 70);
const freshHints = findBalanceHintSuggestions(freshOnlyExam);
assert.ok(freshHints.length > 0);
assert.equal(freshHints[0]?.before.totalFatigueSpread, 70);

const samplePlan = buildBalancePlanForOptions(sample);
const sampleTargets = buildAssignedMassTargets(sample, samplePlan, solved.assignments);
let sampleTargetSum = 0;
let sampleActualSum = 0;
for (const teacher of sample.teachers) {
  if (!samplePlan.baselineByTeacher.has(teacher.id)) continue;
  sampleTargetSum += sampleTargets.get(teacher.id) ?? 0;
  sampleActualSum += teacherTotalFatigue(solvedExam, teacher);
}
const sampleScore = scoreSolverResult(sample, solved, samplePlan);
assert.ok(Math.abs(sampleTargetSum - sampleActualSum) < 1e-6);
assert.ok(Math.abs(sampleTargetSum - 25820) < 1e-6);
assert.ok(Math.abs(sampleScore.maxTargetExcess - 119.65201465201505) < 1e-6);
assert.ok(Math.abs(sampleScore.targetSSD - 1033100.7326007332) < 1e-4);

console.log(
  JSON.stringify(
    {
      capacity: {
        samePeriod: samePeriodPlan.capacityByTeacher.get(teacher.id),
        c7: c7Plan.capacityByTeacher.get(teacher.id),
      },
      constraints: {
        concurrencyRejected: true,
        invalidC7bRejected: true,
        validC7bAccepted: true,
        c8SubjectLevelRejected: true,
        c8Step9OverrideAccepted: true,
        invalidC7aRejected: true,
      },
      waterFill: Object.fromEntries(targets),
      freshTeacherSkew: {
        perPersonThisExam,
        freshDuty,
        veteranDuty,
        cappedFresh: [cappedDuty("z1"), cappedDuty("z2")],
        cappedVeteran: [cappedDuty("v1"), cappedDuty("v2")],
      },
      sample: {
        assigned: solved.assignments.length,
        unassigned: solved.unassigned.length,
        validationErrors: solved.validationErrors.length,
        reassignScopePreserved: true,
        targetSum: sampleTargetSum,
        actualSum: sampleActualSum,
        maxTargetExcess: sampleScore.maxTargetExcess,
        targetSSD: sampleScore.targetSSD,
      },
    },
    null,
    2,
  ),
);
