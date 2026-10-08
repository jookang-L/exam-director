import assert from "node:assert/strict";
import type ExcelJS from "exceljs";
import { createEmptyExam, type Exam } from "../lib/types";
import { dayFileLabel, examDays, examThroughDate } from "../lib/io/dayExport";
import { buildTeacherGridWorkbook } from "../lib/io/teacherGridExcel";
import { buildSupervisionSheetWorkbook } from "../lib/io/supervisionSheetExcel";

// 감독누계(일별)·감독시간표(일별): 월 / 월+화 / 월+화+수 누계가 날짜마다 정확히 나오는지 확인한다.
const D1 = "2026-10-12"; // 월
const D2 = "2026-10-13"; // 화
const D3 = "2026-10-14"; // 수

const exam: Exam = createEmptyExam("일별시험");
exam.carryOverRatio = 0.5;
exam.gradeSchedule = [
  { grade: 1, startDate: D3, endDate: D3 }, // 1학년은 수요일부터 시험 → 월·화에는 정규 수업
  { grade: 2, startDate: D1, endDate: D3 },
  { grade: 3, startDate: D1, endDate: D3 },
];
const teacher = (id: string, previousFatigueScore = 0) => ({
  id,
  name: id,
  subject: "",
  roleType: "정교사" as const,
  previousFatigueScore,
});
exam.teachers = [teacher("A", 200), teacher("B"), teacher("C")];
const typeId = (name: string) => exam.dutyTypes.find((d) => d.name === name)!.id;

let n = 0;
const duty = (date: string, period: number, roomId: string, dutyName: string, teacherId: string) => {
  const id = `s${n++}`;
  exam.dutySlots.push({ id, date, period, roomId, dutyTypeId: typeId(dutyName) });
  exam.assignments.push({ id: `a${id}`, teacherId, dutySlotId: id, fixed: false });
};
duty(D1, 2, "r2-1", "정감독", "A"); // 월 정 100
duty(D2, 2, "r2-1", "부감독", "A"); // 화 부 100
duty(D2, 3, "r2-5", "복도감독", "A"); // 화 복도 30
duty(D3, 1, "r2-1", "자습감독", "A"); // 수 자습 30
duty(D3, 2, "r2-2", "정감독", "C"); // 수 정 100
// B는 감독 없이 1학년 정규 수업만 (월·화·수 각 1교시) — 1학년이 시험을 시작하는 수요일은 수업으로 세지 않는다
exam.timetable = [
  { id: "t1", teacherId: "B", weekday: "월", period: 1, grade: 1, className: "1" },
  { id: "t2", teacherId: "B", weekday: "화", period: 2, grade: 1, className: "1" },
  { id: "t3", teacherId: "B", weekday: "수", period: 1, grade: 1, className: "1" },
];
exam.examSlots = [
  { id: "e1", date: D1, period: 2, grade: 2, subject: "국어", classes: [1] },
  { id: "e2", date: D2, period: 2, grade: 2, subject: "수학", classes: [1] },
  { id: "e3", date: D3, period: 2, grade: 2, subject: "영어", classes: [2] },
];

// 엑셀에서 교사 한 줄의 요약 값 읽기 (머리글은 5행, 교사는 6행부터)
type Summary = Record<"이전" | "현" | "누적" | "정" | "부" | "복도" | "자습" | "수업", number>;
const summaryOf = (ws: ExcelJS.Worksheet, name: string): Summary => {
  const out: Partial<Summary> = {};
  let row = 0;
  for (let r = 6; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === name) row = r;
  assert.ok(row > 0, `${name} 행 없음`);
  for (let c = 3; c <= 10; c++) out[String(ws.getCell(5, c).value) as keyof Summary] = Number(ws.getCell(row, c).value);
  return out as Summary;
};
/** 날짜 머리글(2행) 개수 — 병합된 칸은 시작 칸만 센다 */
const dateColumnCount = (ws: ExcelJS.Worksheet) => {
  const masters = new Set<string>();
  for (let c = 11; c <= ws.columnCount; c++) {
    const cell = ws.getCell(2, c);
    if (/요일\)/.test(String(cell.value ?? ""))) masters.add(cell.master.address);
  }
  return masters.size;
};
const gridOf = (e: Exam) => buildTeacherGridWorkbook(e).getWorksheet("교사별감독표")!;

// 1) 시험일 목록·파일 이름
assert.deepEqual(examDays(exam), [D1, D2, D3]);
assert.equal(dayFileLabel(D2), "10.13(화)");

// 2) 월요일 = 월요일 것만
const mon = gridOf(examThroughDate(exam, D1));
assert.equal(dateColumnCount(mon), 1, "월요일 파일은 날짜 열 1개");
assert.deepEqual(summaryOf(mon, "A"), { 이전: 100, 현: 100, 누적: 200, 정: 1, 부: 0, 복도: 0, 자습: 0, 수업: 0 });
assert.deepEqual(summaryOf(mon, "B"), { 이전: 0, 현: 30, 누적: 30, 정: 0, 부: 0, 복도: 0, 자습: 0, 수업: 1 });
assert.equal(summaryOf(mon, "C").현, 0);

// 3) 화요일 = 월 + 화
const tue = gridOf(examThroughDate(exam, D2));
assert.equal(dateColumnCount(tue), 2, "화요일 파일은 날짜 열 2개");
assert.deepEqual(summaryOf(tue, "A"), { 이전: 100, 현: 230, 누적: 330, 정: 1, 부: 1, 복도: 1, 자습: 0, 수업: 0 });
assert.deepEqual(summaryOf(tue, "B"), { 이전: 0, 현: 60, 누적: 60, 정: 0, 부: 0, 복도: 0, 자습: 0, 수업: 2 });
assert.equal(summaryOf(tue, "C").현, 0, "수요일 감독은 아직 안 들어옴");

// 4) 수요일 = 월 + 화 + 수 (= 전체). 1학년이 시험을 시작한 수요일 수업은 세지 않는다
const wed = gridOf(examThroughDate(exam, D3));
assert.equal(dateColumnCount(wed), 3);
assert.deepEqual(summaryOf(wed, "A"), { 이전: 100, 현: 260, 누적: 360, 정: 1, 부: 1, 복도: 1, 자습: 1, 수업: 0 });
assert.deepEqual(summaryOf(wed, "B"), { 이전: 0, 현: 60, 누적: 60, 정: 0, 부: 0, 복도: 0, 자습: 0, 수업: 2 });
assert.deepEqual(summaryOf(wed, "C"), { 이전: 0, 현: 100, 누적: 100, 정: 1, 부: 0, 복도: 0, 자습: 0, 수업: 0 });
const full = gridOf(exam);
for (const name of ["A", "B", "C"]) {
  assert.deepEqual(summaryOf(wed, name), summaryOf(full, name), `마지막 날 누계 = 전체 감독누계 (${name})`);
}

// 5) 곤란도는 날짜마다 달라진다 (A: 100 → 230 → 260)
assert.deepEqual([summaryOf(mon, "A").현, summaryOf(tue, "A").현, summaryOf(wed, "A").현], [100, 230, 260]);

// 6) 원본 시험은 바뀌지 않고, 학년 시험 일정은 그날까지로 잘린다
const cut = examThroughDate(exam, D1);
assert.equal(exam.dutySlots.length, 5);
assert.equal(exam.assignments.length, 5);
assert.equal(cut.dutySlots.length, 1);
assert.equal(cut.assignments.length, 1);
assert.deepEqual(cut.gradeSchedule.find((g) => g.grade === 1), { grade: 1, startDate: "", endDate: "" });
assert.equal(cut.gradeSchedule.find((g) => g.grade === 2)!.endDate, D1);
assert.equal(examThroughDate(exam, D3).gradeSchedule.find((g) => g.grade === 2)!.endDate, D3);

// 7) 제목에 누계 범위 표시
const noted = buildTeacherGridWorkbook(examThroughDate(exam, D2), { titleNote: "10.12(월) ~ 10.13(화) 누계" });
assert.ok(String(noted.getWorksheet("교사별감독표")!.getCell(1, 1).value).includes("10.12(월) ~ 10.13(화) 누계"));
assert.ok(!String(full.getCell(1, 1).value).includes("누계"), "전체 파일 제목은 그대로");

// 8) 감독시간표(일별) — 날짜 하나만 담은 통합문서
const oneDay = buildSupervisionSheetWorkbook(exam, { dates: [D2] });
assert.deepEqual(oneDay.workbook.worksheets.map((w) => w.name), ["10.13"]);
assert.equal(buildSupervisionSheetWorkbook(exam).workbook.worksheets.length, 3, "전체는 시험일 수만큼 시트");

console.log("day-export regression: ok");
