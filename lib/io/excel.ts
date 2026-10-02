import ExcelJS from "exceljs";
import type { Exam } from "@/lib/types";
import { teacherDutyWeight, teacherExamBurden } from "@/lib/algorithm/fatigue";
import { periodDutyRowsForDate } from "@/lib/grid/periodDutyRows";
import { dateWithWeekday, downloadBlob } from "@/lib/utils";

export type SheetPreview = {
  sheetName: string;
  rows: (string | number | null)[][];
};

export async function readExcelFile(file: File): Promise<SheetPreview[]> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const previews: SheetPreview[] = [];
  wb.eachSheet((sheet) => {
    const rows: (string | number | null)[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const r: (string | number | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) {
          r.push(null);
        } else if (typeof v === "object" && "result" in (v as object)) {
          // Formula cell
          const fv = (v as { result: unknown }).result;
          r.push(fv === undefined ? null : String(fv));
        } else if (typeof v === "object" && "text" in (v as object)) {
          r.push(String((v as { text: string }).text));
        } else if (v instanceof Date) {
          r.push(v.toISOString());
        } else {
          r.push(v as string | number);
        }
      });
      rows.push(r);
    });
    previews.push({ sheetName: sheet.name, rows });
  });
  return previews;
}

export async function readCsvFile(file: File): Promise<SheetPreview[]> {
  const text = await file.text();
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((line) => parseCsvLine(line));
  return [{ sheetName: file.name, rows }];
}

function parseCsvLine(line: string): (string | null)[] {
  const out: (string | null)[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => (s === "" ? null : s));
}

export async function exportAssignmentsWorkbook(exam: Exam) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "설화고 시험감독표";
  wb.created = new Date();

  const usedSheetNames = new Set<string>();
  for (const date of uniqueDates(exam)) {
    const ws = wb.addWorksheet(dailySheetTabName(date, usedSheetNames));
    buildDailySheet(ws, exam, date);
  }

  buildTeacherSheet(wb.addWorksheet("개인별"), exam);

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${exam.name || "exam"}_감독표.xlsx`);
}

function uniqueDates(exam: Exam): string[] {
  return Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();
}

/** Excel 시트명: `/` 등 금지 문자 제거, 31자 제한 */
function dailySheetTabName(date: string, used: Set<string>): string {
  const base = dateWithWeekday(date).replace(/\//g, ".");
  let name = base.slice(0, 31);
  let n = 2;
  while (used.has(name)) {
    const suffix = `_${n}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(name);
  return name;
}

function teacherNameForSlot(exam: Exam, dutySlotId: string): string {
  const a = exam.assignments.find((x) => x.dutySlotId === dutySlotId);
  if (!a) return "(미배정)";
  return exam.teachers.find((t) => t.id === a.teacherId)?.name ?? "(미배정)";
}

function buildDailySheet(ws: ExcelJS.Worksheet, exam: Exam, date: string) {
  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);
  const dutyRows = periodDutyRowsForDate(exam, date, periods);
  const colCount = 2 + exam.rooms.length;
  const title = `${exam.name || "시험"} — ${dateWithWeekday(date)}`;

  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  const headerRow = 2;
  ws.addRow(["교시", "감독", ...exam.rooms.map((r) => r.name)]);

  const dataStartRow = 3;
  let periodBlockStart: number | null = null;

  for (let i = 0; i < dutyRows.length; i++) {
    const row = dutyRows[i];
    const rowNum = dataStartRow + i;
    const excelRow = ws.getRow(rowNum);
    excelRow.height = 20;

    const periodCell = excelRow.getCell(1);
    periodCell.value = `${row.period}교시`;

    excelRow.getCell(2).value = row.dutyTypeName;

    exam.rooms.forEach((room, ri) => {
      const slots = exam.dutySlots.filter(
        (s) =>
          s.date === date &&
          s.period === row.period &&
          s.dutyTypeId === row.dutyTypeId &&
          s.roomId === room.id,
      );
      const names = slots.map((s) => teacherNameForSlot(exam, s.id)).join(" · ");
      excelRow.getCell(3 + ri).value = names;
    });

    if (row.isFirstInPeriod) {
      if (periodBlockStart !== null && rowNum - 1 > periodBlockStart) {
        ws.mergeCells(periodBlockStart, 1, rowNum - 1, 1);
        ws.getCell(periodBlockStart, 1).alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      }
      periodBlockStart = rowNum;
    }

    if (i === dutyRows.length - 1 && periodBlockStart !== null) {
      ws.mergeCells(periodBlockStart, 1, rowNum, 1);
      ws.getCell(periodBlockStart, 1).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
  }

  applyPlainGridStyle(ws, headerRow, dutyRows.length, colCount, exam.rooms);
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

type TeacherDutyCounts = {
  teacher: Exam["teachers"][number];
  chief: number;
  assistant: number;
  hall: number;
  selfStudy: number;
  dutyWeight: number;
  classWeight: number;
  weight: number;
};

function countDutiesByType(exam: Exam, teacherId: string): Omit<TeacherDutyCounts, "teacher"> {
  let chief = 0;
  let assistant = 0;
  let selfStudy = 0;
  let hall = 0;
  const dutyWeight = teacherDutyWeight(exam, teacherId);
  for (const a of exam.assignments) {
    if (a.teacherId !== teacherId) continue;
    const slot = exam.dutySlots.find((s) => s.id === a.dutySlotId);
    if (!slot) continue;
    const dt = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId);
    switch (dt?.name) {
      case "정감독":
        chief++;
        break;
      case "부감독":
        assistant++;
        break;
      case "복도감독":
        hall++;
        break;
      case "자습감독":
        selfStudy++;
        break;
      default:
        break;
    }
  }
  const classWeight = teacherExamBurden(exam, teacherId) - dutyWeight;
  const weight = teacherExamBurden(exam, teacherId);
  return {
    chief,
    assistant,
    hall,
    selfStudy,
    dutyWeight: Math.round(dutyWeight * 10) / 10,
    classWeight: Math.round(classWeight * 10) / 10,
    weight: Math.round(weight * 10) / 10,
  };
}

const TEACHER_HEADERS = [
  "교사",
  "교과",
  "역할",
  "담임",
  "정감독",
  "부감독",
  "복도감독",
  "자습감독",
  "감독곤란도",
  "수업부담",
  "업무강도(현)",
  "이전피로도",
] as const;

function buildTeacherSheet(ws: ExcelJS.Worksheet, exam: Exam) {
  const stats: TeacherDutyCounts[] = exam.teachers.map((t) => ({
    teacher: t,
    ...countDutiesByType(exam, t.id),
  }));
  stats.sort(
    (a, b) =>
      b.weight - a.weight ||
      b.chief + b.assistant + b.hall + b.selfStudy - (a.chief + a.assistant + a.hall + a.selfStudy),
  );

  ws.addRow([...TEACHER_HEADERS]);
  for (const { teacher: t, chief, assistant, hall, selfStudy, dutyWeight, classWeight, weight } of stats) {
    ws.addRow([
      t.name,
      t.subject,
      t.roleType,
      t.homeroomGrade ? `${t.homeroomGrade}-${t.homeroomClass}` : "",
      chief,
      assistant,
      hall,
      selfStudy,
      dutyWeight,
      classWeight,
      weight,
      t.previousFatigueScore ?? 0,
    ]);
  }
  applyPlainTableStyle(ws, 1, stats.length, TEACHER_HEADERS.length);
}

function applyPlainGridStyle(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  dataRows: number,
  colCount: number,
  rooms: Exam["rooms"],
) {
  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFB0B0B0" } };
  const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

  for (let r = headerRow; r <= headerRow + dataRows; r++) {
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = {
        horizontal: c <= 2 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.font = { size: 10, bold: r === headerRow };
    }
  }

  ws.getColumn(1).width = 9;
  ws.getColumn(2).width = 11;
  for (let c = 3; c <= colCount; c++) {
    const room = rooms[c - 3];
    ws.getColumn(c).width = Math.min(18, Math.max(10, (room?.name.length ?? 8) + 2));
  }

  ws.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${headerRow + 1}` }];
}

function applyPlainTableStyle(ws: ExcelJS.Worksheet, headerRow: number, dataRows: number, colCount: number) {
  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFB0B0B0" } };
  const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

  for (let r = headerRow; r <= headerRow + dataRows; r++) {
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = {
        horizontal: c >= 5 ? "center" : "left",
        vertical: "middle",
      };
      cell.font = { size: 10, bold: r === headerRow };
      if (r > headerRow && c >= 5 && typeof cell.value === "number") {
        cell.numFmt = c >= 9 && c <= 11 ? "0.0" : "0";
      }
    }
  }

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 8;
  ws.getColumn(5).width = 8;
  ws.getColumn(6).width = 8;
  ws.getColumn(7).width = 9;
  ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 12;

  ws.views = [{ state: "frozen", ySplit: headerRow, activeCell: "A2" }];
}

function roomName(exam: Exam, roomId: string): string {
  return exam.rooms.find((r) => r.id === roomId)?.name ?? roomId;
}

// Per-teacher schedule sheet (one row per assignment)
export function teacherSchedule(exam: Exam, teacherId: string): Array<{
  date: string;
  period: number;
  roomName: string;
  dutyTypeName: string;
}> {
  const result = [];
  for (const a of exam.assignments) {
    if (a.teacherId !== teacherId) continue;
    const s = exam.dutySlots.find((ds) => ds.id === a.dutySlotId);
    if (!s) continue;
    const dt = exam.dutyTypes.find((d) => d.id === s.dutyTypeId);
    result.push({
      date: s.date,
      period: s.period,
      roomName: roomName(exam, s.roomId),
      dutyTypeName: dt?.name ?? "?",
    });
  }
  result.sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period));
  return result;
}
