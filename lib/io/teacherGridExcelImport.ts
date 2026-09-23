import ExcelJS from "exceljs";
import type { Assignment, Exam, ValidationIssue } from "@/lib/types";
import { newId } from "@/lib/types";
import {
  TEACHER_GRID_CLASS_EXCEL,
  TEACHER_GRID_EXCLUDE_EXCEL,
} from "@/lib/grid/teacherDayGrid";
import {
  TEACHER_GRID_DATA_START,
  TEACHER_GRID_DUTY_LABEL_ROW,
  TEACHER_GRID_HEADER_TOP,
  buildTeacherGridLayout,
} from "@/lib/grid/teacherGridLayout";
import { runFullValidation, hasErrors } from "@/lib/validation/rules";

export type TeacherGridImportIssue = {
  severity: "error" | "warning";
  message: string;
  row?: number;
  column?: number;
};

export type TeacherGridImportResult = {
  assignments: Assignment[];
  parseIssues: TeacherGridImportIssue[];
  validationIssues: ValidationIssue[];
  teacherCount: number;
  assignedSlotCount: number;
};

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\u00a0/g, " ").trim();
  if (typeof value === "number") return String(value).trim();
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText.map((part) => part.text).join("").replace(/\u00a0/g, " ").trim();
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    const result = value.result;
    if (result == null) return "";
    return String(result).trim();
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function matchesExcelFill(cell: ExcelJS.Cell, targetFill: string): boolean {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern") return false;
  const argb = fill.fgColor?.argb?.toUpperCase();
  if (!argb) return false;
  const target = targetFill.toUpperCase();
  return argb === target || argb.endsWith(target.slice(2));
}

function isClassCell(cell: ExcelJS.Cell): boolean {
  return matchesExcelFill(cell, TEACHER_GRID_CLASS_EXCEL.fill);
}

function isExcludeCell(cell: ExcelJS.Cell): boolean {
  return matchesExcelFill(cell, TEACHER_GRID_EXCLUDE_EXCEL.fill);
}

function findTeachersByName(exam: Exam, name: string): { ids: string[]; issue?: TeacherGridImportIssue } {
  const trimmed = name.trim();
  if (!trimmed) return { ids: [] };
  const matches = exam.teachers.filter((teacher) => teacher.name === trimmed);
  if (matches.length === 0) {
    return {
      ids: [],
      issue: {
        severity: "error",
        message: `교사 '${trimmed}'을(를) 찾을 수 없습니다.`,
      },
    };
  }
  if (matches.length > 1) {
    return {
      ids: matches.map((teacher) => teacher.id),
      issue: {
        severity: "error",
        message: `교사 '${trimmed}'이(가) ${matches.length}명이라 구분할 수 없습니다.`,
      },
    };
  }
  return { ids: [matches[0].id] };
}

function findRoomId(exam: Exam, roomName: string): { roomId?: string; issue?: TeacherGridImportIssue } {
  const matches = exam.rooms.filter((room) => room.name === roomName);
  if (matches.length === 0) {
    return {
      issue: {
        severity: "error",
        message: `고사실 '${roomName}'을(를) 찾을 수 없습니다.`,
      },
    };
  }
  if (matches.length > 1) {
    return {
      issue: {
        severity: "error",
        message: `고사실 '${roomName}'이(가) ${matches.length}개라 구분할 수 없습니다.`,
      },
    };
  }
  return { roomId: matches[0].id };
}

function verifySheetHeaders(
  ws: ExcelJS.Worksheet,
  layoutDays: ReturnType<typeof buildTeacherGridLayout>["days"],
  issues: TeacherGridImportIssue[],
) {
  for (const day of layoutDays) {
    const headerCell = ws.getCell(TEACHER_GRID_HEADER_TOP, day.colStart);
    const headerText = cellText(headerCell);
    if (headerText && headerText !== day.label) {
      issues.push({
        severity: "warning",
        message: `${day.label} 열 헤더가 '${headerText}'로 되어 있습니다. 현재 시험 날짜와 다를 수 있습니다.`,
        row: TEACHER_GRID_HEADER_TOP,
        column: day.colStart,
      });
    }
  }
}

export async function parseTeacherGridWorkbook(
  buffer: ArrayBuffer,
  exam: Exam,
): Promise<TeacherGridImportResult> {
  const parseIssues: TeacherGridImportIssue[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws =
    wb.getWorksheet("교사별감독표") ??
    wb.worksheets[0];
  if (!ws) {
    return {
      assignments: [],
      parseIssues: [{ severity: "error", message: "엑셀 시트를 찾을 수 없습니다." }],
      validationIssues: [],
      teacherCount: 0,
      assignedSlotCount: 0,
    };
  }

  const periods = Array.from({ length: exam.periodCount }, (_, index) => index + 1);
  const { days: layoutDays } = buildTeacherGridLayout(exam, periods);
  if (layoutDays.length === 0) {
    return {
      assignments: [],
      parseIssues: [{ severity: "error", message: "감독 슬롯이 없어 검증할 수 없습니다." }],
      validationIssues: [],
      teacherCount: 0,
      assignedSlotCount: 0,
    };
  }

  verifySheetHeaders(ws, layoutDays, parseIssues);

  const fixedBySlot = new Map(
    exam.assignments.filter((assignment) => assignment.fixed).map((assignment) => [assignment.dutySlotId, assignment]),
  );
  const assignmentsBySlot = new Map<string, Assignment>();
  const slotToTeacher = new Map<string, string>();
  const seenTeachers = new Set<string>();
  let rowNum = TEACHER_GRID_DATA_START;

  while (rowNum <= ws.rowCount) {
    const teacherName = cellText(ws.getCell(rowNum, 1));
    if (!teacherName) break;

    const teacherMatch = findTeachersByName(exam, teacherName);
    if (teacherMatch.issue) {
      parseIssues.push({ ...teacherMatch.issue, row: rowNum, column: 1 });
      rowNum += 1;
      continue;
    }
    const teacherId = teacherMatch.ids[0]!;
    seenTeachers.add(teacherId);

    for (const day of layoutDays) {
      for (const group of day.groups) {
        for (let ci = 0; ci < group.columns.length; ci++) {
          const col = group.columns[ci];
          if (col.isPadding || !col.hasSlots) continue;

          const cell = ws.getCell(rowNum, group.colStart + ci);
          // STEP 12 내보내기: 감독=흰 셀, 정규 수업=노란, 제외=빨강
          if (isClassCell(cell) || isExcludeCell(cell)) continue;

          const roomName = cellText(cell);
          if (!roomName || roomName === "제외") continue;

          const roomMatch = findRoomId(exam, roomName);
          if (roomMatch.issue) {
            parseIssues.push({ ...roomMatch.issue, row: rowNum, column: group.colStart + ci });
            continue;
          }

          const slot = exam.dutySlots.find(
            (item) =>
              item.date === day.date &&
              item.period === col.period &&
              item.dutyTypeId === col.dutyTypeId &&
              item.roomId === roomMatch.roomId,
          );
          if (!slot) {
            parseIssues.push({
              severity: "error",
              message: `${teacherName} · ${day.label} ${col.period}교시 ${col.dutyTypeName} · ${roomName}에 해당하는 감독 슬롯이 없습니다.`,
              row: rowNum,
              column: group.colStart + ci,
            });
            continue;
          }

          const previousTeacherId = slotToTeacher.get(slot.id);
          if (previousTeacherId && previousTeacherId !== teacherId) {
            const previousTeacher = exam.teachers.find((teacher) => teacher.id === previousTeacherId);
            parseIssues.push({
              severity: "error",
              message: `${day.label} ${col.period}교시 ${roomName}(${col.dutyTypeName})에 ${previousTeacher?.name ?? "다른 교사"}와 ${teacherName}이(가) 중복 배정되었습니다.`,
              row: rowNum,
              column: group.colStart + ci,
            });
            continue;
          }

          slotToTeacher.set(slot.id, teacherId);
          const fixed = fixedBySlot.get(slot.id);
          assignmentsBySlot.set(slot.id, {
            id: newId(),
            teacherId,
            dutySlotId: slot.id,
            fixed: fixed?.fixed ?? false,
            fixedReason: fixed?.fixedReason,
          });
        }
      }
    }

    rowNum += 1;
  }

  const headerMismatch = layoutDays.some((day) => {
    const label = cellText(ws.getCell(TEACHER_GRID_DUTY_LABEL_ROW, day.colStart));
    return label && label !== "정" && !day.groups.some((group) => group.columns.some((col) => col.shortLabel === label));
  });
  if (headerMismatch) {
    parseIssues.push({
      severity: "warning",
      message: "감독종류 헤더(정·부·자습)가 변경되었을 수 있습니다. 열 위치가 어긋나면 잘못 읽을 수 있습니다.",
    });
  }

  const assignments = Array.from(assignmentsBySlot.values());
  const validationIssues = hasImportErrors(parseIssues)
    ? []
    : runFullValidation({ ...exam, assignments });

  return {
    assignments,
    parseIssues,
    validationIssues,
    teacherCount: seenTeachers.size,
    assignedSlotCount: assignments.length,
  };
}

function hasImportErrors(issues: TeacherGridImportIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function importHasBlockingIssues(result: TeacherGridImportResult): boolean {
  return hasImportErrors(result.parseIssues) || hasErrors(result.validationIssues);
}
