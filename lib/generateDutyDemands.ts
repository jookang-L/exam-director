import { newId, type DutyDemand, type DutyDemandFillMode, type Exam, type Grade } from "@/lib/types";
import { classNumberToRoomId, classNumbersForRoomId, isSpecialClassNumber } from "@/lib/roomClassMap";
import { eachDate } from "@/lib/utils";

/** 자습감독 자동 배정 대상 일반 반 범위 (특별실 제외) */
export const PERIOD1_SELF_STUDY_CLASSES: Record<Grade, number> = {
  1: 13,
  2: 15,
  3: 13,
};

/** 복도감독 O — 복도감독을 두는 교실 */
export const HALL_DUTY_CLASSROOMS: Record<Grade, readonly number[]> = {
  1: [2, 5, 7, 11, 13],
  2: [2, 4, 6, 9, 11],
  3: [3, 6, 8, 10, 12],
};

const HALL_DUTY_CLASSROOM_SET: Record<Grade, ReadonlySet<number>> = {
  1: new Set(HALL_DUTY_CLASSROOMS[1]),
  2: new Set(HALL_DUTY_CLASSROOMS[2]),
  3: new Set(HALL_DUTY_CLASSROOMS[3]),
};

/** 4교시는 시험 고사실의 정·부감독만 자동으로 채운다. */
const EXAM_ROOM_ONLY_PERIOD = 4;

const AUTO_DUTY_NAMES = new Set(["정감독", "부감독", "자습감독"]);

export function dutyDemandFillModeOf(exam: Exam): DutyDemandFillMode {
  return exam.dutyDemandFillMode === "withHall" ? "withHall" : "noHall";
}

export function isHallDutyClassroom(grade: Grade, classNum: number): boolean {
  return HALL_DUTY_CLASSROOM_SET[grade].has(classNum);
}

export function roomIdForClass(grade: Grade, classNum: number): string {
  return classNumberToRoomId(grade, classNum);
}

export function demandKey(
  d: Pick<DutyDemand, "date" | "period" | "roomId" | "dutyTypeId">,
): string {
  return `${d.date}|${d.period}|${d.roomId}|${d.dutyTypeId}`;
}

function findDutyTypeId(exam: Exam, name: string): string | null {
  return exam.dutyTypes.find((d) => d.name === name)?.id ?? null;
}

function parseClassRoomId(roomId: string): { grade: Grade; classNum: number } | null {
  const parsed = classNumbersForRoomId(roomId);
  if (!parsed || parsed.classNums.length !== 1) return null;
  return { grade: parsed.grade, classNum: parsed.classNums[0] };
}

function examAtKey(date: string, period: number, grade: Grade, classNum: number): string {
  return `${date}|${period}|${grade}|${classNum}`;
}

function isDateInGradeSchedule(exam: Exam, grade: Grade, date: string): boolean {
  const gs = exam.gradeSchedule.find((g) => g.grade === grade);
  if (!gs?.startDate || !gs?.endDate) return false;
  return date >= gs.startDate && date <= gs.endDate;
}

function gradeHasExamOnDate(exam: Exam, grade: Grade, date: string): boolean {
  return exam.examSlots.some((s) => s.grade === grade && s.date === date);
}

function examClassNumbersAt(exam: Exam, date: string, period: number, grade: Grade): number[] {
  const classes = new Set<number>();
  for (const slot of exam.examSlots) {
    if (slot.date !== date || slot.period !== period || slot.grade !== grade) continue;
    for (const cls of slot.classes) classes.add(cls);
  }
  return [...classes];
}

function hasExamAt(
  exam: Exam,
  date: string,
  period: number,
  grade: Grade,
  classNum: number,
): boolean {
  return exam.examSlots.some(
    (s) =>
      s.date === date &&
      s.period === period &&
      s.grade === grade &&
      s.classes.includes(classNum),
  );
}

function hasExamAtRoom(exam: Exam, date: string, period: number, roomId: string): boolean {
  const parsed = classNumbersForRoomId(roomId);
  if (!parsed) return false;
  return exam.examSlots.some(
    (s) =>
      s.date === date &&
      s.period === period &&
      s.grade === parsed.grade &&
      s.classes.some((c) => parsed.classNums.includes(c)),
  );
}

function isInSelfStudyClassRange(grade: Grade, classNum: number): boolean {
  return classNum >= 1 && classNum <= PERIOD1_SELF_STUDY_CLASSES[grade];
}

function gradeScheduleDates(exam: Exam, grade: Grade): string[] {
  const gs = exam.gradeSchedule.find((g) => g.grade === grade);
  if (!gs?.startDate || !gs?.endDate) return [];
  return eachDate(gs.startDate, gs.endDate);
}

/**
 * 복도감독 O에서 해당 학년·날짜·교시에 복도감독을 둘지.
 * 1·4교시는 제외. 1학년은 시험 기간의 3교시 전체.
 * 2·3학년은 그 교시 시험이 특별실에만 있을 때(2·3교시).
 */
export function needsHallDuty(exam: Exam, grade: Grade, date: string, period: number): boolean {
  if (dutyDemandFillModeOf(exam) !== "withHall") return false;
  if (period === 1 || period === EXAM_ROOM_ONLY_PERIOD) return false;
  if (period !== 2 && period !== 3) return false;

  if (grade === 1) {
    return period === 3 && isDateInGradeSchedule(exam, grade, date);
  }

  const classes = examClassNumbersAt(exam, date, period, grade);
  if (classes.length === 0) return false;
  return classes.every((cls) => isSpecialClassNumber(grade, cls));
}

/** 시험표·시험 기간 기준 감독 수요 자동 생성 */
export function generateAutoDutyDemands(exam: Exam): DutyDemand[] {
  const chiefId = findDutyTypeId(exam, "정감독");
  const assistantId = findDutyTypeId(exam, "부감독");
  const selfStudyId = findDutyTypeId(exam, "자습감독");
  const hallId = findDutyTypeId(exam, "복도감독");
  if (!chiefId || !assistantId || !selfStudyId) return [];

  const withHall = dutyDemandFillModeOf(exam) === "withHall";
  const byKey = new Map<string, DutyDemand>();
  const examAt = new Set<string>();
  const examDaysByGrade = new Map<Grade, Set<string>>();

  const put = (date: string, period: number, roomId: string, dutyTypeId: string, count: number) => {
    if (count <= 0) return;
    const key = demandKey({ date, period, roomId, dutyTypeId });
    byKey.set(key, { id: newId(), date, period, roomId, dutyTypeId, count });
  };

  const putSelfStudy = (date: string, period: number, grade: Grade, classNum: number) => {
    if (withHall && needsHallDuty(exam, grade, date, period)) return;
    put(date, period, roomIdForClass(grade, classNum), selfStudyId, 1);
  };

  for (const slot of exam.examSlots) {
    for (const cls of slot.classes) {
      examAt.add(examAtKey(slot.date, slot.period, slot.grade, cls));
      const period1Regular =
        withHall && slot.period === 1 && !isSpecialClassNumber(slot.grade, cls);
      if (period1Regular) continue;
      const roomId = roomIdForClass(slot.grade, cls);
      put(slot.date, slot.period, roomId, chiefId, 1);
      put(slot.date, slot.period, roomId, assistantId, 1);
    }
    let days = examDaysByGrade.get(slot.grade);
    if (!days) {
      days = new Set();
      examDaysByGrade.set(slot.grade, days);
    }
    days.add(slot.date);
  }

  // 1교시: 시험 기간 매일. 복도감독 O는 일반 반 자습 1명만 (시험 반이어도 정·부 없음).
  for (const gs of exam.gradeSchedule) {
    if (!gs.startDate || !gs.endDate) continue;
    const maxClass = PERIOD1_SELF_STUDY_CLASSES[gs.grade];
    for (const date of eachDate(gs.startDate, gs.endDate)) {
      for (let cls = 1; cls <= maxClass; cls++) {
        if (!withHall && examAt.has(examAtKey(date, 1, gs.grade, cls))) continue;
        putSelfStudy(date, 1, gs.grade, cls);
      }
    }
  }

  // 시험 있는 날: 시험 없는 교시·반 → 자습감독. 4교시·1교시, 복도를 넣는 교시는 제외.
  for (const [grade, dates] of examDaysByGrade) {
    const maxClass = PERIOD1_SELF_STUDY_CLASSES[grade];
    for (const date of dates) {
      for (let period = 2; period <= exam.periodCount; period++) {
        if (period === EXAM_ROOM_ONLY_PERIOD) continue;
        for (let cls = 1; cls <= maxClass; cls++) {
          if (examAt.has(examAtKey(date, period, grade, cls))) continue;
          putSelfStudy(date, period, grade, cls);
        }
      }
    }
  }

  if (withHall && hallId) {
    const grades: Grade[] = [1, 2, 3];
    for (const grade of grades) {
      const dates =
        grade === 1 ? gradeScheduleDates(exam, grade) : [...(examDaysByGrade.get(grade) ?? [])];
      for (const date of dates) {
        for (let period = 2; period <= exam.periodCount; period++) {
          if (!needsHallDuty(exam, grade, date, period)) continue;
          for (const cls of HALL_DUTY_CLASSROOMS[grade]) {
            put(date, period, roomIdForClass(grade, cls), hallId, 1);
          }
        }
      }
    }
  }

  return Array.from(byKey.values());
}

function isAutoSelfStudyDemand(
  exam: Exam,
  d: DutyDemand,
  parsed: { grade: Grade; classNum: number },
): boolean {
  if (d.period === EXAM_ROOM_ONLY_PERIOD) return false;
  if (!isInSelfStudyClassRange(parsed.grade, parsed.classNum)) return false;
  if (needsHallDuty(exam, parsed.grade, d.date, d.period)) return false;
  if (
    dutyDemandFillModeOf(exam) === "withHall" &&
    d.period === 1 &&
    isDateInGradeSchedule(exam, parsed.grade, d.date)
  ) {
    return true;
  }
  if (hasExamAt(exam, d.date, d.period, parsed.grade, parsed.classNum)) return false;

  if (d.period === 1 && isDateInGradeSchedule(exam, parsed.grade, d.date)) return true;
  if (d.period !== 1 && gradeHasExamOnDate(exam, parsed.grade, d.date)) return true;

  return false;
}

export function isAutoManagedDemand(exam: Exam, d: DutyDemand): boolean {
  const dt = exam.dutyTypes.find((t) => t.id === d.dutyTypeId);
  if (!dt) return false;

  const parsed = parseClassRoomId(d.roomId);
  if (!parsed) return false;

  if (dt.name === "복도감독") {
    return isHallDutyClassroom(parsed.grade, parsed.classNum) && needsHallDuty(exam, parsed.grade, d.date, d.period);
  }

  if (!AUTO_DUTY_NAMES.has(dt.name)) return false;

  if (dt.name === "자습감독") {
    return isAutoSelfStudyDemand(exam, d, parsed);
  }

  if (
    dutyDemandFillModeOf(exam) === "withHall" &&
    d.period === 1 &&
    !isSpecialClassNumber(parsed.grade, parsed.classNum)
  ) {
    return false;
  }

  return hasExamAtRoom(exam, d.date, d.period, d.roomId);
}

function isFormulaHallDemand(exam: Exam, d: DutyDemand): boolean {
  const dt = exam.dutyTypes.find((t) => t.id === d.dutyTypeId);
  if (dt?.name !== "복도감독") return false;
  const parsed = parseClassRoomId(d.roomId);
  if (!parsed) return false;
  return isHallDutyClassroom(parsed.grade, parsed.classNum);
}

function isClassroomAutoDutyType(exam: Exam, d: DutyDemand): boolean {
  if (isFormulaHallDemand(exam, d)) return true;
  const dt = exam.dutyTypes.find((t) => t.id === d.dutyTypeId);
  if (!dt || !AUTO_DUTY_NAMES.has(dt.name)) return false;
  return parseClassRoomId(d.roomId) !== null;
}

/** 자동 생성분은 갱신하고, 복도·특별실 등 수동 입력은 유지 */
export function syncDutyDemandsFromSchedule(exam: Exam): DutyDemand[] {
  const auto = generateAutoDutyDemands(exam);
  const existingByKey = new Map(exam.dutyDemands.map((d) => [demandKey(d), d]));
  const mergedAuto = auto.map((a) => {
    const prev = existingByKey.get(demandKey(a));
    return prev ? { ...a, id: prev.id } : a;
  });
  const autoKeys = new Set(mergedAuto.map(demandKey));
  const manual = exam.dutyDemands.filter((d) => {
    if (autoKeys.has(demandKey(d))) return false;
    // 일반·특별실 매핑 교실의 정·부·자습, 지정 교실의 복도감독은 자동 관리
    if (isClassroomAutoDutyType(exam, d)) return false;
    return true;
  });
  return [...mergedAuto, ...manual];
}
