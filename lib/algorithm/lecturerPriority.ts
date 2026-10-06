import type { Assignment, DutySlot, Exam, Teacher } from "@/lib/types";
import { newId } from "@/lib/types";
import {
  applyAssignmentToIndexes,
  buildAssignmentIndexes,
  buildExamLookups,
} from "./constraintIndexes";
import { evaluateAll, type ConstraintContext } from "./constraints";
import { buildFixedAssignments } from "./fixed";

function isLecturerRole(teacher: Teacher): boolean {
  return teacher.roleType === "강사";
}

/** 「강사 무조건 배정」에서 강사에게 배정하지 않는 교시. 강사는 2교시 이후에만 맡는다. */
export const LECTURER_BLOCKED_PERIODS: readonly number[] = [1];

/**
 * 「강사 무조건 배정」 실행용 시험 데이터 — 강사가 `LECTURER_BLOCKED_PERIODS`에 배정되지 않도록 제한(LP)을 붙인다.
 * 우선 배정과 이어지는 자동 배정(솔버)이 같은 제한을 보도록 솔버 입력에 이 결과를 넘긴다.
 * 저장하는 시험에는 쓰지 않는다. STEP 9 우선/고정과 이미 고정된 배정은 제한보다 우선한다.
 */
export function withLecturerPeriodRule(exam: Exam): Exam {
  return { ...exam, lecturerBlockedPeriods: [...LECTURER_BLOCKED_PERIODS] };
}

type PeriodSlots = { date: string; period: number; slots: DutySlot[] };

/**
 * 아직 비어 있는 부감독 슬롯을 교시별로 묶는다. 날짜는 이른 순, 같은 날 안에서는 **늦은 교시부터**다.
 * 하루 3교시 한도에 걸리면 먼저 처리한 늦은 교시가 채워지고 가장 이른 교시가 빠지므로,
 * 4교시가 모두 가능한 강사는 2~4교시를 맡게 된다. 같은 교시 안에서는 슬롯 순서를 유지한다.
 */
function openAssistantSlotsByPeriod(
  exam: Exam,
  assistantTypeId: string,
  takenSlotIds: Set<string>,
): PeriodSlots[] {
  const byKey = new Map<string, PeriodSlots>();
  for (const slot of exam.dutySlots) {
    if (slot.dutyTypeId !== assistantTypeId || takenSlotIds.has(slot.id)) continue;
    const key = `${slot.date}|${slot.period}`;
    const group = byKey.get(key) ?? { date: slot.date, period: slot.period, slots: [] };
    group.slots.push(slot);
    byKey.set(key, group);
  }
  return [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || b.period - a.period,
  );
}

/**
 * 강사 우선 배정 — 강사가 맡을 수 있는 모든 교시에 부감독을 먼저 배정한다.
 *
 * - **우선순위** — 강사 배정은 가장 낮다. `exam.assignments`(고정 등)와, 솔버가 먼저 깔아 두는
 *   STEP 9 우선/고정, 담임 첫날 1교시 자습, 영양교사 2교시 부감독을 모두 먼저 확정(`buildFixedAssignments`)한 뒤
 *   그 슬롯과 교사의 시간을 제외한 나머지에서만 강사를 배정한다. 따라서 강사가 이들을 밀어낼 수 없다.
 * - 배정 가능 여부는 자동 배정과 같은 `evaluateAll`로 판정한다(STEP 7 제외, 정규 수업, 시험 과목 담당,
 *   같은 교시 중복, 하루 최대 3교시). 강사는 부감독만 맡으므로 C4도 그대로 지켜진다.
 * - **1교시는 배정하지 않는다** (`LECTURER_BLOCKED_PERIODS`). 강사는 2교시 이후만 맡으며, 하루 최대 3교시와
 *   겹쳐도 4교시 시험일의 강사는 2~4교시가 된다. 교시가 더 많은 학교에서 한도에 걸리면 늦은 교시부터 채운다.
 * - 같은 교시에 강사가 빈 부감독 슬롯보다 많으면, 지금까지 배정받은 횟수(확정된 배정 포함)가 적은 강사부터 배정한다.
 *
 * 반환값은 새로 만든 강사 배정만이며 모두 `fixed: true`다. 솔버가 이를 건드리지 못하게 고정해서 넘기고,
 * 솔버가 끝난 뒤 호출 쪽에서 고정을 풀어 일반 배정으로 돌려놓는다.
 */
export function buildLecturerPriorityAssignments(exam: Exam): Assignment[] {
  const assistantTypeId = exam.dutyTypes.find((d) => d.name === "부감독")?.id;
  const lecturers = exam.teachers.filter(isLecturerRole);
  if (!assistantTypeId || lecturers.length === 0) return [];

  const lookups = buildExamLookups(exam);
  const assignments: Assignment[] = buildFixedAssignments(exam);
  const indexes = buildAssignmentIndexes(assignments, lookups, exam);
  const ctx: ConstraintContext = {
    exam: withLecturerPeriodRule(exam),
    assignments,
    lookups,
    indexes,
  };
  const takenSlotIds = new Set(assignments.map((a) => a.dutySlotId));

  const countByLecturer = new Map<string, number>(lecturers.map((t) => [t.id, 0]));
  for (const a of assignments) {
    if (countByLecturer.has(a.teacherId)) {
      countByLecturer.set(a.teacherId, (countByLecturer.get(a.teacherId) ?? 0) + 1);
    }
  }
  const created: Assignment[] = [];

  for (const group of openAssistantSlotsByPeriod(exam, assistantTypeId, takenSlotIds)) {
    const open = [...group.slots];
    // 정렬은 안정적이라 횟수가 같으면 명단 순서를 따른다.
    const order = [...lecturers].sort(
      (a, b) => (countByLecturer.get(a.id) ?? 0) - (countByLecturer.get(b.id) ?? 0),
    );
    for (const lecturer of order) {
      if (open.length === 0) break;
      const index = open.findIndex((slot) => evaluateAll(ctx, slot, lecturer).ok);
      if (index < 0) continue;
      const [slot] = open.splice(index, 1);
      const assignment: Assignment = {
        id: newId(),
        teacherId: lecturer.id,
        dutySlotId: slot.id,
        fixed: true,
      };
      assignments.push(assignment);
      applyAssignmentToIndexes(
        lecturer.id,
        slot.id,
        1,
        indexes.teacherPeriodSlot,
        indexes.healthTeacherByPeriod,
        indexes.teacherDaySlotIds,
        lookups,
        exam,
      );
      countByLecturer.set(lecturer.id, (countByLecturer.get(lecturer.id) ?? 0) + 1);
      created.push(assignment);
    }
  }

  return created;
}

/** 솔버 결과에서 강사 우선 배정의 고정을 풀어 일반 배정으로 돌려놓는다. STEP 12에서 그대로 수정할 수 있다. */
export function releaseLecturerPriorityFixes(
  assignments: Assignment[],
  lecturerAssignmentIds: ReadonlySet<string>,
): Assignment[] {
  return assignments.map((assignment) =>
    lecturerAssignmentIds.has(assignment.id)
      ? { ...assignment, fixed: false, fixedReason: undefined }
      : assignment,
  );
}
