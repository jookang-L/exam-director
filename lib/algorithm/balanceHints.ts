import type { Assignment, DutyTypeName, Exam, Teacher, ValidationIssue } from "@/lib/types";
import { teacherTotalFatigue } from "./fatigue";
import { isIncludedInAverageFatigue } from "./averageFatigue";
import { runFullValidation } from "@/lib/validation/rules";

const MAX_CANDIDATES_TO_VALIDATE = 60;
export const MAX_BALANCE_HINT_SUGGESTIONS = 20;

export type TeacherBalanceCounts = {
  chief: number;
  assistant: number;
  hard: number;
  selfStudy: number;
};

export type BalanceHintMetrics = {
  hardSpread: number;
  selfStudySpread: number;
  totalFatigueSpread: number;
};

export type BalanceHintTeacherSnapshot = TeacherBalanceCounts & {
  teacherId: string;
  teacherName: string;
  fatigue: {
    previous: number;
    current: number;
    total: number;
  };
};

export type BalanceHintSuggestion = {
  id: string;
  kind: "swap" | "selfStudyMove";
  hardAssignmentId: string;
  selfStudyAssignmentId: string;
  hardTeacherId: string;
  selfStudyTeacherId: string;
  hardTeacherName: string;
  selfStudyTeacherName: string;
  date: string;
  period: number;
  hardDutyName: DutyTypeName;
  hardRoomName: string;
  selfStudyRoomName: string;
  before: BalanceHintMetrics;
  after: BalanceHintMetrics;
  hardTeacherBefore: BalanceHintTeacherSnapshot;
  hardTeacherAfter: BalanceHintTeacherSnapshot;
  selfStudyTeacherBefore: BalanceHintTeacherSnapshot;
  selfStudyTeacherAfter: BalanceHintTeacherSnapshot;
  warnings: ValidationIssue[];
};

type AssignmentDetail = {
  assignment: Assignment;
  teacher: Teacher;
  dutyName: DutyTypeName;
  date: string;
  period: number;
  roomName: string;
};

type PreliminaryCandidate = {
  kind: "swap";
  hard: AssignmentDetail;
  selfStudy: AssignmentDetail;
  pairImprovement: number;
};

type PreliminarySelfStudyMoveCandidate = {
  kind: "selfStudyMove";
  selfStudy: AssignmentDetail;
  receiver: Teacher;
  pairImprovement: number;
};

export function buildBalanceHintExam(exam: Exam, suggestion: BalanceHintSuggestion): Exam {
  if (suggestion.kind === "selfStudyMove") {
    return {
      ...exam,
      assignments: moveAssignmentTeacher(
        exam.assignments,
        suggestion.selfStudyAssignmentId,
        suggestion.selfStudyTeacherId,
      ),
    };
  }

  return {
    ...exam,
    assignments: swapAssignmentTeachers(
      exam.assignments,
      suggestion.hardAssignmentId,
      suggestion.selfStudyAssignmentId,
    ),
  };
}

export function hasThreeDutyDayWithoutSelfStudy(exam: Exam): boolean {
  const teacherById = new Map(exam.teachers.map((teacher) => [teacher.id, teacher]));
  const slotById = new Map(exam.dutySlots.map((slot) => [slot.id, slot]));
  const dutyTypeById = new Map(exam.dutyTypes.map((dutyType) => [dutyType.id, dutyType]));
  const byTeacherDate = new Map<string, { dutyName: DutyTypeName | undefined }[]>();

  for (const assignment of exam.assignments) {
    const teacher = teacherById.get(assignment.teacherId);
    const slot = slotById.get(assignment.dutySlotId);
    if (!teacher || !slot || teacher.roleType === "강사") continue;

    const key = `${teacher.id}|${slot.date}`;
    const entries = byTeacherDate.get(key) ?? [];
    entries.push({ dutyName: dutyTypeById.get(slot.dutyTypeId)?.name });
    byTeacherDate.set(key, entries);
  }

  for (const entries of byTeacherDate.values()) {
    if (entries.length >= 3 && !entries.some((entry) => entry.dutyName === "자습감독")) {
      return true;
    }
  }

  return false;
}

export function findBalanceHintSuggestions(exam: Exam): BalanceHintSuggestion[] {
  const currentIssues = runFullValidation(exam);
  if (currentIssues.some((issue) => issue.severity === "error")) return [];
  if (hasThreeDutyDayWithoutSelfStudy(exam)) return [];

  const dutyTypeById = new Map(exam.dutyTypes.map((dutyType) => [dutyType.id, dutyType]));
  const slotById = new Map(exam.dutySlots.map((slot) => [slot.id, slot]));
  const teacherById = new Map(exam.teachers.map((teacher) => [teacher.id, teacher]));
  const roomById = new Map(exam.rooms.map((room) => [room.id, room]));
  const protectedSlotIds = new Set(exam.preassigns.map((preassign) => preassign.dutySlotId));
  const currentCounts = countTeacherRoles(exam, exam.assignments);
  const currentMetrics = computeMetrics(exam, exam.assignments, currentCounts);

  const byDatePeriod = new Map<string, AssignmentDetail[]>();
  for (const assignment of exam.assignments) {
    if (assignment.fixed || protectedSlotIds.has(assignment.dutySlotId)) continue;
    const slot = slotById.get(assignment.dutySlotId);
    const teacher = teacherById.get(assignment.teacherId);
    if (!slot || !teacher || !isSwappableTeacher(teacher)) continue;

    const dutyName = dutyTypeById.get(slot.dutyTypeId)?.name;
    if (dutyName !== "정감독" && dutyName !== "부감독" && dutyName !== "자습감독") continue;

    const detail: AssignmentDetail = {
      assignment,
      teacher,
      dutyName,
      date: slot.date,
      period: slot.period,
      roomName: roomById.get(slot.roomId)?.name ?? slot.roomId,
    };
    const key = `${slot.date}|${slot.period}`;
    byDatePeriod.set(key, [...(byDatePeriod.get(key) ?? []), detail]);
  }

  const preliminary: Array<PreliminaryCandidate | PreliminarySelfStudyMoveCandidate> = [];
  for (const details of byDatePeriod.values()) {
    const hardAssignments = details.filter(
      (detail) => detail.dutyName === "정감독" || detail.dutyName === "부감독",
    );
    const selfStudyAssignments = details.filter((detail) => detail.dutyName === "자습감독");

    for (const hard of hardAssignments) {
      const hardCounts = currentCounts.get(hard.teacher.id) ?? emptyCounts();
      for (const selfStudy of selfStudyAssignments) {
        if (hard.teacher.id === selfStudy.teacher.id) continue;
        const selfCounts = currentCounts.get(selfStudy.teacher.id) ?? emptyCounts();
        if (hardCounts.hard <= selfCounts.hard) continue;
        if (selfCounts.selfStudy <= hardCounts.selfStudy) continue;

        preliminary.push({
          kind: "swap",
          hard,
          selfStudy,
          pairImprovement:
            hardCounts.hard -
            selfCounts.hard +
            selfCounts.selfStudy -
            hardCounts.selfStudy,
        });
      }
    }
  }

  const selfStudyAssignments = [...byDatePeriod.values()]
    .flat()
    .filter((detail) => detail.dutyName === "자습감독");
  if (currentMetrics.hardSpread <= 1) {
    const eligibleReceivers = exam.teachers
      .filter((teacher) => isSwappableTeacher(teacher) && currentCounts.has(teacher.id))
      .sort(
        (a, b) =>
          (currentCounts.get(a.id)?.selfStudy ?? 0) - (currentCounts.get(b.id)?.selfStudy ?? 0) ||
          a.name.localeCompare(b.name, "ko"),
      )
      .slice(0, 12);
    const moveDonors = [...selfStudyAssignments]
      .sort(
        (a, b) =>
          (currentCounts.get(b.teacher.id)?.selfStudy ?? 0) -
            (currentCounts.get(a.teacher.id)?.selfStudy ?? 0) ||
          a.teacher.name.localeCompare(b.teacher.name, "ko"),
      )
      .slice(0, 24);

    for (const selfStudy of moveDonors) {
      const donorCounts = currentCounts.get(selfStudy.teacher.id) ?? emptyCounts();
      for (const receiver of eligibleReceivers) {
        if (receiver.id === selfStudy.teacher.id) continue;
        const receiverCounts = currentCounts.get(receiver.id) ?? emptyCounts();
        if (donorCounts.selfStudy <= receiverCounts.selfStudy) continue;
        preliminary.push({
          kind: "selfStudyMove",
          selfStudy,
          receiver,
          pairImprovement: donorCounts.selfStudy - receiverCounts.selfStudy,
        });
      }
    }
  }

  const suggestions: BalanceHintSuggestion[] = [];
  const sorted = preliminary
    .sort((a, b) => b.pairImprovement - a.pairImprovement)
    .slice(0, MAX_CANDIDATES_TO_VALIDATE);

  for (const candidate of sorted) {
    const nextAssignments =
      candidate.kind === "swap"
        ? swapAssignmentTeachers(
            exam.assignments,
            candidate.hard.assignment.id,
            candidate.selfStudy.assignment.id,
          )
        : moveAssignmentTeacher(
            exam.assignments,
            candidate.selfStudy.assignment.id,
            candidate.receiver.id,
          );
    const nextExam = { ...exam, assignments: nextAssignments };
    const issues = runFullValidation(nextExam);
    if (issues.some((issue) => issue.severity === "error")) continue;
    if (hasThreeDutyDayWithoutSelfStudy(nextExam)) continue;

    const nextCounts = countTeacherRoles(exam, nextAssignments);
    const nextMetrics = computeMetrics(nextExam, nextAssignments, nextCounts);
    const hardSpreadNotWorse = nextMetrics.hardSpread <= currentMetrics.hardSpread;
    const hardSpreadAcceptable = nextMetrics.hardSpread <= 1;
    if (candidate.kind === "swap" && !hardSpreadNotWorse) continue;
    if (candidate.kind === "selfStudyMove" && !hardSpreadAcceptable) continue;

    const metricImproved =
      nextMetrics.hardSpread + nextMetrics.selfStudySpread <
      currentMetrics.hardSpread + currentMetrics.selfStudySpread;
    const pairStillUseful = candidate.pairImprovement > 0;
    if (!metricImproved && !pairStillUseful) continue;

    suggestions.push(
      candidate.kind === "swap"
        ? {
            id: `swap:${candidate.hard.assignment.id}:${candidate.selfStudy.assignment.id}`,
            kind: "swap",
            hardAssignmentId: candidate.hard.assignment.id,
            selfStudyAssignmentId: candidate.selfStudy.assignment.id,
            hardTeacherId: candidate.hard.teacher.id,
            selfStudyTeacherId: candidate.selfStudy.teacher.id,
            hardTeacherName: candidate.hard.teacher.name,
            selfStudyTeacherName: candidate.selfStudy.teacher.name,
            date: candidate.hard.date,
            period: candidate.hard.period,
            hardDutyName: candidate.hard.dutyName,
            hardRoomName: candidate.hard.roomName,
            selfStudyRoomName: candidate.selfStudy.roomName,
            before: currentMetrics,
            after: nextMetrics,
            hardTeacherBefore: snapshot(exam, candidate.hard.teacher, currentCounts),
            hardTeacherAfter: snapshot(nextExam, candidate.hard.teacher, nextCounts),
            selfStudyTeacherBefore: snapshot(exam, candidate.selfStudy.teacher, currentCounts),
            selfStudyTeacherAfter: snapshot(nextExam, candidate.selfStudy.teacher, nextCounts),
            warnings: issues.filter((issue) => issue.severity === "warning"),
          }
        : {
            id: `move:${candidate.selfStudy.assignment.id}:${candidate.receiver.id}`,
            kind: "selfStudyMove",
            hardAssignmentId: "",
            selfStudyAssignmentId: candidate.selfStudy.assignment.id,
            hardTeacherId: candidate.selfStudy.teacher.id,
            selfStudyTeacherId: candidate.receiver.id,
            hardTeacherName: candidate.selfStudy.teacher.name,
            selfStudyTeacherName: candidate.receiver.name,
            date: candidate.selfStudy.date,
            period: candidate.selfStudy.period,
            hardDutyName: "자습감독",
            hardRoomName: candidate.selfStudy.roomName,
            selfStudyRoomName: candidate.selfStudy.roomName,
            before: currentMetrics,
            after: nextMetrics,
            hardTeacherBefore: snapshot(exam, candidate.selfStudy.teacher, currentCounts),
            hardTeacherAfter: snapshot(nextExam, candidate.selfStudy.teacher, nextCounts),
            selfStudyTeacherBefore: snapshot(exam, candidate.receiver, currentCounts),
            selfStudyTeacherAfter: snapshot(nextExam, candidate.receiver, nextCounts),
            warnings: issues.filter((issue) => issue.severity === "warning"),
          },
    );

    if (suggestions.length >= MAX_BALANCE_HINT_SUGGESTIONS) break;
  }

  return suggestions.sort(compareSuggestions);
}

function compareSuggestions(a: BalanceHintSuggestion, b: BalanceHintSuggestion): number {
  const aImprove = improvementScore(a);
  const bImprove = improvementScore(b);
  if (aImprove !== bImprove) return bImprove - aImprove;
  if (a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
  return `${a.date}|${a.period}|${a.hardTeacherName}`.localeCompare(
    `${b.date}|${b.period}|${b.hardTeacherName}`,
    "ko",
  );
}

function improvementScore(suggestion: BalanceHintSuggestion): number {
  return (
    suggestion.before.hardSpread -
    suggestion.after.hardSpread +
    suggestion.before.selfStudySpread -
    suggestion.after.selfStudySpread
  );
}

function moveAssignmentTeacher(
  assignments: Assignment[],
  assignmentId: string,
  teacherId: string,
): Assignment[] {
  return assignments.map((assignment) =>
    assignment.id === assignmentId ? { ...assignment, teacherId } : assignment,
  );
}

function isSwappableTeacher(teacher: Teacher): boolean {
  return teacher.roleType !== "강사" && teacher.roleType !== "영양교사";
}

function swapAssignmentTeachers(
  assignments: Assignment[],
  hardAssignmentId: string,
  selfStudyAssignmentId: string,
): Assignment[] {
  const hard = assignments.find((assignment) => assignment.id === hardAssignmentId);
  const selfStudy = assignments.find((assignment) => assignment.id === selfStudyAssignmentId);
  if (!hard || !selfStudy) return assignments;

  return assignments.map((assignment) => {
    if (assignment.id === hardAssignmentId) {
      return { ...assignment, teacherId: selfStudy.teacherId };
    }
    if (assignment.id === selfStudyAssignmentId) {
      return { ...assignment, teacherId: hard.teacherId };
    }
    return assignment;
  });
}

function countTeacherRoles(exam: Exam, assignments: Assignment[]): Map<string, TeacherBalanceCounts> {
  const counts = new Map<string, TeacherBalanceCounts>();
  const slotById = new Map(exam.dutySlots.map((slot) => [slot.id, slot]));
  const dutyTypeById = new Map(exam.dutyTypes.map((dutyType) => [dutyType.id, dutyType]));

  for (const teacher of exam.teachers) {
    if (isIncludedInAverageFatigue(exam, teacher)) counts.set(teacher.id, emptyCounts());
  }

  for (const assignment of assignments) {
    const current = counts.get(assignment.teacherId);
    if (!current) continue;
    const slot = slotById.get(assignment.dutySlotId);
    const dutyName = slot ? dutyTypeById.get(slot.dutyTypeId)?.name : undefined;
    if (dutyName === "정감독") {
      current.chief += 1;
      current.hard += 1;
    } else if (dutyName === "부감독") {
      current.assistant += 1;
      current.hard += 1;
    } else if (dutyName === "자습감독") {
      current.selfStudy += 1;
    }
  }

  return counts;
}

function computeMetrics(
  exam: Exam,
  assignments: Assignment[],
  counts: Map<string, TeacherBalanceCounts>,
): BalanceHintMetrics {
  const nextExam = assignments === exam.assignments ? exam : { ...exam, assignments };
  const eligibleTeachers = exam.teachers.filter((teacher) => counts.has(teacher.id));
  const hardValues = eligibleTeachers.map((teacher) => counts.get(teacher.id)?.hard ?? 0);
  const selfStudyValues = eligibleTeachers.map((teacher) => counts.get(teacher.id)?.selfStudy ?? 0);
  const fatigueValues = eligibleTeachers.map((teacher) => teacherTotalFatigue(nextExam, teacher));
  return {
    hardSpread: spread(hardValues),
    selfStudySpread: spread(selfStudyValues),
    totalFatigueSpread: spread(fatigueValues),
  };
}

function snapshot(
  exam: Exam,
  teacher: Teacher,
  counts: Map<string, TeacherBalanceCounts>,
): BalanceHintTeacherSnapshot {
  const count = counts.get(teacher.id) ?? emptyCounts();
  const previous = (teacher.previousFatigueScore ?? 0) * exam.carryOverRatio;
  const total = teacherTotalFatigue(exam, teacher);
  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    chief: count.chief,
    assistant: count.assistant,
    hard: count.hard,
    selfStudy: count.selfStudy,
    fatigue: {
      previous,
      current: total - previous,
      total,
    },
  };
}

function spread(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function emptyCounts(): TeacherBalanceCounts {
  return { chief: 0, assistant: 0, hard: 0, selfStudy: 0 };
}
