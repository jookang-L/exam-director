import ExcelJS from "exceljs";
import type { Exam } from "@/lib/types";
import {
  getTeacherPeriodExcludeLabel,
  isTeacherExcludedForPeriod,
  isTeacherExcludedForSlot,
} from "@/lib/algorithm/excludeVisualization";
import {
  buildTeacherSlotLookup,
  formatPeriodExamEntry,
  formatTimetableClassRoom,
  teacherDutyCounts,
  teacherFatigueBreakdown,
  TEACHER_GRID_CLASS_EXCEL,
  TEACHER_GRID_DUTY_COUNT_COLUMNS,
  TEACHER_GRID_FATIGUE_COLUMNS,
  TEACHER_GRID_EXCLUDE_EXCEL,
  sortTeachersForTeacherGridDisplay,
  type TeacherGridColumn,
  type TeacherGridPeriodGroup,
} from "@/lib/grid/teacherDayGrid";
import {
  buildTeacherGridLayout,
  TEACHER_GRID_DATA_START,
  TEACHER_GRID_EXCEL_FIXED_COL_COUNT,
  TEACHER_GRID_HEADER_BOTTOM,
  TEACHER_GRID_HEADER_TOP,
} from "@/lib/grid/teacherGridLayout";
import { GRID_BORDERS, HEADER_FILL, setupPrintableSheet, styleTitleRow } from "@/lib/io/excelFormat";
import { downloadBlob } from "@/lib/utils";

const CLASS_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: TEACHER_GRID_CLASS_EXCEL.fill },
};

const CLASS_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  color: { argb: TEACHER_GRID_CLASS_EXCEL.font },
  bold: true,
};

const EXCLUDE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: TEACHER_GRID_EXCLUDE_EXCEL.fill },
};

const EXCLUDE_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  color: { argb: TEACHER_GRID_EXCLUDE_EXCEL.font },
  bold: true,
};

const PERIOD_FILLS = ["FFF3F4F6", "FFE5E7EB"] as const;

const MONTH_BORDER_COLOR = "FF1F2937";
const DATE_BORDER_COLOR = "FF374151";
const PERIOD_BORDER_COLOR = "FF6B7280";
const EXCEL_SUBJECT_COL = 2;
const EXCEL_SUMMARY_START_COL = 3;
const EXCEL_FIXED_COL_COUNT = TEACHER_GRID_EXCEL_FIXED_COL_COUNT;

type TeacherGridExportRow = Exam["teachers"][number] & {
  exportSubject?: string;
};

const MONTH_LEFT_BORDER: Partial<ExcelJS.Border> = {
  style: "thick",
  color: { argb: MONTH_BORDER_COLOR },
};

/** 날짜 블록 구분 — 같은 달 내 6/29 ↔ 6/30 등 */
const DATE_LEFT_BORDER: Partial<ExcelJS.Border> = {
  style: "thick",
  color: { argb: DATE_BORDER_COLOR },
};

/** 같은 날짜 안 교시 블록 구분 — Excel 이중선(double) */
const PERIOD_LEFT_BORDER: Partial<ExcelJS.Border> = {
  style: "double",
  color: { argb: PERIOD_BORDER_COLOR },
};

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function patchCellLeftBorder(cell: ExcelJS.Cell, left: Partial<ExcelJS.Border>) {
  const existing = cell.border ?? GRID_BORDERS;
  cell.border = {
    top: existing.top ?? GRID_BORDERS.top,
    bottom: existing.bottom ?? GRID_BORDERS.bottom,
    right: existing.right ?? GRID_BORDERS.right,
    left,
  };
}

function applyColumnLeftBorder(
  ws: ExcelJS.Worksheet,
  col: number,
  rowStart: number,
  rowEnd: number,
  left: Partial<ExcelJS.Border>,
) {
  for (let row = rowStart; row <= rowEnd; row++) {
    patchCellLeftBorder(ws.getCell(row, col), left);
  }
}

/** 월·날짜·교시 경계 테두리 */
function applyTeacherGridSectionBorders(
  ws: ExcelJS.Worksheet,
  days: ReturnType<typeof buildTeacherGridLayout>["days"],
  rowStart: number,
  rowEnd: number,
) {
  let currentMonth: string | null = null;
  let previousDate: string | null = null;

  for (const day of days) {
    const mk = monthKey(day.date);
    const isNewMonth = mk !== currentMonth;
    const isNewDate = day.date !== previousDate;

    if (isNewMonth) {
      applyColumnLeftBorder(ws, day.colStart, rowStart, rowEnd, MONTH_LEFT_BORDER);
      currentMonth = mk;
    } else if (isNewDate) {
      applyColumnLeftBorder(ws, day.colStart, rowStart, rowEnd, DATE_LEFT_BORDER);
    }

    day.groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        applyColumnLeftBorder(ws, group.colStart, rowStart, rowEnd, PERIOD_LEFT_BORDER);
      }
    });

    previousDate = day.date;
  }
}

function styleHeaderCell(cell: ExcelJS.Cell, fill?: ExcelJS.Fill) {
  cell.font = { bold: true, size: 10 };
  cell.fill = fill ?? HEADER_FILL;
  cell.border = GRID_BORDERS;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function styleBodyCell(cell: ExcelJS.Cell, opts?: { center?: boolean; fill?: ExcelJS.Fill }) {
  cell.border = GRID_BORDERS;
  cell.alignment = {
    horizontal: opts?.center ? "center" : "left",
    vertical: "middle",
    wrapText: true,
  };
  cell.font = { size: 10 };
  if (opts?.fill) cell.fill = opts.fill;
}

function styleClassDutyCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value || "\u00A0";
  cell.border = GRID_BORDERS;
  cell.fill = CLASS_FILL;
  cell.font = CLASS_FONT;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function styleExcludeDutyCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value || "제외";
  cell.border = GRID_BORDERS;
  cell.fill = EXCLUDE_FILL;
  cell.font = EXCLUDE_FONT;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function periodHasAssignment(
  teacherId: string,
  group: TeacherGridPeriodGroup,
  slotLookup: ReturnType<typeof buildTeacherSlotLookup>,
): boolean {
  return group.columns.some(
    (col) => col.hasSlots && !col.isPadding && slotLookup.get(teacherId)?.has(col.key),
  );
}

function dutyCellValue(
  teacherId: string,
  col: TeacherGridColumn,
  slotLookup: ReturnType<typeof buildTeacherSlotLookup>,
): string {
  if (!col.hasSlots || col.isPadding) return "";
  return slotLookup.get(teacherId)?.get(col.key)?.roomName ?? "";
}

function centerColumnIndex(columns: TeacherGridColumn[]): number {
  const dutyIndexes = columns
    .map((col, ci) => ({ col, ci }))
    .filter(({ col }) => !col.isPadding)
    .map(({ ci }) => ci);
  if (dutyIndexes.length === 0) return 0;
  const mid = Math.floor((dutyIndexes.length - 1) / 2);
  return dutyIndexes[mid] ?? dutyIndexes[0];
}

function splitTeacherSubjects(subject: string): string[] {
  const subjects = subject
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return subjects.length > 0 ? subjects : [""];
}

function expandedTeachersBySubject(exam: Exam): TeacherGridExportRow[] {
  return exam.teachers
    .flatMap<TeacherGridExportRow>((teacher) =>
      splitTeacherSubjects(teacher.subject).map((subject) => ({
        ...teacher,
        exportSubject: subject,
      })),
    )
    .sort((a, b) => {
      const subjectCompare = (a.exportSubject ?? "").localeCompare(b.exportSubject ?? "", "ko");
      if (subjectCompare !== 0) return subjectCompare;
      return a.name.localeCompare(b.name, "ko");
    });
}

function buildTeacherGridSheet(
  ws: ExcelJS.Worksheet,
  exam: Exam,
  options?: {
    titleSuffix?: string;
    teachers?: TeacherGridExportRow[];
    subjectHeaderNote?: string;
  },
) {
  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);
  const teachers: TeacherGridExportRow[] =
    options?.teachers ?? sortTeachersForTeacherGridDisplay(exam, exam.teachers);
  const { days, totalCols } = buildTeacherGridLayout(exam, periods, teachers, EXCEL_FIXED_COL_COUNT);
  if (days.length === 0 || totalCols <= EXCEL_FIXED_COL_COUNT) {
    ws.getCell(1, 1).value = "감독 슬롯이 없습니다.";
    return;
  }

  const title = `${exam.name || "시험"} — ${options?.titleSuffix ?? "교사별 감독표"} (노랑=정규 수업, 빨강=STEP 7 제외)`;
  const headerTop = TEACHER_GRID_HEADER_TOP;
  const headerBottom = TEACHER_GRID_HEADER_BOTTOM;
  const dataStart = TEACHER_GRID_DATA_START;

  styleTitleRow(ws, 1, totalCols, title);

  // 고정 열: 2~4행만 세로 병합 (5행은 정렬용 독립 헤더)
  ws.mergeCells(headerTop, 1, headerBottom - 1, 1);
  ws.getCell(headerTop, 1).value = "교사";
  styleHeaderCell(ws.getCell(headerTop, 1));

  const sortHeaderA = ws.getCell(headerBottom, 1);
  sortHeaderA.value = "교사";
  styleHeaderCell(sortHeaderA);

  ws.mergeCells(headerTop, EXCEL_SUBJECT_COL, headerBottom - 1, EXCEL_SUBJECT_COL);
  const subjectHeader = ws.getCell(headerTop, EXCEL_SUBJECT_COL);
  subjectHeader.value = "과목";
  subjectHeader.note =
    options?.subjectHeaderNote ??
    "복수 교과는 쉼표로 표시됩니다. 필터 검색으로 특정 과목을 찾을 수 있습니다.";
  styleHeaderCell(subjectHeader);

  const sortHeaderSubject = ws.getCell(headerBottom, EXCEL_SUBJECT_COL);
  sortHeaderSubject.value = "과목";
  styleHeaderCell(sortHeaderSubject);

  TEACHER_GRID_FATIGUE_COLUMNS.forEach((col, index) => {
    const excelCol = EXCEL_SUMMARY_START_COL + index;
    ws.mergeCells(headerTop, excelCol, headerBottom - 1, excelCol);
    const headerCell = ws.getCell(headerTop, excelCol);
    headerCell.value = col.label;
    headerCell.note = col.title;
    styleHeaderCell(headerCell);

    const sortHeader = ws.getCell(headerBottom, excelCol);
    sortHeader.value = col.label;
    styleHeaderCell(sortHeader);
  });

  TEACHER_GRID_DUTY_COUNT_COLUMNS.forEach((col, index) => {
    const excelCol = EXCEL_SUMMARY_START_COL + TEACHER_GRID_FATIGUE_COLUMNS.length + index;
    ws.mergeCells(headerTop, excelCol, headerBottom - 1, excelCol);
    const headerCell = ws.getCell(headerTop, excelCol);
    headerCell.value = col.label;
    headerCell.note = `${col.dutyName} 횟수`;
    styleHeaderCell(headerCell);

    const sortHeader = ws.getCell(headerBottom, excelCol);
    sortHeader.value = col.label;
    styleHeaderCell(sortHeader);
  });

  for (const day of days) {
    if (day.colEnd < day.colStart) continue;
    ws.mergeCells(headerTop, day.colStart, headerTop, day.colEnd);
    const dateCell = ws.getCell(headerTop, day.colStart);
    dateCell.value = day.label;
    styleHeaderCell(dateCell);

    day.groups.forEach((group, idx) => {
      const groupEnd = group.colStart + group.columns.length - 1;
      ws.mergeCells(headerTop + 1, group.colStart, headerTop + 1, groupEnd);
      const periodCell = ws.getCell(headerTop + 1, group.colStart);
      periodCell.value = `${group.period}교시`;
      styleHeaderCell(periodCell, {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PERIOD_FILLS[idx % 2] },
      });

      const examText =
        group.examEntries.length === 0
          ? "시험 없음"
          : group.examEntries.map((e) => formatPeriodExamEntry(e)).join("\n");
      ws.mergeCells(headerTop + 2, group.colStart, headerTop + 2, groupEnd);
      const examCell = ws.getCell(headerTop + 2, group.colStart);
      examCell.value = examText;
      styleHeaderCell(examCell, {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PERIOD_FILLS[idx % 2] },
      });

      group.columns.forEach((col, ci) => {
        const dutyCell = ws.getCell(headerTop + 3, group.colStart + ci);
        dutyCell.value = col.isPadding ? "" : col.shortLabel;
        styleHeaderCell(dutyCell);
      });
    });
  }

  for (let ti = 0; ti < teachers.length; ti++) {
    const teacher = teachers[ti];
    const rowNum = dataStart + ti;
    const row = ws.getRow(rowNum);
    row.height = 18;

    const nameCell = row.getCell(1);
    nameCell.value = teacher.name;
    styleBodyCell(nameCell, { center: true });

    const subjectCell = row.getCell(EXCEL_SUBJECT_COL);
    subjectCell.value = teacher.exportSubject ?? teacher.subject;
    styleBodyCell(subjectCell);

    const fatigue = teacherFatigueBreakdown(exam, teacher);
    TEACHER_GRID_FATIGUE_COLUMNS.forEach((col, index) => {
      const cell = row.getCell(EXCEL_SUMMARY_START_COL + index);
      cell.value = Math.round(fatigue[col.key]);
      cell.numFmt = "0";
      styleBodyCell(cell, { center: true });
    });

    const counts = teacherDutyCounts(exam, teacher.id);
    TEACHER_GRID_DUTY_COUNT_COLUMNS.forEach((col, index) => {
      const cell = row.getCell(EXCEL_SUMMARY_START_COL + TEACHER_GRID_FATIGUE_COLUMNS.length + index);
      cell.value = counts[col.key];
      cell.numFmt = "0";
      styleBodyCell(cell, { center: true });
    });

    for (const day of days) {
      for (const group of day.groups) {
        const classRow = day.classLookup.get(teacher.id)?.get(group.period);
        const hasAssignment = periodHasAssignment(teacher.id, group, day.slotLookup);
        const periodExcluded = isTeacherExcludedForPeriod(exam, teacher.id, day.date, group.period);
        const periodExcludeTitle = periodExcluded
          ? getTeacherPeriodExcludeLabel(exam, teacher.id, day.date, group.period)
          : null;

        if (classRow && !hasAssignment && !periodExcluded) {
          const room = formatTimetableClassRoom(classRow);
          const centerIdx = centerColumnIndex(group.columns);
          group.columns.forEach((col, ci) => {
            const cell = row.getCell(group.colStart + ci);
            if (col.isPadding) {
              cell.value = "";
              styleBodyCell(cell, { center: true });
              return;
            }
            styleClassDutyCell(cell, ci === centerIdx ? room : "");
          });
          continue;
        }

        if (periodExcluded && !hasAssignment) {
          group.columns.forEach((col, ci) => {
            const cell = row.getCell(group.colStart + ci);
            if (col.isPadding || !col.hasSlots) {
              cell.value = "";
              styleBodyCell(cell, { center: true });
              return;
            }
            styleExcludeDutyCell(cell, "제외");
            if (periodExcludeTitle) {
              cell.note = periodExcludeTitle;
            }
          });
          continue;
        }

        group.columns.forEach((col, ci) => {
          const cell = row.getCell(group.colStart + ci);
          if (col.isPadding || !col.hasSlots) {
            cell.value = "";
            styleBodyCell(cell, { center: true });
            return;
          }

          const cellData = day.slotLookup.get(teacher.id)?.get(col.key);
          const slotExcluded = cellData
            ? isTeacherExcludedForSlot(exam, teacher, cellData.slot)
            : false;
          const columnExcluded = !cellData && periodExcluded;
          if (slotExcluded || columnExcluded) {
            const label = cellData?.roomName ?? "제외";
            styleExcludeDutyCell(cell, label);
            const note = periodExcludeTitle ?? undefined;
            if (note) cell.note = note;
            return;
          }

          const roomName = dutyCellValue(teacher.id, col, day.slotLookup);
          cell.value = roomName;
          styleBodyCell(cell, { center: true });
        });
      }
    }
  }

  ws.getColumn(1).width = 10;
  ws.getColumn(EXCEL_SUBJECT_COL).width = 22;
  for (let c = EXCEL_SUMMARY_START_COL; c < EXCEL_SUMMARY_START_COL + TEACHER_GRID_FATIGUE_COLUMNS.length; c++) {
    ws.getColumn(c).width = 8;
  }
  for (
    let c = EXCEL_SUMMARY_START_COL + TEACHER_GRID_FATIGUE_COLUMNS.length;
    c <= EXCEL_FIXED_COL_COUNT;
    c++
  ) {
    ws.getColumn(c).width = 5;
  }
  for (let c = EXCEL_FIXED_COL_COUNT + 1; c <= totalCols; c++) {
    ws.getColumn(c).width = 6;
  }

  const lastDataRow = dataStart + teachers.length - 1;
  applyTeacherGridSectionBorders(ws, days, headerTop, lastDataRow);

  ws.autoFilter = {
    from: { row: headerBottom, column: 1 },
    to: { row: lastDataRow, column: totalCols },
  };

  setupPrintableSheet(ws, dataStart - 1);
  ws.views = [
    {
      state: "frozen",
      xSplit: EXCEL_FIXED_COL_COUNT,
      ySplit: dataStart - 1,
      activeCell: "I6",
    },
  ];
}

export async function exportTeacherGridWorkbook(
  exam: Exam,
  options?: { filenameSuffix?: string },
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "설화고 시험감독표";
  wb.created = new Date();

  const ws = wb.addWorksheet("교사별감독표");
  buildTeacherGridSheet(ws, exam);

  const bySubjectWs = wb.addWorksheet("교과별정렬");
  buildTeacherGridSheet(bySubjectWs, exam, {
    titleSuffix: "교과별 정렬표",
    teachers: expandedTeachersBySubject(exam),
    subjectHeaderNote:
      "복수 교과 교사는 교과별로 한 행씩 반복 표시됩니다. 이 시트는 과목 정렬과 필터용입니다.",
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${exam.name || "exam"}_${options?.filenameSuffix ?? "교사별감독표"}.xlsx`,
  );
}
