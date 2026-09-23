/**
 * 설화고 주간시간표 → STEP6 모드1 (행=교사, 열=월1·화2…) 변환
 * Usage: node scripts/convert-seolhwa-timetable.mjs [입력.xlsx] [출력.xlsx]
 */
import ExcelJS from "exceljs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const defaultIn =
  "s:\\분야별\\업무\\일과\\2026\\1학기 시간표\\(26.1학기 확정)교사 주간 시간표.xlsx";
const defaultOut = join(__dir, "..", "public", "step6-timetable-upload.xlsx");

const WEEKDAYS = ["월", "화", "수", "목", "금"];

function stripTeacherName(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(.+?)\s*\(\d+\)\s*$/);
  return m ? m[1].trim() : s;
}

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((r) => r.text).join("");
  }
  if (typeof v === "object" && "result" in v) {
    return String(v.result ?? "");
  }
  return String(v).replace(/\r\n/g, "\n").trim();
}

/** 101, 305, 107+국어 → 1-1, 3-5, 1-7 국어 */
function formatRoomCell(text) {
  if (!text) return "";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  const roomLine = lines.find((l) => /^\d{3}$/.test(l)) ?? lines[0];
  const subject = lines.find((l) => l !== roomLine && !/^\d{3}$/.test(l)) ?? "";

  const roomMatch = roomLine.match(/^(\d{3})$/);
  if (!roomMatch) {
    return subject ? `${roomLine} ${subject}`.trim() : roomLine;
  }
  const code = roomMatch[1];
  const grade = Number(code[0]);
  const klass = String(Number(code.slice(1))); // 07 → 7
  if (grade >= 1 && grade <= 3) {
    return subject ? `${grade}-${klass} ${subject}` : `${grade}-${klass}`;
  }
  return subject ? `${roomLine} ${subject}` : roomLine;
}

function buildColumnMap(ws, headerRowWeekday, headerRowPeriod) {
  const wdRow = ws.getRow(headerRowWeekday);
  const pRow = ws.getRow(headerRowPeriod);
  const cols = [];
  const maxCol = Math.max(wdRow.cellCount, pRow.cellCount);

  let currentWd = "";
  for (let c = 2; c <= maxCol; c++) {
    const wdVal = cellText(wdRow.getCell(c).value);
    if (WEEKDAYS.includes(wdVal)) currentWd = wdVal;
    const period = Number(cellText(pRow.getCell(c).value));
    if (!currentWd || !Number.isFinite(period) || period <= 0) continue;
    cols.push({ col: c, label: `${currentWd}${period}`, weekday: currentWd, period });
  }
  return cols;
}

async function convert(inputPath, outputPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);
  const ws = wb.worksheets[0];

  // Row 2 = weekday, Row 3 = period (1-indexed in Excel)
  const colMap = buildColumnMap(ws, 2, 3);
  if (colMap.length === 0) throw new Error("요일·교시 헤더를 찾지 못했습니다.");

  const outWb = new ExcelJS.Workbook();
  const outWs = outWb.addWorksheet("STEP6업로드", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
  });

  const header = ["교사", ...colMap.map((c) => c.label)];
  outWs.addRow(header);
  outWs.getRow(1).font = { bold: true };

  let teacherCount = 0;
  let filledCells = 0;

  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const teacherRaw = cellText(row.getCell(1).value);
    if (!teacherRaw) continue;
    const teacher = stripTeacherName(teacherRaw);
    if (!teacher) continue;

    const outRow = [teacher];
    for (const { col } of colMap) {
      const formatted = formatRoomCell(cellText(row.getCell(col).value));
      outRow.push(formatted);
      if (formatted) filledCells++;
    }
    outWs.addRow(outRow);
    teacherCount++;
  }

  outWs.getColumn(1).width = 14;
  for (let i = 2; i <= header.length; i++) {
    outWs.getColumn(i).width = 11;
  }

  await outWb.xlsx.writeFile(outputPath);

  console.log("입력:", inputPath);
  console.log("출력:", outputPath);
  console.log("교사:", teacherCount, "명");
  console.log("열(요일·교시):", colMap.length, "개 →", colMap[0]?.label, "~", colMap.at(-1)?.label);
  console.log("채워진 셀:", filledCells);
}

const input = process.argv[2] || defaultIn;
const output = process.argv[3] || defaultOut;
convert(input, output).catch((e) => {
  console.error(e);
  process.exit(1);
});
