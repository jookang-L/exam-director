import assert from "node:assert/strict";
import type { Assignment, DutySlot, Exam, Teacher } from "../lib/types";
import { createSampleExam } from "../lib/sample";
import { evaluateAll } from "../lib/algorithm/constraints";
import { teacherTeachesSubject } from "../lib/algorithm/examSubjectRules";
import { buildFixedAssignments } from "../lib/algorithm/fixed";
import { reassignSubset, runSolver } from "../lib/algorithm/solver";
import {
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
      sample: {
        assigned: solved.assignments.length,
        unassigned: solved.unassigned.length,
        validationErrors: solved.validationErrors.length,
        reassignScopePreserved: true,
      },
    },
    null,
    2,
  ),
);
