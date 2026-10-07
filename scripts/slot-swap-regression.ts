import assert from "node:assert/strict";
import type { Assignment, Exam, Teacher } from "../lib/types";
import { MANUAL_C4_OVERRIDE_REASON } from "../lib/algorithm/constraints";
import { planSlotSwap } from "../lib/algorithm/slotSwap";

const teacher = (id: string, name: string, roleType: Teacher["roleType"] = "정교사"): Teacher => ({
  id,
  name,
  subject: "",
  roleType,
  previousFatigueScore: 0,
});

const DATE = "2026-06-01";

const baseExam: Exam = {
  id: "slot-swap-test",
  name: "slot-swap-test",
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
  rooms: [
    { id: "r1", name: "1-1" },
    { id: "r2", name: "1-2" },
  ],
  dutyDemands: [],
  teachers: [teacher("t1", "김철수"), teacher("t2", "이영희"), teacher("t3", "박강사", "강사")],
  dutyTypes: [
    { id: "chief", name: "정감독", weight: 100 },
    { id: "assist", name: "부감독", weight: 100 },
  ],
  timetable: [],
  excludes: [],
  preassigns: [],
  dutySlots: [
    { id: "p2-chief", date: DATE, period: 2, roomId: "r1", dutyTypeId: "chief" },
    { id: "p2-assist", date: DATE, period: 2, roomId: "r2", dutyTypeId: "assist" },
    { id: "p3-chief", date: DATE, period: 3, roomId: "r1", dutyTypeId: "chief" },
  ],
  assignments: [],
};

const assignment = (id: string, dutySlotId: string, teacherId: string, fixed = false): Assignment => ({
  id,
  dutySlotId,
  teacherId,
  fixed,
});

const withAssignments = (assignments: Assignment[], patch: Partial<Exam> = {}): Exam => ({
  ...baseExam,
  ...patch,
  assignments,
});

const teacherAt = (assignments: Assignment[], slotId: string) =>
  assignments.find((a) => a.dutySlotId === slotId)?.teacherId;

// 같은 교시의 정감독 ↔ 부감독: 교사가 서로 바뀌고 배정 id·고정 여부는 슬롯에 남는다.
const sameRoom = withAssignments([
  assignment("a1", "p2-chief", "t1"),
  assignment("a2", "p2-assist", "t2"),
]);
const basic = planSlotSwap(sameRoom, "p2-chief", "p2-assist");
assert.ok(basic.ok);
assert.equal(teacherAt(basic.assignments, "p2-chief"), "t2");
assert.equal(teacherAt(basic.assignments, "p2-assist"), "t1");
assert.deepEqual(
  basic.assignments.map((a) => a.id),
  ["a1", "a2"],
);
assert.deepEqual(basic.exceptionMessages, []);
assert.deepEqual(basic.preassigns, []);
// 원본은 바뀌지 않는다.
assert.equal(teacherAt(sameRoom.assignments, "p2-chief"), "t1");

// 선택 순서와 상관없이 같은 결과.
const reversed = planSlotSwap(sameRoom, "p2-assist", "p2-chief");
assert.ok(reversed.ok);
assert.equal(teacherAt(reversed.assignments, "p2-chief"), "t2");
assert.equal(teacherAt(reversed.assignments, "p2-assist"), "t1");

// 다른 교시끼리도 규칙을 지키면 바꿀 수 있다.
const crossPeriod = withAssignments([
  assignment("a1", "p2-chief", "t1"),
  assignment("a3", "p3-chief", "t2"),
]);
const crossPlan = planSlotSwap(crossPeriod, "p2-chief", "p3-chief");
assert.ok(crossPlan.ok);
assert.equal(teacherAt(crossPlan.assignments, "p2-chief"), "t2");
assert.equal(teacherAt(crossPlan.assignments, "p3-chief"), "t1");

// 바꿀 수 없는 경우.
const same = planSlotSwap(sameRoom, "p2-chief", "p2-chief");
assert.equal(same.ok, false);

const unassigned = planSlotSwap(
  withAssignments([assignment("a1", "p2-chief", "t1")]),
  "p2-chief",
  "p2-assist",
);
assert.equal(unassigned.ok, false);
assert.match(unassigned.ok ? "" : unassigned.message, /배정된 칸/);

const sameTeacher = planSlotSwap(
  withAssignments([assignment("a1", "p2-chief", "t1"), assignment("a3", "p3-chief", "t1")]),
  "p2-chief",
  "p3-chief",
);
assert.equal(sameTeacher.ok, false);
assert.match(sameTeacher.ok ? "" : sameTeacher.message, /같은 교사/);

const locked = planSlotSwap(
  withAssignments([
    assignment("a1", "p2-chief", "t1", true),
    assignment("a2", "p2-assist", "t2"),
  ]),
  "p2-chief",
  "p2-assist",
);
assert.equal(locked.ok, false);
assert.match(locked.ok ? "" : locked.message, /고정/);

const missingSlot = planSlotSwap(sameRoom, "p2-chief", "no-such-slot");
assert.equal(missingSlot.ok, false);

// STEP 7 제외 시간에 들어가게 되는 교체는 차단하고 사유를 알려 준다.
const excluded = planSlotSwap(
  withAssignments(
    [assignment("a1", "p2-chief", "t1"), assignment("a3", "p3-chief", "t2")],
    { excludes: [{ id: "e1", teacherId: "t2", date: DATE, period: 2, reason: "출장" }] },
  ),
  "p2-chief",
  "p3-chief",
);
assert.equal(excluded.ok, false);
const excludedMessage = excluded.ok ? "" : excluded.message;
assert.match(excludedMessage, /이영희/);
assert.match(excludedMessage, /출장/);

// 강사를 정감독 자리로 보내는 교체는 C4 예외 확인이 필요하고, 확인하면 예외가 STEP 9에 기록된다.
const lecturerExam = withAssignments([
  assignment("a1", "p2-chief", "t1"),
  assignment("a2", "p2-assist", "t3"),
]);
const lecturerPlan = planSlotSwap(lecturerExam, "p2-chief", "p2-assist");
assert.ok(lecturerPlan.ok);
assert.equal(teacherAt(lecturerPlan.assignments, "p2-chief"), "t3");
assert.equal(lecturerPlan.exceptionMessages.length, 1);
assert.match(lecturerPlan.exceptionMessages[0]!, /^\[C4\]/);
assert.match(lecturerPlan.exceptionMessages[0]!, /박강사/);
assert.equal(lecturerPlan.preassigns.length, 1);
assert.equal(lecturerPlan.preassigns[0]!.teacherId, "t3");
assert.equal(lecturerPlan.preassigns[0]!.dutySlotId, "p2-chief");
assert.equal(lecturerPlan.preassigns[0]!.reason, MANUAL_C4_OVERRIDE_REASON);

// 다시 원래대로 바꾸면 그 예외 기록이 지워지고, 예외 확인도 필요 없다.
const swappedBack = planSlotSwap(
  { ...lecturerExam, assignments: lecturerPlan.assignments, preassigns: lecturerPlan.preassigns },
  "p2-chief",
  "p2-assist",
);
assert.ok(swappedBack.ok);
assert.equal(teacherAt(swappedBack.assignments, "p2-chief"), "t1");
assert.equal(teacherAt(swappedBack.assignments, "p2-assist"), "t3");
assert.deepEqual(swappedBack.exceptionMessages, []);
assert.deepEqual(swappedBack.preassigns, []);

// STEP 9에서 사용자가 직접 넣은 우선/고정 지정은 교체해도 그대로 남는다.
const step9 = { id: "p-user", teacherId: "t2", dutySlotId: "p2-assist", priority: "preferred" as const };
const withStep9 = planSlotSwap(
  withAssignments(
    [assignment("a1", "p2-chief", "t1"), assignment("a2", "p2-assist", "t2")],
    { preassigns: [step9] },
  ),
  "p2-chief",
  "p2-assist",
);
assert.ok(withStep9.ok);
assert.deepEqual(withStep9.preassigns, [step9]);

console.log("slot-swap regression: ok");
