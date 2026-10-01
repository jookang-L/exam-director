import type {
  Assignment,
  DutySlot,
  DutyType,
  Exam,
  Exclude as ExcludeT,
  Teacher,
  TeacherTimetable,
} from "@/lib/types";
import { teacherBlockedByExamSubject } from "./examSubjectRules";
import { isNutritionTeacher, nutritionTeacherDates } from "./nutritionTeachers";
import { classNumbersForRoomId } from "@/lib/roomClassMap";
import { weekdayKo } from "@/lib/utils";
import type { AssignmentIndexes, ExamLookups } from "./constraintIndexes";
import { periodKey } from "./constraintIndexes";

export type ConstraintContext = {
  exam: Exam;
  assignments: Assignment[];
  lookups?: ExamLookups;
  indexes?: AssignmentIndexes;
};

export type ConstraintReason = {
  code: string;
  message: string;
};

export type ConstraintCheck = { ok: true } | { ok: false; reason: ConstraintReason };

const OK: ConstraintCheck = { ok: true };

/** C7 — 하루 최대 감독 교시 수 (1교시 = 슬롯 1개) */
export const MAX_DUTY_SLOTS_PER_DAY = 3;

type TeacherDaySlotEntry = { slot: DutySlot; dt: DutyType | undefined };

function collectTeacherDaySlots(
  ctx: ConstraintContext,
  teacher: Teacher,
  date: string,
  candidateSlot?: DutySlot,
  ownAlreadyOnSlot = false,
): TeacherDaySlotEntry[] {
  const entries: TeacherDaySlotEntry[] = [];

  if (ctx.indexes && candidateSlot) {
    const daySlotIds = ctx.indexes.teacherDaySlotIds.get(teacher.id)?.get(date) ?? [];
    const slotIds = ownAlreadyOnSlot ? daySlotIds : [...daySlotIds, candidateSlot.id];
    for (const id of slotIds) {
      const s = ctx.lookups?.slotById.get(id);
      if (!s) continue;
      entries.push({ slot: s, dt: dutyTypeFromCtx(ctx, s.dutyTypeId) });
    }
    return entries;
  }

  for (const a of ctx.assignments) {
    if (a.teacherId !== teacher.id) continue;
    const s = slotFromCtx(ctx, a.dutySlotId);
    if (!s || s.date !== date) continue;
    entries.push({ slot: s, dt: dutyTypeFromCtx(ctx, s.dutyTypeId) });
  }
  if (candidateSlot && !ownAlreadyOnSlot) {
    entries.push({ slot: candidateSlot, dt: dutyTypeFromCtx(ctx, candidateSlot.dutyTypeId) });
  }
  return entries;
}

function hasMiddleSelfStudy(entries: TeacherDaySlotEntry[]): boolean {
  if (entries.length !== MAX_DUTY_SLOTS_PER_DAY) return true;
  const sorted = [...entries].sort((a, b) => a.slot.period - b.slot.period);
  const minPeriod = sorted[0]!.slot.period;
  const maxPeriod = sorted[sorted.length - 1]!.slot.period;
  return sorted.some(
    (x) => isSelfStudy(x.dt) && x.slot.period > minPeriod && x.slot.period < maxPeriod,
  );
}

function isHealthTeacher(t: Teacher): boolean {
  return t.roleType === "보건교사";
}
function isLecturer(t: Teacher): boolean {
  return t.roleType === "강사";
}

/** 자동 배정 대상에서 제외. 수동 배정은 evaluateAll로 막지 않는다. */
export function isEvaluationOfficer(t: Teacher): boolean {
  return t.roleType === "평가담당";
}

function findDutyType(exam: Exam, id: string): DutyType | undefined {
  return exam.dutyTypes.find((d) => d.id === id);
}

function dutyTypeFromCtx(ctx: ConstraintContext, dutyTypeId: string): DutyType | undefined {
  return ctx.lookups?.dutyTypeById.get(dutyTypeId) ?? findDutyType(ctx.exam, dutyTypeId);
}

function slotFromCtx(ctx: ConstraintContext, dutySlotId: string): DutySlot | undefined {
  return ctx.lookups?.slotById.get(dutySlotId) ?? ctx.exam.dutySlots.find((s) => s.id === dutySlotId);
}

function isSelfStudy(dt: DutyType | undefined): boolean {
  return dt?.name === "자습감독";
}

function isAssistant(dt: DutyType | undefined): boolean {
  return dt?.name === "부감독";
}

function hasStep9Override(exam: Exam, teacherId: string, dutySlotId: string): boolean {
  return exam.preassigns.some((p) => p.teacherId === teacherId && p.dutySlotId === dutySlotId);
}

// Whether grade has started exams by the given date (i.e. is in exam mode).
export function gradeInExam(exam: Exam, grade: number, date: string): boolean {
  const gs = exam.gradeSchedule.find((g) => g.grade === grade);
  if (!gs?.startDate) return false;
  return date >= gs.startDate && (!gs.endDate || date <= gs.endDate);
}

// Helper: does this teacher have a scheduled class in this period on this date?
// Only counts as a conflict if the class's grade has NOT started exams yet.
export function timetableConflict(
  exam: Exam,
  teacher: Teacher,
  date: string,
  period: number,
): TeacherTimetable | null {
  const wd = weekdayKo(date) as TeacherTimetable["weekday"];
  for (const row of exam.timetable) {
    if (row.teacherId !== teacher.id) continue;
    if (row.weekday !== wd) continue;
    if (row.period !== period) continue;
    // If we know which grade this class belongs to, only conflict if that grade is NOT in exam.
    if (row.grade && gradeInExam(exam, row.grade, date)) {
      continue;
    }
    return row;
  }
  return null;
}

/** STEP 7 허용 조건 행인지 (허용 감독 종류가 지정됨). 아니면 전체 제외 행. */
export function isDutyAllowRule(e: ExcludeT): boolean {
  return (e.allowedDutyTypeIds?.length ?? 0) > 0;
}

/** 전체 제외 행만 해당. 허용 조건 행은 teacherAllowedDutyTypesAt에서 처리한다. */
export function teacherExcludedAt(
  exam: Exam,
  teacher: Teacher,
  date: string,
  period: number,
  roomId?: string,
): ExcludeT | null {
  for (const e of exam.excludes) {
    if (isDutyAllowRule(e)) continue;
    if (e.teacherId !== teacher.id) continue;
    if (e.date && e.date !== date) continue;
    if (e.period != null && Number(e.period) !== period) continue;
    if (e.roomId && roomId && e.roomId !== roomId) continue;
    return e;
  }
  return null;
}

/**
 * 해당 시간대에 적용되는 허용 조건들의 교집합(허용 감독 종류 id).
 * 적용되는 허용 조건이 없으면 null (제한 없음).
 */
export function teacherAllowedDutyTypesAt(
  exam: Exam,
  teacher: Teacher,
  date: string,
  period: number,
  roomId?: string,
): Set<string> | null {
  let allowed = null as Set<string> | null;
  for (const e of exam.excludes) {
    if (!isDutyAllowRule(e)) continue;
    if (e.teacherId !== teacher.id) continue;
    if (e.date && e.date !== date) continue;
    if (e.period != null && Number(e.period) !== period) continue;
    if (e.roomId && roomId && e.roomId !== roomId) continue;
    const ids = new Set(e.allowedDutyTypeIds);
    allowed = allowed ? new Set([...allowed].filter((id) => ids.has(id))) : ids;
  }
  return allowed;
}

// C1: 보건교사는 같은 교시에 최대 1명만 감독 가능.
export function checkHealthTeacherUnique(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (!isHealthTeacher(teacher)) return OK;
  const pk = periodKey(slot.date, slot.period);
  const indexed = ctx.indexes?.healthTeacherByPeriod.get(pk);
  if (indexed && indexed !== teacher.id) {
    return {
      ok: false,
      reason: { code: "C1", message: "보건교사는 같은 교시에 1명만 감독 가능합니다" },
    };
  }
  if (ctx.indexes) return OK;

  const sameSlotKey = (s: DutySlot) => `${s.date}|${s.period}`;
  const targetKey = sameSlotKey(slot);
  for (const a of ctx.assignments) {
    if (a.dutySlotId === slot.id) continue;
    if (a.teacherId !== teacher.id) {
      const otherT = ctx.exam.teachers.find((t) => t.id === a.teacherId);
      const otherSlot = slotFromCtx(ctx, a.dutySlotId);
      if (!otherT || !otherSlot) continue;
      if (sameSlotKey(otherSlot) === targetKey && isHealthTeacher(otherT)) {
        return {
          ok: false,
          reason: { code: "C1", message: "보건교사는 같은 교시에 1명만 감독 가능합니다" },
        };
      }
    }
  }
  return OK;
}

// C4: 강사는 부감독만 가능.
export function checkLecturerAssistantOnly(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (!isLecturer(teacher)) return OK;
  const dt = dutyTypeFromCtx(ctx, slot.dutyTypeId);
  if (isAssistant(dt)) return OK;
  const dutyName = dt?.name ?? "감독";
  return {
    ok: false,
    reason: { code: "C4", message: `강사는 부감독만 맡을 수 있습니다 (${dutyName} 불가)` },
  };
}

// C8: 시험 과목 담당 교사는 시험 반 수와 무관하게 해당 교시 모든 감독 불가.
// STEP 9 우선/고정 배정은 이 과목교사 금지보다 우선한다.
export function checkSubjectTeacherExamSubject(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (hasStep9Override(ctx.exam, teacher.id, slot.id)) return OK;

  const blocked = teacherBlockedByExamSubject(
    ctx.exam,
    teacher.subject,
    slot.date,
    slot.period,
  );
  if (blocked) {
    return {
      ok: false,
      reason: {
        code: "C8",
        message: `${blocked} 시험 과목 담당 교사는 해당 교시 감독 불가 (STEP 9 우선/고정 예외)`,
      },
    };
  }
  return OK;
}

// C5: Timetable conflict — teacher has a normal class in same period.
export function checkTimetableConflict(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  const conf = timetableConflict(ctx.exam, teacher, slot.date, slot.period);
  if (conf) {
    const cls = conf.grade && conf.className ? ` (${conf.grade}-${conf.className} ${conf.subject ?? ""})` : "";
    return {
      ok: false,
      reason: { code: "C5", message: `해당 교시 정상 수업이 있습니다${cls}` },
    };
  }
  return OK;
}

// Exclude (STEP 7): manual exclusion and duty-type allow rules.
export function checkExcluded(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  const ex = teacherExcludedAt(ctx.exam, teacher, slot.date, slot.period, slot.roomId);
  if (ex) {
    return {
      ok: false,
      reason: { code: "EX", message: ex.reason ? `제외 (${ex.reason})` : "수동 제외 대상" },
    };
  }
  const allowed = teacherAllowedDutyTypesAt(ctx.exam, teacher, slot.date, slot.period, slot.roomId);
  if (allowed && !allowed.has(slot.dutyTypeId)) {
    const names = ctx.exam.dutyTypes.filter((d) => allowed.has(d.id)).map((d) => d.name);
    const dutyName = ctx.exam.dutyTypes.find((d) => d.id === slot.dutyTypeId)?.name ?? "해당 감독";
    return {
      ok: false,
      reason: {
        code: "EX",
        message:
          names.length > 0
            ? `이 시간대는 ${names.join("·")}만 가능합니다 (${dutyName} 불가)`
            : `이 시간대는 허용 조건이 겹쳐 배정 가능한 감독 종류가 없습니다 (${dutyName} 불가)`,
      },
    };
  }
  return OK;
}

// Concurrency: a teacher can be assigned to only one slot per (date, period).
export function checkConcurrency(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  const pk = periodKey(slot.date, slot.period);
  const existing = ctx.indexes?.teacherPeriodSlot.get(teacher.id)?.get(pk);
  if (existing && existing !== slot.id) {
    return {
      ok: false,
      reason: { code: "CC", message: "같은 교시 다른 고사실에 이미 배정됨" },
    };
  }
  if (ctx.indexes) return OK;

  for (const a of ctx.assignments) {
    if (a.dutySlotId === slot.id) continue;
    if (a.teacherId !== teacher.id) continue;
    const s = slotFromCtx(ctx, a.dutySlotId);
    if (!s) continue;
    if (s.date === slot.date && s.period === slot.period) {
      return {
        ok: false,
        reason: { code: "CC", message: "같은 교시 다른 고사실에 이미 배정됨" },
      };
    }
  }
  return OK;
}

// C7a: 하루 최대 3교시 (강사·영양 포함, 영양은 C9로 이미 1회/일)
export function checkC7DailyLimit(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  const ownAlreadyOnSlot = ctx.assignments.some(
    (a) => a.teacherId === teacher.id && a.dutySlotId === slot.id,
  );
  const entries = collectTeacherDaySlots(ctx, teacher, slot.date, slot, ownAlreadyOnSlot);
  if (entries.length > MAX_DUTY_SLOTS_PER_DAY) {
    return {
      ok: false,
      reason: {
        code: "C7",
        message: `하루 최대 ${MAX_DUTY_SLOTS_PER_DAY}교시까지만 감독 배정 가능합니다`,
      },
    };
  }
  return OK;
}

// C7b: 3교시인 경우 가운데 교시에 자습감독 1개 (강사 제외 — 부감독만)
export function checkC7Buffer(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (isLecturer(teacher)) return OK;

  const ownAlreadyOnSlot = ctx.assignments.some(
    (a) => a.teacherId === teacher.id && a.dutySlotId === slot.id,
  );
  const entries = collectTeacherDaySlots(ctx, teacher, slot.date, slot, ownAlreadyOnSlot);
  if (entries.length < MAX_DUTY_SLOTS_PER_DAY) return OK;

  if (hasMiddleSelfStudy(entries)) return OK;

  return {
    ok: false,
    reason: {
      code: "C7b",
      message: `하루 ${MAX_DUTY_SLOTS_PER_DAY}교시 배정 시 가운데 교시에 자습감독이 필요합니다`,
    },
  };
}

function isTeachersHomeroomRoom(teacher: Teacher, roomId: string): boolean {
  if (!teacher.homeroomGrade || !teacher.homeroomClass) return false;
  const parsed = classNumbersForRoomId(roomId);
  if (!parsed) return false;
  return (
    parsed.grade === teacher.homeroomGrade &&
    parsed.classNums.includes(teacher.homeroomClass)
  );
}

/** 학년별 시험 시작일 (STEP 1 gradeSchedule.startDate) */
function gradeFirstExamDate(exam: Exam, grade: number): string | undefined {
  return exam.gradeSchedule.find((g) => g.grade === grade)?.startDate;
}

/** C2 예외: 해당 학년 시험 첫날 1교시 본인 반 자습감독 */
function isHomeroomSelfStudyFirstDay(
  exam: Exam,
  teacher: Teacher,
  slot: DutySlot,
  dt: DutyType | undefined,
): boolean {
  if (!teacher.homeroomGrade || !teacher.homeroomClass) return false;
  if (slot.period !== 1 || !isSelfStudy(dt)) return false;
  const firstDate = gradeFirstExamDate(exam, teacher.homeroomGrade);
  return firstDate != null && slot.date === firstDate;
}

// C10: 담임교사 — 본인 반 고사실 배정 금지 (C2 예외).
export function checkHomeroomOwnClass(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (!isTeachersHomeroomRoom(teacher, slot.roomId)) return OK;

  const dt = findDutyType(ctx.exam, slot.dutyTypeId);
  if (isHomeroomSelfStudyFirstDay(ctx.exam, teacher, slot, dt)) return OK;

  return {
    ok: false,
    reason: {
      code: "C10",
      message:
        "담임교사는 본인 반 고사실에 배정할 수 없습니다 (해당 학년 시험 첫날 1교시 자습 제외)",
    },
  };
}

// C9: 영양교사는 지정된 2일, 2교시 부감독만 (교사당 1회/일, 전체 2일).
export function checkNutritionTeacherRules(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): ConstraintCheck {
  if (!isNutritionTeacher(teacher)) return OK;

  const dt = findDutyType(ctx.exam, slot.dutyTypeId);
  if (!isAssistant(dt)) {
    const dutyName = dt?.name ?? "감독";
    return {
      ok: false,
      reason: { code: "C9", message: `영양교사는 부감독만 맡을 수 있습니다 (${dutyName} 불가)` },
    };
  }
  if (slot.period !== 2) {
    return {
      ok: false,
      reason: { code: "C9", message: "영양교사는 2교시 부감독만 가능합니다" },
    };
  }

  const allowedDates = nutritionTeacherDates(ctx.exam, teacher.id);
  if (allowedDates.length === 0) {
    return {
      ok: false,
      reason: { code: "C9", message: "영양교사 배정일을 잡을 수 있는 시험 일정이 없습니다" },
    };
  }
  if (!allowedDates.includes(slot.date)) {
    return {
      ok: false,
      reason: {
        code: "C9",
        message: `영양교사는 지정된 날짜(${allowedDates.join(", ")}) 2교시 부감독만 가능합니다`,
      },
    };
  }

  const ownAlreadyOnSlot = ctx.assignments.some(
    (a) => a.teacherId === teacher.id && a.dutySlotId === slot.id,
  );
  let dayCount = 0;
  let totalCount = 0;
  const seenDates = new Set<string>();
  for (const a of ctx.assignments) {
    if (a.teacherId !== teacher.id) continue;
    if (a.dutySlotId === slot.id) continue;
    const s = ctx.exam.dutySlots.find((d) => d.id === a.dutySlotId);
    if (!s) continue;
    totalCount++;
    if (s.date === slot.date) dayCount++;
    seenDates.add(s.date);
  }
  if (!ownAlreadyOnSlot) {
    totalCount++;
    if (seenDates.has(slot.date)) dayCount++;
  }
  if (dayCount > 0) {
    return {
      ok: false,
      reason: { code: "C9", message: "영양교사는 같은 날 1회만 감독 가능합니다" },
    };
  }
  if (totalCount > 2) {
    return {
      ok: false,
      reason: { code: "C9", message: "영양교사는 전체 일정에서 2일(2교시 부감독)만 가능합니다" },
    };
  }

  return OK;
}

export const ALL_CHECKS: Array<(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
) => ConstraintCheck> = [
  checkConcurrency,
  checkSubjectTeacherExamSubject,
  checkTimetableConflict,
  checkExcluded,
  checkHomeroomOwnClass,
  checkHealthTeacherUnique,
  checkLecturerAssistantOnly,
  checkNutritionTeacherRules,
  checkC7DailyLimit,
  checkC7Buffer,
];

export function evaluateAll(
  ctx: ConstraintContext,
  slot: DutySlot,
  teacher: Teacher,
): { ok: boolean; reasons: ConstraintReason[] } {
  const reasons: ConstraintReason[] = [];
  for (const fn of ALL_CHECKS) {
    const r = fn(ctx, slot, teacher);
    if (!r.ok) reasons.push(r.reason);
  }
  return { ok: reasons.length === 0, reasons };
}
