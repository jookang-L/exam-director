import { newId, type DutyDemand, type Exam, type Grade } from "@/lib/types";
import { classNumberToRoomId, classNumbersForRoomId } from "@/lib/roomClassMap";
import { eachDate } from "@/lib/utils";

/** 자습감독 자동 배정 대상 일반 반 범위 (특별실 제외) */
export const PERIOD1_SELF_STUDY_CLASSES: Record<Grade, number> = {
  1: 13,
  2: 15,
  3: 13,
};

const AUTO_DUTY_NAMES = new Set(["정감독", "부감독", "자습감독"]);

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

/** 시험표·시험 기간 기준 감독 수요 자동 생성 */
export function generateAutoDutyDemands(exam: Exam): DutyDemand[] {
  const chiefId = findDutyTypeId(exam, "정감독");
  const assistantId = findDutyTypeId(exam, "부감독");
  const selfStudyId = findDutyTypeId(exam, "자습감독");
  if (!chiefId || !assistantId || !selfStudyId) return [];

  const byKey = new Map<string, DutyDemand>();
  const examAt = new Set<string>();
  const examDaysByGrade = new Map<Grade, Set<string>>();

  const put = (date: string, period: number, roomId: string, dutyTypeId: string, count: number) => {
    if (count <= 0) return;
    const key = demandKey({ date, period, roomId, dutyTypeId });
    byKey.set(key, { id: newId(), date, period, roomId, dutyTypeId, count });
  };

  const putSelfStudy = (date: string, period: number, grade: Grade, classNum: number) => {
    put(date, period, roomIdForClass(grade, classNum), selfStudyId, 1);
  };

  for (const slot of exam.examSlots) {
    for (const cls of slot.classes) {
      examAt.add(examAtKey(slot.date, slot.period, slot.grade, cls));
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

  // 1교시: 시험 기간 매일 (시험 보는 반 제외)
  for (const gs of exam.gradeSchedule) {
    if (!gs.startDate || !gs.endDate) continue;
    const maxClass = PERIOD1_SELF_STUDY_CLASSES[gs.grade];
    for (const date of eachDate(gs.startDate, gs.endDate)) {
      for (let cls = 1; cls <= maxClass; cls++) {
        if (examAt.has(examAtKey(date, 1, gs.grade, cls))) continue;
        putSelfStudy(date, 1, gs.grade, cls);
      }
    }
  }

  // 시험 있는 날: 시험 없는 교시·반 → 자습감독 (부분 시험 반 포함)
  for (const [grade, dates] of examDaysByGrade) {
    const maxClass = PERIOD1_SELF_STUDY_CLASSES[grade];
    for (const date of dates) {
      for (let period = 1; period <= exam.periodCount; period++) {
        for (let cls = 1; cls <= maxClass; cls++) {
          if (examAt.has(examAtKey(date, period, grade, cls))) continue;
          putSelfStudy(date, period, grade, cls);
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
  if (!isInSelfStudyClassRange(parsed.grade, parsed.classNum)) return false;
  if (hasExamAt(exam, d.date, d.period, parsed.grade, parsed.classNum)) return false;

  if (d.period === 1 && isDateInGradeSchedule(exam, parsed.grade, d.date)) return true;
  if (gradeHasExamOnDate(exam, parsed.grade, d.date)) return true;

  return false;
}

export function isAutoManagedDemand(exam: Exam, d: DutyDemand): boolean {
  const dt = exam.dutyTypes.find((t) => t.id === d.dutyTypeId);
  if (!dt || !AUTO_DUTY_NAMES.has(dt.name)) return false;

  const parsed = parseClassRoomId(d.roomId);
  if (!parsed) return false;

  if (dt.name === "자습감독") {
    return isAutoSelfStudyDemand(exam, d, parsed);
  }

  return hasExamAtRoom(exam, d.date, d.period, d.roomId);
}

function isClassroomAutoDutyType(exam: Exam, d: DutyDemand): boolean {
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
    // 일반·특별실 매핑 교실의 정·부·자습은 전부 자동 관리 — 시험표 변경 시 남은 찌꺼기 제거
    if (isClassroomAutoDutyType(exam, d)) return false;
    return true;
  });
  return [...mergedAuto, ...manual];
}
