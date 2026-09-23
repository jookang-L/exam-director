import type ExcelJS from "exceljs";
import type { Exam } from "@/lib/types";
import type { PeriodDutyRow } from "@/lib/grid/periodDutyRows";

const BORDER_COLOR = "FFB0B0B0";
const HEADER_BG = "FFE8E8E8";
const PERIOD_BG = "FFF5F5F5";
const DUTY_BG = "FFFAFAFA";
const TITLE_BG = "FF1E3A5F";
const TITLE_FG = "FFFFFFFF";
const ALT_ROW_BG = "FFF9FAFB";
const UNASSIGNED_FG = "FFB91C1C";

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
export const GRID_BORDERS: Partial<ExcelJS.Borders> = {
  top: thinBorder,
  left: thinBorder,
  bottom: thinBorder,
  right: thinBorder,
};

export const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: HEADER_BG },
};

export function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function setupPrintableSheet(ws: ExcelJS.Worksheet, freezeRow: number) {
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.views = [{ state: "frozen", ySplit: freezeRow, activeCell: `A${freezeRow + 1}` }];
}

export function styleTitleRow(ws: ExcelJS.Worksheet, row: number, colCount: number, text: string) {
  ws.mergeCells(row, 1, row, colCount);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: TITLE_FG } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 28;
}

export function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, colCount: number) {
  const r = ws.getRow(row);
  r.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true, size: 10 };
    cell.fill = HEADER_FILL;
    cell.border = GRID_BORDERS;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
}

export function styleGridCell(
  cell: ExcelJS.Cell,
  opts: { header?: boolean; period?: boolean; duty?: boolean; alt?: boolean; center?: boolean },
) {
  cell.border = GRID_BORDERS;
  cell.alignment = {
    horizontal: opts.center ? "center" : "left",
    vertical: "middle",
    wrapText: true,
  };
  cell.font = { size: 10, ...(opts.header ? { bold: true } : {}) };
  if (opts.header) {
    cell.fill = HEADER_FILL;
    return;
  }
  if (opts.period) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PERIOD_BG } };
  else if (opts.duty) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DUTY_BG } };
  else if (opts.alt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_BG } };

  const text = String(cell.value ?? "");
  if (text.includes("(미배정)")) {
    cell.font = { size: 10, color: { argb: UNASSIGNED_FG }, italic: true };
  }
}

export function mergePeriodColumn(
  ws: ExcelJS.Worksheet,
  periodCol: number,
  startRow: number,
  endRow: number,
) {
  if (endRow <= startRow) return;
  ws.mergeCells(startRow, periodCol, endRow, periodCol);
  const cell = ws.getCell(startRow, periodCol);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

export function setColumnWidths(ws: ExcelJS.Worksheet, exam: Exam, fixedCols: number) {
  const widths: number[] = [];
  for (let c = 1; c <= fixedCols; c++) widths.push(c === 1 ? 10 : c === 2 ? 9 : 11);
  for (const room of exam.rooms) {
    widths.push(Math.min(18, Math.max(10, room.name.length + 2)));
  }
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

export type GridRowInput = {
  periodLabel: string;
  dutyTypeName: string;
  roomValues: string[];
  row: PeriodDutyRow;
  dateLabel?: string;
};

export function applyGridDataRows(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: GridRowInput[],
  colLayout: { dateCol?: number; periodCol: number; dutyCol: number; roomStartCol: number },
) {
  let periodBlockStart: number | null = null;
  let dataIdx = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const rowNum = startRow + i;
    const excelRow = ws.getRow(rowNum);
    excelRow.height = 20;

    if (colLayout.dateCol) {
      const cell = excelRow.getCell(colLayout.dateCol);
      cell.value = item.dateLabel ?? "";
      styleGridCell(cell, { center: true, alt: dataIdx % 2 === 1 });
    }

    const periodCell = excelRow.getCell(colLayout.periodCol);
    periodCell.value = item.periodLabel;
    styleGridCell(periodCell, { period: true, center: true });

    const dutyCell = excelRow.getCell(colLayout.dutyCol);
    dutyCell.value = item.dutyTypeName;
    styleGridCell(dutyCell, { duty: true });

    item.roomValues.forEach((val, ri) => {
      const cell = excelRow.getCell(colLayout.roomStartCol + ri);
      cell.value = val;
      styleGridCell(cell, { alt: dataIdx % 2 === 1 });
    });

    if (item.row.isFirstInPeriod) {
      if (periodBlockStart !== null && rowNum - 1 > periodBlockStart) {
        mergePeriodColumn(ws, colLayout.periodCol, periodBlockStart, rowNum - 1);
      }
      periodBlockStart = rowNum;
    }

    if (i === rows.length - 1 && periodBlockStart !== null) {
      mergePeriodColumn(ws, colLayout.periodCol, periodBlockStart, rowNum);
    }

    dataIdx++;
  }
}

export function styleTeacherDataSheet(ws: ExcelJS.Worksheet, headerRow: number, dataRows: number) {
  setupPrintableSheet(ws, headerRow);
  styleHeaderRow(ws, headerRow, 7);
  for (let r = headerRow + 1; r <= headerRow + dataRows; r++) {
    const alt = (r - headerRow) % 2 === 0;
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(r, c);
      cell.border = GRID_BORDERS;
      cell.alignment = {
        horizontal: c >= 5 ? "right" : "left",
        vertical: "middle",
      };
      cell.font = { size: 10 };
      if (alt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_BG } };
      if (c >= 5 && typeof cell.value === "number") {
        cell.numFmt = c === 5 ? "0" : "0.0";
      }
    }
  }
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 8;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 12;
}
