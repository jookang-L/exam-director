import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

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

const sheet = wb.addWorksheet("교사명단", {
  views: [{ state: "frozen", ySplit: 1 }],
});
sheet.columns = [
  { header: "이름", width: 14 },
  { header: "교과", width: 28 },
  { header: "역할", width: 14 },
  { header: "담임학년", width: 12 },
  { header: "담임반", width: 12 },
  { header: "누적피로도", width: 14 },
];
styleHeader(sheet.getRow(1));

const examples = [
  ["홍길동", "국어", "정교사", 1, 7, 0],
  ["김영희", "공통국어1, 화법과작문", "기간제", 2, 3, 130],
  ["이철수", "영어", "강사", "", "", 0],
  ["박보건", "보건", "보건교사", "", "", 0],
  ["최영양", "영양", "영양교사", "", "", 0],
  ["정평가", "평가", "평가담당", "", "", 0],
];
for (const values of examples) {
  const row = sheet.addRow(values);
  styleBody(row);
  row.getCell(1).fill = exampleFill;
}

const guide = wb.addWorksheet("작성안내");
guide.columns = [{ width: 18 }, { width: 92 }];
const guideRows = [
  ["항목", "내용"],
  ["파일", "이 파일 그대로 STEP 4에 올리면 됩니다. xlsx"],
  ["시트", "「교사명단」 시트만 읽습니다. 가져오기 전 그 시트를 선택하세요"],
  ["컬럼", "이름, 교과, 역할, 담임학년, 담임반, 누적피로도. 헤더 행 0, 컬럼 번호는 0부터 5"],
  ["이름", "같은 이름이 여러 명이면 동명이인으로 따로 등록됩니다"],
  ["교과", "쉼표(,)로 여러 과목을 적을 수 있습니다. 예: 공통국어1, 화법과작문"],
  ["역할", "정교사, 기간제, 강사, 보건교사, 영양교사, 평가담당 중 하나. 비우거나 다른 값이면 정교사"],
  ["담임", "담임이 아니면 담임학년·담임반을 비웁니다. 학년은 1, 2, 3"],
  ["누적피로도", "지난 시험 부담입니다. 정·부 100, 자습·수업 30과 같은 점수입니다. 비우면 0"],
  ["예시 행", "노란 이름 칸은 예시입니다. 가져오기 전에 예시 행을 지우거나 실제 교사로 바꾸세요"],
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
const outPath = path.join(outDir, "teacher-upload-template.xlsx");
await wb.xlsx.writeFile(outPath);
console.log(outPath);
