import assert from "node:assert/strict";
import type { Assignment, DutySlot, Exam, Teacher } from "../lib/types";
import { createEmptyExam } from "../lib/types";
import { createSampleExam } from "../lib/sample";
import { evaluateAll, type ConstraintContext } from "../lib/algorithm/constraints";
import {
  buildLecturerPriorityAssignments,
  releaseLecturerPriorityFixes,
  withLecturerPeriodRule,
} from "../lib/algorithm/lecturerPriority";
import { runSolver } from "../lib/algorithm/solver";
import { teacherDutyWeight } from "../lib/algorithm/fatigue";
import { checkC2Compliance, checkC9ScheduleCompliance } from "../lib/validation/priorityRuleChecks";

const dutyId = (exam: Exam, name: string) => exam.dutyTypes.find((d) => d.name === name)!.id;
const dutyNameOf = (exam: Exam, slotId: string) =>
  exam.dutyTypes.find((d) => d.id === exam.dutySlots.find((s) => s.id === slotId)!.dutyTypeId)!.name;
const slotOf = (exam: Exam, slotId: string) => exam.dutySlots.find((s) => s.id === slotId)!;

function teacher(id: string, roleType: Teacher["roleType"] = "강사"): Teacher {
  return { id, name: id, subject: "", roleType, previousFatigueScore: 0 };
}
const t3 = (n: string) => teacher(n);

/** 작은 시험: 슬롯은 "id:날짜:교시:종류" 형태로 지정한다. 종류는 chief / assistant / self. */
function smallExam(teachers: Teacher[], slotSpecs: string[]): Exam {
  const exam = createEmptyExam("lecturer-priority");
  const typeByKey = {
    chief: dutyId(exam, "정감독"),
    assistant: dutyId(exam, "부감독"),
    self: dutyId(exam, "자습감독"),
  } as const;
  exam.teachers = teachers;
  exam.rooms = [{ id: "r", name: "r" }];
  exam.dutySlots = slotSpecs.map((spec) => {
    const [id, date, period, kind] = spec.split(":");
    return {
      id,
      date,
      period: Number(period),
      roomId: "r",
      dutyTypeId: typeByKey[kind as keyof typeof typeByKey],
    } satisfies DutySlot;
  });
  return exam;
}

const periodsOf = (exam: Exam, assignments: Assignment[], teacherId?: string) =>
  assignments
    .filter((a) => !teacherId || a.teacherId === teacherId)
    .map((a) => slotOf(exam, a.dutySlotId).period)
    .sort();

/** 강사 무조건 배정 실행과 같은 조건(강사 교시 제한 포함)으로 검증한다. */
function assertAllValid(exam: Exam, created: Assignment[]) {
  const ruled = withLecturerPeriodRule(exam);
  for (const a of created) {
    const t = exam.teachers.find((x) => x.id === a.teacherId)!;
    const ctx: ConstraintContext = {
      exam: ruled,
      assignments: [...exam.assignments, ...created.filter((x) => x.id !== a.id)],
    };
    const r = evaluateAll(ctx, slotOf(exam, a.dutySlotId), t);
    assert.equal(r.ok, true, `${t.name} → ${a.dutySlotId}: ${r.reasons.map((x) => x.message).join(" · ")}`);
  }
}

// ── 1. 샘플 시험: 규칙 준수와 "가능한 시간은 모두 배정" ─────────────────────────────
const sample = createSampleExam();
const lecturers = sample.teachers.filter((t) => t.roleType === "강사");
assert.ok(lecturers.length > 0);
const lecturerIds = new Set(lecturers.map((t) => t.id));
const created = buildLecturerPriorityAssignments(sample);
assert.ok(created.length > 0);
assert.ok(created.every((a) => lecturerIds.has(a.teacherId)), "강사만 배정한다");
assert.ok(created.every((a) => dutyNameOf(sample, a.dutySlotId) === "부감독"), "부감독만 배정한다");
assert.ok(created.every((a) => a.fixed), "솔버가 건드리지 못하게 고정으로 만든다");
assert.ok(
  created.every((a) => slotOf(sample, a.dutySlotId).period !== 1),
  "강사에게 1교시를 배정하지 않는다",
);
assert.equal(new Set(created.map((a) => a.dutySlotId)).size, created.length, "슬롯 중복 없음");
assertAllValid(sample, created);

const periodKey = (s: DutySlot) => `${s.date}|${s.period}`;
const openAssistant = sample.dutySlots.filter(
  (s) => dutyNameOf(sample, s.id) === "부감독" && !created.some((a) => a.dutySlotId === s.id),
);
const allCtx: ConstraintContext = { exam: withLecturerPeriodRule(sample), assignments: created };
for (const lecturer of lecturers) {
  const mine = created.filter((a) => a.teacherId === lecturer.id);
  const myPeriods = new Set(mine.map((a) => periodKey(slotOf(sample, a.dutySlotId))));
  // 하루 최대 3교시
  const perDay = new Map<string, number>();
  for (const a of mine) {
    const d = slotOf(sample, a.dutySlotId).date;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  assert.ok([...perDay.values()].every((n) => n <= 3));
  // 배정받지 못한 교시에 빈 부감독 슬롯이 남아 있다면, 그 강사는 실제로 그 교시를 맡을 수 없어야 한다.
  for (const slot of openAssistant) {
    if (myPeriods.has(periodKey(slot))) continue;
    assert.equal(
      evaluateAll(allCtx, slot, lecturer).ok,
      false,
      `${lecturer.name}은 ${slot.date} ${slot.period}교시를 맡을 수 있는데 배정되지 않았다`,
    );
  }
}

// ── 2. STEP 7 제외·허용 조건, 정규 수업 시간은 뺀다 ───────────────────────────────────
const exam2 = smallExam(
  [t3("L1"), t3("L2")],
  [
    "a1:2026-06-01:2:assistant", "a2:2026-06-01:2:assistant",
    "b1:2026-06-01:3:assistant", "b2:2026-06-01:3:assistant",
    "c1:2026-06-01:4:assistant", "c2:2026-06-01:4:assistant",
    "d1:2026-06-02:2:assistant", "d2:2026-06-02:2:assistant",
  ],
);
exam2.gradeSchedule = [
  { grade: 1, startDate: "2026-06-10", endDate: "2026-06-12" }, // 6/1은 아직 시험 전 → 정규 수업이 있다
  { grade: 2, startDate: "2026-06-01", endDate: "2026-06-12" },
  { grade: 3, startDate: "2026-06-01", endDate: "2026-06-12" },
];
exam2.excludes = [
  { id: "x1", teacherId: "L1", date: "2026-06-01", period: 3 }, // L1: 6/1 3교시 제외
  { id: "x2", teacherId: "L2", date: "2026-06-02" }, // L2: 6/2 하루 전체 제외
];
exam2.timetable = [
  { id: "tt1", teacherId: "L2", weekday: "월", period: 4, grade: 1, className: "1", subject: "수학" },
];
const r2 = buildLecturerPriorityAssignments(exam2);
const has = (teacherId: string, date: string, period: number) =>
  r2.some((a) => {
    const s = slotOf(exam2, a.dutySlotId);
    return a.teacherId === teacherId && s.date === date && s.period === period;
  });
assert.equal(has("L1", "2026-06-01", 3), false, "L1은 제외된 교시에 배정되면 안 된다");
assert.equal(has("L1", "2026-06-01", 2), true);
assert.equal(has("L1", "2026-06-01", 4), true);
assert.equal(has("L1", "2026-06-02", 2), true);
assert.equal(has("L2", "2026-06-02", 2), false, "L2는 6/2 하루 전체 제외");
assert.equal(has("L2", "2026-06-01", 4), false, "L2는 4교시 정규 수업이 있다");
assert.equal(has("L2", "2026-06-01", 2), true);
assert.equal(has("L2", "2026-06-01", 3), true);
assertAllValid(exam2, r2);

// 허용 조건이 부감독을 포함하지 않으면 배정하지 않고, 포함하면 배정한다.
const selfOnly = {
  ...exam2,
  excludes: [{ id: "al", teacherId: "L1", date: "2026-06-01", allowedDutyTypeIds: [dutyId(exam2, "자습감독")] }],
};
assert.equal(
  buildLecturerPriorityAssignments(selfOnly).some(
    (a) => a.teacherId === "L1" && slotOf(selfOnly, a.dutySlotId).date === "2026-06-01",
  ),
  false,
);
const assistantAllowed = {
  ...exam2,
  excludes: [{ id: "al", teacherId: "L1", date: "2026-06-01", allowedDutyTypeIds: [dutyId(exam2, "부감독")] }],
};
assert.equal(
  buildLecturerPriorityAssignments(assistantAllowed).filter(
    (a) => a.teacherId === "L1" && slotOf(assistantAllowed, a.dutySlotId).date === "2026-06-01",
  ).length,
  3,
);

// ── 3. 강사에게 1교시는 아예 주지 않는다 (2~4교시만) ─────────────────────────────────────
const fourPeriods = (extra: string[] = []) =>
  [1, 2, 3, 4].map((p) => `s${p}:2026-06-01:${p}:assistant`).concat(extra);
const exam3 = smallExam([t3("L1")], fourPeriods());
assert.deepEqual(periodsOf(exam3, buildLecturerPriorityAssignments(exam3)), [2, 3, 4]);
// 가능한 교시가 줄어도 1교시를 채우지 않는다 (3교시 제외 → 2·4교시만).
const exam3b = smallExam([t3("L1")], fourPeriods());
exam3b.excludes = [{ id: "x3", teacherId: "L1", date: "2026-06-01", period: 3 }];
assert.deepEqual(periodsOf(exam3b, buildLecturerPriorityAssignments(exam3b)), [2, 4]);
// 1교시에만 시험이 있는 날은 아무도 배정하지 않는다.
const exam3c = smallExam([t3("L1"), t3("L2")], ["p:2026-06-01:1:assistant", "q:2026-06-01:1:assistant"]);
assert.deepEqual(buildLecturerPriorityAssignments(exam3c), []);
// 강사가 여럿이어도 각자 2~4교시가 된다.
const exam3d = smallExam(
  [t3("L1"), t3("L2")],
  [1, 2, 3, 4].flatMap((p) => [`s${p}a:2026-06-01:${p}:assistant`, `s${p}b:2026-06-01:${p}:assistant`]),
);
const r3d = buildLecturerPriorityAssignments(exam3d);
for (const id of ["L1", "L2"]) assert.deepEqual(periodsOf(exam3d, r3d, id), [2, 3, 4]);
// 교시가 5개인 학교에서 하루 3교시 한도에 걸리면 늦은 교시부터 채운다 (1교시 제외 → 3~5교시).
const exam3e = smallExam([t3("L1")], [1, 2, 3, 4, 5].map((p) => `s${p}:2026-06-01:${p}:assistant`));
assert.deepEqual(periodsOf(exam3e, buildLecturerPriorityAssignments(exam3e)), [3, 4, 5]);

// ── 4. 공급 부족: 강사 3명, 교시마다 부감독 1칸 → 한 명에게 몰리지 않고 돌아가며 ────────────
const exam4 = smallExam(
  [t3("L1"), t3("L2"), t3("L3")],
  [2, 3, 4].map((p) => `s${p}:2026-06-01:${p}:assistant`),
);
const r4 = buildLecturerPriorityAssignments(exam4);
assert.equal(r4.length, 3);
assert.deepEqual([...new Set(r4.map((a) => a.teacherId))].sort(), ["L1", "L2", "L3"]);

// 이미 확정된 배정도 공정성에 반영된다: 6/1에 이미 한 번 맡은 L1보다 아직 없는 L2가 6/2의 단 한 칸을 받는다.
const exam4b = smallExam(
  [t3("L1"), t3("L2")],
  ["f:2026-06-01:2:assistant", "s:2026-06-02:2:assistant"],
);
exam4b.assignments = [{ id: "f1", teacherId: "L1", dutySlotId: "f", fixed: true }];
assert.deepEqual(
  buildLecturerPriorityAssignments(exam4b).map((a) => a.teacherId),
  ["L2"],
);

// ── 5. 이미 확정된 배정은 건드리지 않는다 ─────────────────────────────────────────────
const exam5 = smallExam(
  [t3("L1"), teacher("T1", "정교사")],
  [
    "a1:2026-06-01:2:assistant", "a2:2026-06-01:2:assistant",
    "b1:2026-06-01:3:assistant",
    "c1:2026-06-01:4:assistant", "c2:2026-06-01:4:assistant",
  ],
);
// T1이 a1을 고정으로 잡고 있고, L1은 3교시 b1을 이미 고정으로 맡고 있다.
exam5.assignments = [
  { id: "f1", teacherId: "T1", dutySlotId: "a1", fixed: true },
  { id: "f2", teacherId: "L1", dutySlotId: "b1", fixed: true },
];
const r5 = buildLecturerPriorityAssignments(exam5);
assert.equal(r5.some((a) => a.dutySlotId === "a1"), false, "고정 배정된 슬롯은 쓰지 않는다");
assert.equal(r5.some((a) => a.dutySlotId === "b1"), false);
assert.equal(periodsOf(exam5, r5).filter((p) => p === 3).length, 0, "이미 3교시에 배정된 강사는 3교시에 또 배정하지 않는다");
assert.ok(r5.some((a) => a.dutySlotId === "a2"), "남은 2교시 슬롯은 배정한다");
assertAllValid(exam5, r5);

// STEP 9 우선 배정 슬롯은 쓰지 않는다.
const exam5b = smallExam(
  [t3("L1"), teacher("T1", "정교사")],
  ["a1:2026-06-01:2:assistant", "a2:2026-06-01:2:assistant"],
);
exam5b.preassigns = [{ id: "p1", teacherId: "T1", dutySlotId: "a1", priority: "preferred" }];
assert.deepEqual(buildLecturerPriorityAssignments(exam5b).map((a) => a.dutySlotId), ["a2"]);

// 하루 3교시를 이미 채운 강사는 그날 더 받지 않는다.
const exam5c = smallExam([t3("L1")], [2, 3, 4, 5].map((p) => `s${p}:2026-06-01:${p}:assistant`));
exam5c.assignments = [2, 3, 4].map((p) => ({ id: `f${p}`, teacherId: "L1", dutySlotId: `s${p}`, fixed: true }));
assert.equal(buildLecturerPriorityAssignments(exam5c).length, 0);

// ── 6. 강사나 부감독 종류가 없으면 아무것도 만들지 않는다 ───────────────────────────────
assert.deepEqual(
  buildLecturerPriorityAssignments(smallExam([teacher("T1", "정교사")], ["a1:2026-06-01:2:assistant"])),
  [],
);
const noAssistantType = smallExam([t3("L1")], ["a1:2026-06-01:2:assistant"]);
noAssistantType.dutyTypes = noAssistantType.dutyTypes.filter((d) => d.name !== "부감독");
assert.deepEqual(buildLecturerPriorityAssignments(noAssistantType), []);
// 정감독·자습감독 슬롯만 있으면 강사는 배정되지 않는다 (C4).
assert.deepEqual(
  buildLecturerPriorityAssignments(
    smallExam([t3("L1")], ["c1:2026-06-01:2:chief", "s1:2026-06-01:3:self"]),
  ),
  [],
);

// ── 7. 고정 해제 ─────────────────────────────────────────────────────────────────────
const released = releaseLecturerPriorityFixes(
  [
    { id: "keep", teacherId: "T1", dutySlotId: "x", fixed: true, fixedReason: "manual-lock" },
    { id: "free", teacherId: "L1", dutySlotId: "y", fixed: true },
  ],
  new Set(["free"]),
);
assert.equal(released.find((a) => a.id === "free")!.fixed, false);
assert.equal(released.find((a) => a.id === "keep")!.fixed, true, "강사 우선 배정이 아닌 고정은 그대로 둔다");

// ── 8. 1교시 제한(LP)은 솔버 단계에서도 지켜지고, 저장되는 시험에는 영향이 없다 ──────────────
const lpExam = smallExam(
  [t3("L1"), teacher("T1", "정교사")],
  ["a1:2026-06-01:1:assistant", "a2:2026-06-01:2:assistant"],
);
const lpSlot = slotOf(lpExam, "a1");
const lpLecturer = lpExam.teachers[0];
const lpCtx = (exam: Exam): ConstraintContext => ({ exam, assignments: [] });
assert.equal(evaluateAll(lpCtx(lpExam), lpSlot, lpLecturer).ok, true, "제한이 없으면 강사는 1교시를 맡을 수 있다");
const lpReasons = evaluateAll(lpCtx(withLecturerPeriodRule(lpExam)), lpSlot, lpLecturer).reasons;
assert.ok(lpReasons.some((r) => r.code === "LP"), "제한이 있으면 1교시는 LP로 막힌다");
assert.equal(
  evaluateAll(lpCtx(withLecturerPeriodRule(lpExam)), slotOf(lpExam, "a2"), lpLecturer).ok,
  true,
  "2교시는 계속 가능하다",
);
assert.equal(
  evaluateAll(lpCtx(withLecturerPeriodRule(lpExam)), lpSlot, lpExam.teachers[1]).ok,
  true,
  "일반 교사에게는 영향이 없다",
);
assert.equal(withLecturerPeriodRule(lpExam).lecturerBlockedPeriods?.[0], 1);
assert.equal(lpExam.lecturerBlockedPeriods, undefined, "원본 시험은 바뀌지 않는다");

// 강사가 유일한 후보여도 1교시 슬롯은 비워 둔다. 제한이 없으면 강사가 채운다.
const onlyLecturer = smallExam([t3("L1")], ["a1:2026-06-01:1:assistant", "a2:2026-06-01:2:assistant"]);
const solvedPlain = runSolver(onlyLecturer, { seed: 1 });
assert.deepEqual(solvedPlain.assignments.map((a) => a.dutySlotId).sort(), ["a1", "a2"]);
const solvedRuled = runSolver(withLecturerPeriodRule(onlyLecturer), { seed: 1 });
assert.deepEqual(solvedRuled.assignments.map((a) => a.dutySlotId), ["a2"]);
assert.deepEqual(solvedRuled.unassigned.map((s) => s.id), ["a1"]);
assert.equal(solvedRuled.validationErrors.length, 0);

// STEP 9 우선/고정, 이미 고정된 배정은 제한보다 우선한다 — 1교시여도 유지되고 제약 오류도 없다.
const step9Exam = withLecturerPeriodRule({
  ...onlyLecturer,
  preassigns: [{ id: "p-l", teacherId: "L1", dutySlotId: "a1", priority: "fixed" }],
});
assert.equal(evaluateAll(lpCtx(step9Exam), slotOf(step9Exam, "a1"), step9Exam.teachers[0]).ok, true);
const solvedStep9 = runSolver(step9Exam, { seed: 1 });
assert.equal(solvedStep9.assignments.find((a) => a.dutySlotId === "a1")?.teacherId, "L1");
assert.equal(solvedStep9.validationErrors.length, 0);
const fixedExam = withLecturerPeriodRule({
  ...onlyLecturer,
  assignments: [{ id: "fx", teacherId: "L1", dutySlotId: "a1", fixed: true }],
});
const solvedFixed = runSolver(fixedExam, { seed: 1 });
assert.equal(solvedFixed.assignments.find((a) => a.dutySlotId === "a1")?.teacherId, "L1");
assert.equal(solvedFixed.validationErrors.length, 0);
// 예외는 그 배정 하나뿐이다 — 같은 강사의 다른 1교시 슬롯은 여전히 막힌다.
const twoFirstPeriods = withLecturerPeriodRule({
  ...smallExam([t3("L1")], ["a1:2026-06-01:1:assistant", "a3:2026-06-02:1:assistant"]),
  preassigns: [{ id: "p-l", teacherId: "L1", dutySlotId: "a1", priority: "fixed" }],
});
const solvedTwo = runSolver(twoFirstPeriods, { seed: 1 });
assert.deepEqual(solvedTwo.assignments.map((a) => a.dutySlotId), ["a1"]);

// ── 9. 솔버 연동: 강사 배정은 보존되고, 교사가 충분하면 일반 교사의 부담이 줄어든다 ───────────
const isLecturer = (t: Teacher) => t.roleType === "강사";
const isRegular = (t: Teacher) => t.roleType === "정교사" || t.roleType === "기간제";

function compareWithAndWithoutPriority(extraRegularTeachers: number) {
  const exam = createSampleExam();
  for (let i = 0; i < extraRegularTeachers; i++) {
    exam.teachers.push({
      id: `x${i}`,
      name: `추가${i}`,
      subject: "기타",
      roleType: "정교사",
      previousFatigueScore: (i % 5) * 100,
    });
  }
  const priority = buildLecturerPriorityAssignments(exam);
  const baseline = runSolver(exam, { seed: 1 });
  // 화면과 같은 입력: 강사 우선 배정을 고정으로 넣고 강사 교시 제한을 붙인다.
  const withPriority = runSolver(withLecturerPeriodRule({ ...exam, assignments: priority }), { seed: 1 });

  assert.equal(withPriority.validationErrors.length, 0, "제약 오류 없음");
  for (const a of priority) {
    const kept = withPriority.assignments.find((x) => x.dutySlotId === a.dutySlotId);
    assert.equal(kept?.teacherId, a.teacherId, "강사 우선 배정이 그대로 유지된다");
  }
  const ids = new Set(exam.teachers.filter(isLecturer).map((t) => t.id));
  const lecturerAssignments = (assignments: Assignment[]) =>
    assignments.filter((a) => ids.has(a.teacherId));
  assert.ok(
    lecturerAssignments(withPriority.assignments).every((a) => dutyNameOf(exam, a.dutySlotId) === "부감독"),
    "강사는 부감독에만 배정된다",
  );
  assert.ok(
    lecturerAssignments(withPriority.assignments).every((a) => slotOf(exam, a.dutySlotId).period !== 1),
    "자동 배정 단계에서도 강사에게 1교시를 배정하지 않는다",
  );
  const loadOf = (assignments: Assignment[], pick: (t: Teacher) => boolean) =>
    exam.teachers
      .filter(pick)
      .reduce((sum, t) => sum + teacherDutyWeight({ ...exam, assignments }, t.id), 0);
  return {
    우선배정: priority.length,
    기존_강사1교시: lecturerAssignments(baseline.assignments).filter(
      (a) => slotOf(exam, a.dutySlotId).period === 1,
    ).length,
    미배정: { 기존: baseline.unassigned.length, 강사우선: withPriority.unassigned.length },
    강사부담: {
      기존: loadOf(baseline.assignments, isLecturer),
      강사우선: loadOf(withPriority.assignments, isLecturer),
    },
    일반교사부담: {
      기존: loadOf(baseline.assignments, isRegular),
      강사우선: loadOf(withPriority.assignments, isRegular),
    },
  };
}

// 교사가 모자라면 기존 솔버는 1교시에도 강사를 쓰지만, 이 버튼은 1교시를 아예 비워 둔다(그만큼 미배정이 늘 수 있다).
const scarce = compareWithAndWithoutPriority(0);
assert.ok(scarce.기존_강사1교시 > 0, "교사 부족 상황에서는 기존 솔버가 강사를 1교시에 쓴다 — 이 제한이 필요한 이유");
// 교사가 충분하면 기존 솔버는 강사를 거의 쓰지 않는다 — 이 버튼이 효과를 내는 경우.
const plentiful = compareWithAndWithoutPriority(40);
assert.ok(
  plentiful.강사부담.강사우선 > plentiful.강사부담.기존,
  `강사 부담이 늘어야 한다 (${plentiful.강사부담.기존} → ${plentiful.강사부담.강사우선})`,
);
assert.ok(
  plentiful.일반교사부담.강사우선 < plentiful.일반교사부담.기존,
  `일반 교사 부담이 줄어야 한다 (${plentiful.일반교사부담.기존} → ${plentiful.일반교사부담.강사우선})`,
);
assert.equal(plentiful.미배정.강사우선, 0);

// ── 10. 우선순위: 영양교사 · 담임 첫날 자습 · STEP 9 는 강사 배정보다 먼저다 ──────────────────
// 작은 시험에서 세 가지가 모두 걸려 있고 강사가 남는 슬롯을 전부 가져가려는 상황을 만든다.
function priorityScenario() {
  const D = "2026-06-01";
  const exam = smallExam(
    [
      t3("L1"), t3("L2"), t3("L3"),
      teacher("NT", "영양교사"),
      { ...teacher("H", "정교사"), homeroomGrade: 1, homeroomClass: 1 },
      teacher("T1", "정교사"), teacher("T2", "정교사"),
      ...["R1", "R2", "R3", "R4", "R5", "R6"].map((id) => teacher(id, "정교사")),
    ],
    [
      `h1:${D}:1:self`,
      `a1:${D}:1:assistant`, `a2:${D}:1:assistant`, `a3:${D}:1:assistant`,
      `b1:${D}:2:assistant`, `b2:${D}:2:assistant`, // 영양교사가 이 중 하나를 쓴다
      `c1:${D}:3:assistant`, `c2:${D}:3:assistant`, `c3:${D}:3:assistant`,
    ],
  );
  exam.rooms = [
    { id: "r11", name: "1-1" },
    { id: "r", name: "r" },
  ];
  exam.dutySlots = exam.dutySlots.map((s) => (s.id === "h1" ? { ...s, roomId: "r11" } : s));
  exam.gradeSchedule = [
    { grade: 1, startDate: D, endDate: D },
    { grade: 2, startDate: D, endDate: D },
    { grade: 3, startDate: D, endDate: D },
  ];
  exam.preassigns = [
    { id: "p-b3", teacherId: "T1", dutySlotId: "c1", priority: "preferred" }, // STEP 9 우선 (3교시)
    { id: "p-a1", teacherId: "T2", dutySlotId: "a1", priority: "fixed" }, // STEP 9 고정 (1교시)
  ];
  return exam;
}

const prio = priorityScenario();
const prioCreated = buildLecturerPriorityAssignments(prio);
const prioSlots = new Set(prioCreated.map((a) => a.dutySlotId));
for (const reserved of ["h1", "a1", "c1"]) {
  assert.equal(prioSlots.has(reserved), false, `${reserved}는 담임 첫날 자습·STEP 9가 차지한 슬롯이라 강사가 쓸 수 없다`);
}
// 2교시 부감독 2칸 중 하나는 영양교사 몫이므로 강사는 한 칸만 받는다.
assert.equal(periodsOf(prio, prioCreated).filter((p) => p === 2).length, 1);
assert.equal(prioSlots.has("b1"), false, "영양교사가 쓸 첫 2교시 슬롯은 강사가 쓸 수 없다");
assert.equal(periodsOf(prio, prioCreated).filter((p) => p === 1).length, 0, "강사에게 1교시는 없다");

const prioSolved = runSolver(withLecturerPeriodRule({ ...prio, assignments: prioCreated }), { seed: 1 });
assert.equal(prioSolved.validationErrors.length, 0);
const holder = (slotId: string) => prioSolved.assignments.find((a) => a.dutySlotId === slotId)?.teacherId;
assert.equal(holder("h1"), "H", "담임 첫날 1교시 본인 반 자습감독");
assert.equal(holder("c1"), "T1", "STEP 9 우선 배정");
assert.equal(holder("a1"), "T2", "STEP 9 고정 배정");
assert.equal(holder("b1"), "NT", "영양교사 2교시 부감독");
const prioFinal: Exam = { ...prio, assignments: prioSolved.assignments };
assert.deepEqual(checkC2Compliance(prioFinal, prioSolved.assignments), []);
assert.deepEqual(checkC9ScheduleCompliance(prioFinal, prioSolved.assignments), []);
assert.ok(
  prioSolved.assignments
    .filter((a) => ["L1", "L2", "L3"].includes(a.teacherId))
    .every((a) => slotOf(prio, a.dutySlotId).period !== 1),
  "자동 배정 단계에서도 강사는 1교시에 들어가지 않는다",
);
assert.ok(
  prioCreated.every((a) => ["L1", "L2", "L3"].includes(a.teacherId)),
  "강사 우선 배정은 강사에게만",
);

// 강사 우선 배정 유무와 관계없이 같은 슬롯이 같은 교사에게 확정된다.
const prioBaseline = runSolver(prio, { seed: 1 });
const reservedHolders = (r: typeof prioSolved) =>
  ["h1", "a1", "c1", "b1"].map((id) => r.assignments.find((a) => a.dutySlotId === id)?.teacherId);
assert.deepEqual(reservedHolders(prioSolved), reservedHolders(prioBaseline));

// 샘플 시험 규모에서도: 영양교사 일정·담임 첫날 자습·STEP 9 가 강사 우선 배정 유무와 무관하게 유지된다.
function sampleWithPriorities() {
  const exam = createSampleExam();
  for (let i = 0; i < 40; i++) {
    exam.teachers.push({
      id: `x${i}`,
      name: `추가${i}`,
      subject: "기타",
      roleType: i === 0 ? "영양교사" : "정교사", // x0 → 5/24·5/25 2교시 부감독
      previousFatigueScore: (i % 5) * 100,
    });
  }
  const assistantId = dutyId(exam, "부감독");
  const day1P2 = exam.dutySlots.filter(
    (s) => s.date === "2026-05-25" && s.period === 2 && s.dutyTypeId === assistantId,
  );
  exam.preassigns = [
    { id: "s9-a", teacherId: "x5", dutySlotId: day1P2[0].id, priority: "preferred" },
    { id: "s9-b", teacherId: "x6", dutySlotId: day1P2[1].id, priority: "fixed" },
  ];
  return exam;
}
const big = sampleWithPriorities();
const bigCreated = buildLecturerPriorityAssignments(big);
const bigWith = runSolver(withLecturerPeriodRule({ ...big, assignments: bigCreated }), { seed: 1 });
const bigWithout = runSolver(big, { seed: 1 });
assert.equal(bigWith.validationErrors.length, 0);
const bigFinal = (r: typeof bigWith): Exam => ({ ...big, assignments: r.assignments });
assert.deepEqual(checkC9ScheduleCompliance(bigFinal(bigWith), bigWith.assignments), []);
// 샘플 데이터는 고사실 이름이 맞지 않아 일부 담임은 원래부터 C2를 못 지킨다. 메시지에는 "실제로 누가 들어갔는지"가
// 섞여 있으므로, 어느 담임이 실패하는지(교사 이름)만 비교한다 — 강사 우선 배정으로 새로 실패하는 담임이 없어야 한다.
const c2FailedTeachers = (r: typeof bigWith) =>
  checkC2Compliance(bigFinal(r), r.assignments)
    .map((message) => message.split(":")[0])
    .sort();
assert.deepEqual(
  c2FailedTeachers(bigWith),
  c2FailedTeachers(bigWithout),
  "담임 첫날 자습 결과가 강사 우선 배정으로 달라지면 안 된다",
);
for (const p of big.preassigns) {
  assert.equal(
    bigWith.assignments.find((a) => a.dutySlotId === p.dutySlotId)?.teacherId,
    p.teacherId,
    "STEP 9 배정이 유지된다",
  );
}
assert.ok(
  bigCreated.every((a) => !big.preassigns.some((p) => p.dutySlotId === a.dutySlotId)),
  "강사가 STEP 9 슬롯을 차지하지 않는다",
);

console.log(JSON.stringify({ 교사부족: scarce, 교사충분: plentiful }, null, 2));
