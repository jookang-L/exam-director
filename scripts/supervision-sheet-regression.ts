import assert from "node:assert/strict";
import { createEmptyExam, type Exam } from "../lib/types";
import { buildSupervisionSheetWorkbook } from "../lib/io/supervisionSheetExcel";

// 작은 가상 시험으로 「감독표 양식」 엑셀의 서식 규칙을 확인한다.
const DATE = "2026-10-12"; // 월요일
const exam: Exam = createEmptyExam("회귀시험");
exam.gradeSchedule = [
  { grade: 1, startDate: "2026-10-14", endDate: "2026-10-16" }, // 10.12는 1학년 수업일
  { grade: 2, startDate: "2026-10-12", endDate: "2026-10-16" },
  { grade: 3, startDate: "2026-10-12", endDate: "2026-10-16" },
];
exam.periodTimes = [
  { period: 1, start: "08:40", end: "09:30" },
  { period: 2, start: "09:45", end: "10:35" },
  { period: 3, start: "10:50", end: "11:40" },
  { period: 4, start: "11:55", end: "12:45" },
];

const teacher = (id: string) => ({ id, name: id, subject: "", roleType: "정교사" as const, previousFatigueScore: 0 });
exam.teachers = ["가", "나", "다", "라", "마", "바", "사"].map(teacher);
const typeId = (name: string) => exam.dutyTypes.find((d) => d.name === name)!.id;

let n = 0;
const slot = (period: number, roomId: string, duty: string, teacherId: string) => {
  const id = `s${n++}`;
  exam.dutySlots.push({ id, date: DATE, period, roomId, dutyTypeId: typeId(duty) });
  exam.assignments.push({ id: `a${id}`, teacherId, dutySlotId: id, fixed: false });
};
for (let c = 1; c <= 15; c++) slot(1, `r2-${c}`, "자습감독", "가"); // 2학년 1교시 자습 (1~15반)
for (let c = 1; c <= 13; c++) slot(1, `r3-${c}`, "자습감독", "나"); // 3학년 1교시 자습 (1~13반)
slot(2, "r2-5", "복도감독", "라"); // 2학년 복도 (묶음 4·5·6)
slot(2, "r3-6", "복도감독", "사"); // 3학년 복도 (묶음 5·6·7)
slot(2, "r3-2층음악실A", "정감독", "마"); // 3학년 특별실 정/부
slot(2, "r3-2층음악실A", "부감독", "바");
exam.examSlots = [
  { id: "e1", date: DATE, period: 2, grade: 3, subject: "동아시아사", classes: [14], isMinority: true },
];

const { workbook, warnings } = buildSupervisionSheetWorkbook(exam);
assert.deepEqual(warnings, [], "경고 없음");
assert.deepEqual(workbook.worksheets.map((w) => w.name), ["10.12"]);
const ws = workbook.worksheets[0];

// 학년·열 위치
const gradeStart = (g: number) => {
  for (let c = 3; c <= ws.columnCount; c++) if (ws.getCell(2, c).value === `${g}학년`) return c;
  throw new Error(`${g}학년 열 없음`);
};
const g1 = gradeStart(1);
const g2 = gradeStart(2);
const g3 = gradeStart(3);
const col = (g: number, label: string | number) => {
  for (let c = gradeStart(g); c <= ws.columnCount; c++) if (String(ws.getCell(3, c).value) === String(label)) return c;
  throw new Error(`${g}학년 ${label} 열 없음`);
};
const mergeOf = (r: number, c: number) => {
  const merges = (ws.model as unknown as { merges: string[] }).merges;
  const addr = ws.getCell(r, c).master.address;
  return merges.find((m) => m.startsWith(`${addr}:`));
};
const addr = (r: number, c: number) => ws.getCell(r, c).address;

// 1) 열 너비·행 높이
assert.equal(ws.getColumn(1).width, 15.5);
assert.equal(ws.getColumn(2).width, 3.25);
assert.equal(ws.getColumn(g2).width, 3.25);
assert.equal(ws.getRow(4).height, 20.1, "과목 줄 높이 통일");
assert.equal(ws.getRow(5).height, 100, "감독명 줄 높이 고정");
assert.equal(ws.getRow(7).height, 20.1);

// 2) 색·테두리 종류는 정해진 것만 쓴다
const PASTELS = ["FFFFF2CC", "FFDDEBF7", "FFE2EFDA", "FFFCE4D6", "FFE4DFEC", "FFFBE5EE"];
const NAVY = "FF1F3864"; // 교과목
const GREEN = "FF375623"; // 자습·복도
const fillOf = (r: number, c: number) => {
  const f = ws.getCell(r, c).fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
  return f && f.type === "pattern" && f.pattern === "solid" ? f.fgColor?.argb : undefined;
};
const borderStyles = new Set<string>();
const fills = new Set<string>();
ws.eachRow({ includeEmpty: true }, (row) => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    const color = fillOf(cell.row as unknown as number, cell.col as unknown as number);
    if (color) fills.add(color);
    for (const side of ["top", "left", "bottom", "right"] as const) {
      const s = cell.border?.[side]?.style;
      if (s) borderStyles.add(s);
    }
  });
});
assert.deepEqual([...borderStyles].sort(), ["dotted", "medium", "thick", "thin"]);
for (const f of fills) assert.ok([...PASTELS, NAVY, GREEN].includes(f), `정해진 색만 사용: ${f}`);

// 3) 수업/자습 라벨 — 1학년은 수업(통합교육실까지 병합), 2학년 자습, 2·3학년 통합교육실은 자습 없음
const r1 = 4; // 1교시 과목 줄
assert.equal(ws.getCell(r1, g1).value, "수업");
assert.equal(mergeOf(r1, g1), `${addr(r1, g1)}:${addr(r1, g2 - 1)}`, "수업은 통합교육실 열까지 병합");
assert.equal(ws.getCell(r1, g2).value, "자습");
assert.equal(mergeOf(r1, g2), `${addr(r1, g2)}:${addr(r1, col(2, 15))}`, "2학년 자습은 1~15반");
const integrated2 = col(2, "2층통합교육실");
const integrated3 = col(3, "1층통합교육실");
assert.ok(!ws.getCell(r1, integrated2).value, "2학년 통합교육실 자습 없음");
assert.ok(!ws.getCell(r1, integrated3).value, "3학년 통합교육실 자습 없음");

// 4) 복도감독 — 과목 줄 「복도」와 이름 칸이 같은 묶음(2학년 4·5·6반)으로 병합
const r2 = 8; // 2교시 정 줄
const hallFrom = col(2, 4);
const hallTo = col(2, 6);
assert.equal(ws.getCell(7, hallFrom).value, "복도");
assert.equal(mergeOf(7, hallFrom), `${addr(7, hallFrom)}:${addr(7, hallTo)}`);
assert.equal(ws.getCell(r2, hallFrom).value, "라", "이름은 묶음 첫 칸(병합 마스터)에 있다");
assert.equal(mergeOf(r2, hallFrom), `${addr(r2, hallFrom)}:${addr(r2 + 1, hallTo)}`, "이름 칸은 정~부 2줄 × 묶음 폭");
// 3학년 묶음 5·6·7반 (이름은 6반 소속이지만 묶음 전체에 표시)
assert.equal(ws.getCell(r2, col(3, 5)).value, "사");
assert.equal(mergeOf(7, col(3, 5)), `${addr(7, col(3, 5))}:${addr(7, col(3, 7))}`);

// 5) 특별실 정/부 — 두 칸 사이 점선, 왼쪽 정/부 라벨 칸까지 이어짐
const special = col(3, "2층음악실A");
assert.equal(ws.getCell(r2, special).value, "마");
assert.equal(ws.getCell(r2 + 1, special).value, "바");
assert.equal(ws.getCell(r2, special).border?.bottom?.style, "dotted");
assert.equal(ws.getCell(r2 + 1, special).border?.top?.style, "dotted");
assert.equal(ws.getCell(r2, 2).value, "정");
assert.equal(ws.getCell(r2 + 1, 2).value, "부");
assert.equal(ws.getCell(r2, 2).border?.bottom?.style, "dotted");
assert.equal(ws.getCell(5, 2).value, "정", "정/부가 없는 1교시는 「정」 한 칸으로 병합");
assert.equal(ws.getCell(r2, special).alignment?.textRotation, "vertical", "이름은 세로쓰기");
assert.equal(ws.getCell(7, special).value, null, "교과명은 비워 두어 직접 입력");

// 6) 제목·교시 칸·감독 횟수 조회
assert.equal(ws.getCell(1, 1).value, "회귀시험 감독시간표(10.12. 월요일)");
assert.equal(ws.getCell(4, 1).value, "1교시\n8:40~9:30");
const lookup = ws.getCell(6, ws.columnCount).value as { formula?: string } | null;
assert.ok(lookup?.formula?.includes("COUNTIF($C$2:"), "감독 횟수 조회 수식");

// 6-1) 열별 음영 — 학년 안에서 흰색 | 색 | 흰색 | 색, 머리글·이름 칸이 같은 색 (과목 줄은 제외)
assert.equal(fillOf(3, col(2, 1)), undefined, "2학년 1반 열은 흰색");
assert.equal(fillOf(3, col(2, 2)), PASTELS[0], "2학년 2반 열은 노랑");
assert.equal(fillOf(3, col(2, 3)), undefined);
assert.equal(fillOf(3, col(2, 4)), PASTELS[1]);
assert.equal(fillOf(5, col(2, 2)), PASTELS[0], "이름 칸(자습)도 같은 색");
assert.equal(fillOf(6, col(2, 2)), PASTELS[0], "병합된 아래 칸도 같은 색");
assert.equal(fillOf(3, col(3, 2)), PASTELS[0], "3학년은 다시 흰색부터 시작");
assert.equal(fillOf(3, g1 + 1), PASTELS[0], "1학년 2반 열도 노랑");
// 3학년 특별실 첫 열은 학년 안 14번째 열(색 칠하는 차례) — 색 순서가 한 바퀴(6색) 돌아 처음 색으로 돌아간다
assert.equal(fillOf(8, special), PASTELS[0], "특별실 열도 같은 규칙");
assert.equal(fillOf(3, special), PASTELS[0]);
assert.equal(fillOf(8, col(2, 5)), undefined, "복도 묶음 이름 칸(병합)은 열 색 없음");
assert.equal(fillOf(r1 + 3 /* 2교시 과목 줄 */, col(2, 2)), undefined, "과목 줄 빈 칸은 색 없음");

// 6-2) 과목 줄 색 — 자습·복도=진한 초록, 교과목=진한 남색 (흰 글자), 수업=없음
const fontColor = (r: number, c: number) => (ws.getCell(r, c).font?.color as { argb?: string } | undefined)?.argb;
assert.equal(fillOf(r1, g2), GREEN);
assert.equal(fontColor(r1, g2), "FFFFFFFF");
assert.equal(fillOf(7, hallFrom), GREEN, "복도");
assert.equal(fontColor(7, hallFrom), "FFFFFFFF");
assert.equal(fillOf(7, special), NAVY, "교과목(글자는 비워 둠)");
assert.equal(fontColor(7, special), "FFFFFFFF");
assert.equal(fillOf(r1, g1), undefined, "수업은 색 없음");
const sideStyle = (r: number, c: number, side: "top" | "left" | "bottom" | "right") => ws.getCell(r, c).border?.[side]?.style;
assert.equal(sideStyle(r1, col(2, 15), "right"), "medium", "색칠 칸 오른쪽은 중간 굵기");
assert.equal(sideStyle(r1, g2 + 1, "top"), "medium");
assert.equal(sideStyle(r1 + 1, g2 + 1, "top"), "medium", "아래 칸의 윗선도 같은 굵기");

// 6-3) 학년별 바깥 테두리 = 가장 굵은 선, 교시/정부 칸 사이는 중간 굵기
const lastRow = 9; // 가상 시험은 2교시까지: 4~9행
assert.equal(sideStyle(2, g1, "top"), "thick");
assert.equal(sideStyle(5, g1, "left"), "thick");
assert.equal(sideStyle(5, g2 - 1, "right"), "thick", "1학년 오른쪽 끝");
assert.equal(sideStyle(5, g2, "left"), "thick", "2학년 왼쪽 끝 (같은 선)");
assert.equal(sideStyle(5, g3 - 1, "right"), "thick");
assert.equal(sideStyle(lastRow, g1, "bottom"), "thick");
assert.equal(sideStyle(lastRow, g3, "bottom"), "thick");
assert.equal(sideStyle(5, col(2, 5), "left"), "thin", "학년 안쪽 칸 사이는 얇은 선");
assert.equal(sideStyle(5, 2, "left"), "medium", "A·B 열 사이");
assert.equal(sideStyle(2, 2, "top"), "medium");

// 7) 미배정 슬롯은 경고, 빈 시험은 시트 없음
const broken: Exam = { ...exam, assignments: exam.assignments.slice(1) };
assert.ok(buildSupervisionSheetWorkbook(broken).warnings.some((w) => w.includes("미배정")));
assert.equal(buildSupervisionSheetWorkbook(createEmptyExam("빈 시험")).workbook.worksheets.length, 0);

console.log("supervision-sheet regression: ok");
