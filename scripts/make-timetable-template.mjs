import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const WEEKDAYS = ["월", "화", "수", "목", "금"];
const PERIODS = [1, 2, 3, 4];
const periodHeaders = WEEKDAYS.flatMap((day) => PERIODS.map((period) => `${day}${period}`));

const headerFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};
const exampleFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF7E6" },
};
const thin = {
  top: { style: "thin", color: { argb: "FFD0D5DD" } },
  left: { style: "thin", color: { argb: "FFD0D5DD" } },
  bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
  right: { style: "thin", color: { argb: "FFD0D5DD" } },
};

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thin;
  });
  row.height = 22;
}

function styleBody(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thin;
  });
}

const wb = new ExcelJS.Workbook();
wb.creator = "설화고 시험감독표";

const mode1 = wb.addWorksheet("모드1_행은교사", {
  views: [{ state: "frozen", ySplit: 1 }],
});
mode1.columns = [
  { header: "교사", width: 16 },
  ...periodHeaders.map((header) => ({ header, width: 14 })),
];
styleHeader(mode1.getRow(1));

const mode1Examples = [
  ["홍길동", "1-7 국어", "", "2-3 수학", "", "3-1 영어"],
  ["김영희", "", "2-15 수학", "", "1-2 국어", ""],
];
for (const values of mode1Examples) {
  const row = mode1.addRow(values);
  styleBody(row);
  row.getCell(1).fill = exampleFill;
}

const mode2 = wb.addWorksheet("모드2_열은교사", {
  views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
});
mode2.columns = [
  { header: "교시", width: 12 },
  { header: "홍길동", width: 16 },
  { header: "김영희", width: 16 },
];
styleHeader(mode2.getRow(1));
for (const label of periodHeaders) {
  const values = [label];
  if (label === "월1") values.push("1-7 국어", "");
  else if (label === "월2") values.push("", "2-15 수학");
  else if (label === "화1") values.push("2-3 수학", "");
  else if (label === "수1") values.push("", "1-2 국어");
  else if (label === "목1") values.push("3-1 영어", "");
  const row = mode2.addRow(values);
  styleBody(row);
  row.getCell(1).fill = exampleFill;
  row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
}

const guide = wb.addWorksheet("작성안내");
guide.columns = [{ width: 28 }, { width: 88 }];
const guideRows = [
  ["항목", "내용"],
  ["파일", "이 파일 그대로 STEP 6에 올리면 됩니다. xlsx"],
  ["모드 1", "시트 「모드1_행은교사」. 한 행이 교사, 열이 월1·월2 … 금4"],
  ["모드 1 설정", "가져오기 전 헤더 행 0, 교사명 컬럼 0, 데이터 시작 컬럼 1"],
  ["모드 2", "시트 「모드2_열은교사」. 헤더가 교사 이름, 왼쪽 열이 월1·화2"],
  ["모드 2 설정", "헤더 행 0, 라벨 컬럼 0, 데이터 시작 컬럼 1. 시트 버튼을 모드 2로 바꾼 뒤 가져오기"],
  ["교사 이름", "STEP 4 명단과 같아야 합니다. 홍길동·김영희는 예시이므로 지우고 실제 이름으로 바꾸세요"],
  ["칸 내용", "학년-반 과목. 예: 1-7 국어, 2-15 수학. 빈 칸은 수업 없음"],
  ["다른 표기", "107 다음 줄에 국어 처럼 3자리(학년+반)도 읽을 수 있습니다. 107 = 1학년 7반"],
  ["교시 수", "월1~금4는 STEP 1 교시 수가 4일 때 기준입니다. 교시가 더 있으면 월5, 화5 열을 같은 형식으로 추가하세요"],
  ["예시 행", "노란 이름 칸은 예시입니다. 가져오기 전에 예시 행을 지우거나 실제 수업으로 바꾸세요"],
];
guide.addRows(guideRows);
styleHeader(guide.getRow(1));
for (let i = 2; i <= guideRows.length; i++) {
  const row = guide.getRow(i);
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 32;
  row.getCell(1).font = { bold: true };
}

const outDir = path.resolve("public/templates");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "timetable-upload-template.xlsx");
await wb.xlsx.writeFile(outPath);
console.log(outPath);
