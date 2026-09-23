import type { Exam } from "@/lib/types";
import { newId, createEmptyExam } from "@/lib/types";
import { createDefaultRooms } from "@/lib/defaultRooms";
import { syncDutyDemandsFromSchedule } from "@/lib/generateDutyDemands";
import { generateDutySlots } from "@/lib/algorithm/slots";

const SUBJECTS = ["국어", "수학", "영어", "통합과학", "통합사회", "한국사", "정보", "체육"];
const ROLES = ["정교사", "정교사", "정교사", "정교사", "기간제", "강사", "보건교사"] as const;

export function createSampleExam(): Exam {
  const exam = createEmptyExam("샘플 시험 (2026 1학기 중간)");

  // STEP 1: dates and periods
  exam.gradeSchedule = [
    { grade: 1, startDate: "2026-05-25", endDate: "2026-05-27" },
    { grade: 2, startDate: "2026-05-24", endDate: "2026-05-27" },
    { grade: 3, startDate: "2026-05-24", endDate: "2026-05-27" },
  ];
  exam.periodCount = 4;
  exam.periodTimes = [
    { period: 1, start: "09:00", end: "09:50" },
    { period: 2, start: "10:10", end: "11:00" },
    { period: 3, start: "11:20", end: "12:10" },
    { period: 4, start: "13:10", end: "14:00" },
  ];

  // STEP 4: teachers (60명) — 일반 고등학교 규모
  for (let i = 1; i <= 60; i++) {
    const subj = SUBJECTS[i % SUBJECTS.length];
    const role = ROLES[i % ROLES.length];
    // 첫 24명은 1-1, 2-1, 3-1, 1-2, 2-2, 3-2, ...  형태로 담임 부여
    const homeroomGrade = i <= 24 ? (((i - 1) % 3) + 1) as 1 | 2 | 3 : undefined;
    const homeroomClass = i <= 24 ? Math.floor((i - 1) / 3) + 1 : undefined;
    exam.teachers.push({
      id: `t${i}`,
      name: `교사${i.toString().padStart(2, "0")}`,
      subject: subj,
      roleType: role,
      homeroomGrade,
      homeroomClass,
      previousFatigueScore: (i % 5) * 100,
    });
  }

  // STEP 3: 기본 고사실 + 강당 자습실
  exam.rooms = [...createDefaultRooms(), { id: "rH", name: "강당 자습실" }];

  // STEP 2: examSlots — 각 학년 각 날짜에 1교과 시험
  const exam2 = [
    { date: "2026-05-24", period: 1, grade: 2 as const, subject: "국어" },
    { date: "2026-05-24", period: 2, grade: 2 as const, subject: "수학" },
    { date: "2026-05-24", period: 1, grade: 3 as const, subject: "영어" },
    { date: "2026-05-24", period: 2, grade: 3 as const, subject: "한국사" },
    { date: "2026-05-25", period: 1, grade: 1 as const, subject: "국어" },
    { date: "2026-05-25", period: 2, grade: 1 as const, subject: "수학" },
    { date: "2026-05-25", period: 1, grade: 2 as const, subject: "영어" },
    { date: "2026-05-25", period: 2, grade: 3 as const, subject: "수학" },
    { date: "2026-05-26", period: 1, grade: 1 as const, subject: "영어" },
    { date: "2026-05-26", period: 1, grade: 2 as const, subject: "정보" },
    { date: "2026-05-26", period: 1, grade: 3 as const, subject: "통합사회" },
    { date: "2026-05-27", period: 1, grade: 1 as const, subject: "체육", classes: [1, 2] },
    { date: "2026-05-27", period: 1, grade: 2 as const, subject: "통합과학" },
    { date: "2026-05-27", period: 1, grade: 3 as const, subject: "체육" },
  ];
  for (const e of exam2) {
    const classes = (e as any).classes ?? [1, 2, 3, 4, 5, 6, 7, 8];
    exam.examSlots.push({
      id: newId(),
      date: e.date,
      period: e.period,
      grade: e.grade,
      subject: e.subject,
      classes,
      isMinority: classes.length > 0 && classes.length < 6,
    });
  }

  // STEP 3: 시험표 기준 자동 수요 + 샘플용 강당 복도
  exam.dutyDemands = syncDutyDemandsFromSchedule(exam);
  const selfId = exam.dutyTypes.find((d) => d.name === "자습감독")!.id;
  const hallId = exam.dutyTypes.find((d) => d.name === "복도감독")!.id;
  const datePeriodKeys = new Set<string>();
  for (const es of exam.examSlots) {
    datePeriodKeys.add(`${es.date}|${es.period}`);
  }
  for (const key of datePeriodKeys) {
    const [date, periodStr] = key.split("|");
    const period = Number(periodStr);
    exam.dutyDemands.push(
      { id: newId(), date, period, roomId: "rH", dutyTypeId: selfId, count: 2 },
      { id: newId(), date, period, roomId: "rH", dutyTypeId: hallId, count: 1 },
    );
  }

  // STEP 8: generate slots
  exam.dutySlots = generateDutySlots(exam);

  return exam;
}
