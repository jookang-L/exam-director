import ExcelJS from "exceljs";
import type { DutySlot, Exam, Grade } from "@/lib/types";
import { classNumbersForRoomId } from "@/lib/roomClassMap";
import { downloadBlob, weekdayKo } from "@/lib/utils";

/**
 * 학교 양식 「정기시험 감독시간표」 엑셀 (날짜별 시트).
 * 열 = 학년별 반·특별실·통합교육실, 행 = 교시 블록(과목 줄 + 정/부 줄).
 *
 * - 열별 음영: 학년 안에서 흰색 | 연한 색 | 흰색 | 연한 색 … 으로 열을 구분한다 (머리글·이름 칸, 파스텔 톤).
 * - 테두리: 기본은 얇은 선, 학년별 바깥은 가장 굵은 선, 정/부 사이는 점선,
 *   과목 줄에 색이 들어가는 칸(교과목·자습·복도)은 중간 굵기 선.
 * - 과목 줄 색: 교과목=진한 남색, 자습·복도=진한 초록 (흰색 글자). 수업은 색 없음.
 * - 과목 줄은 수업/자습/복도만 채우고, 시험 교과명은 비워 둔다 (직접 입력, 남색 칸에 흰 글자로 보인다).
 * - 복도감독은 학년별 반 묶음(HALL_DUTY_GROUPS)으로 과목 줄의 "복도"와 이름 칸을 함께 병합한다.
 *   (한 묶음에 복도감독 이름이 둘 이상이면 이름은 각자의 반 칸에 둔다.)
 */

const FONT = "맑은 고딕";
const GRADES: Grade[] = [1, 2, 3];

/** 양식의 특별실 열 순서 (3학년은 기술실이 맨 뒤) */
const SPECIAL_ORDER = [
  "2층음악실A",
  "2층과학실A",
  "2층과학실C",
  "4층음악실B",
  "4층정보실",
  "영어실",
  "수학실",
  "기술실",
];

/** 학년별 통합교육실 열 이름 (고사실 데이터에는 없어 열만 둔다) */
const INTEGRATED_LABEL: Record<Grade, string> = {
  1: "1층통합교육실",
  2: "2층통합교육실",
  3: "1층통합교육실",
};

/**
 * 복도감독 표시 묶음 (학년별 반 번호).
 * 복도감독이 있으면 과목 줄의 "복도"와 감독 이름 칸을 묶음 전체에 걸쳐 병합한다.
 */
const HALL_DUTY_GROUPS: Record<Grade, number[][]> = {
  1: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11], [12, 13]],
  2: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15]],
  3: [[1, 2, 3, 4], [5, 6, 7], [8, 9], [10, 11], [12, 13]],
};

/** 양식의 열 너비 (이름이 세로쓰기라 반·특별실 열이 모두 좁다) */
const PERIOD_COL_WIDTH = 15.5;
const ROLE_COL_WIDTH = 3.25;
const GRID_COL_WIDTH = 3.25;
const SIDE_COL_WIDTH = 9;

const FIRST_GRID_COL = 3; // A=교시, B=정/부

/** 행 높이: 과목 줄은 수업/자습 줄 높이로 통일, 감독명 줄은 5글자 이름도 여유 있게 고정 */
const LABEL_ROW_HEIGHT = 20.1;
const NAME_ROW_HEIGHT = 100;
const HEADER_ROW_MIN_HEIGHT = 117.75;

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
/** 정/부 두 칸 사이의 구분선 (점선) */
const DOTTED: ExcelJS.Border = { style: "dotted", color: { argb: "FF000000" } };
/** 과목 줄 색칠 칸(교과목·자습·복도)의 테두리 */
const MEDIUM: ExcelJS.Border = { style: "medium", color: { argb: "FF000000" } };
/** 학년별 바깥 테두리 (가장 굵은 선) */
const THICK: ExcelJS.Border = { style: "thick", color: { argb: "FF000000" } };
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * 열별 음영 색 (연한 파스텔). 학년 안에서 두 번째·네 번째… 열에만 칠하고 첫 열부터 흰색 | 색 | 흰색 | 색 으로 번갈아 둔다.
 * 색은 노랑 → 하늘 → 연두 → 살구 → 연보라 → 분홍 순서로 돌려 쓴다.
 */
const COLUMN_PASTELS = ["FFFFF2CC", "FFDDEBF7", "FFE2EFDA", "FFFCE4D6", "FFE4DFEC", "FFFBE5EE"];

/** 과목 줄 색: 교과목=진한 남색, 자습·복도=진한 초록 (글자는 흰색) */
const LABEL_FILL_SUBJECT = "FF1F3864";
const LABEL_FILL_DUTY = "FF375623";
const WHITE = "FFFFFFFF";

type ColKind = "class" | "special" | "integrated";

type GridColumn = {
  grade: Grade;
  kind: ColKind;
  label: string;
  roomId?: string;
  col: number;
  /** 열별 음영 색 (ARGB). 없으면 흰색 */
  fill?: string;
};

type Role = "chief" | "assist" | "study" | "hall";

type CellContent = {
  /** 과목 줄에 적는 글자 (수업·자습·복도). 시험 교과는 비운다. */
  label: string;
  /** 같은 값이 이어지면 과목 줄을 병합한다. 시험 교과는 `exam:교과명`. */
  group: string;
  chief?: string;
  assist?: string;
  /** 자습·복도: 정/부 두 줄을 합쳐 한 칸에 이름 하나 */
  single?: string;
};

export type SupervisionSheetResult = {
  workbook: ExcelJS.Workbook;
  warnings: string[];
};

export function buildSupervisionSheetWorkbook(exam: Exam): SupervisionSheetResult {
  const wb = new ExcelJS.Workbook();
  wb.creator = "설화고 시험감독표";
  wb.created = new Date();
  const warnings: string[] = [];

  const columns = buildColumns(exam, warnings);
  if (columns.length === 0) {
    warnings.push("양식에 맞는 고사실(예: 1-1, 2-3, 2-기술실)이 없어 감독표를 만들 수 없습니다.");
    return { workbook: wb, warnings };
  }
  for (const date of examDates(exam)) {
    buildDateSheet(wb, exam, date, columns, warnings);
  }
  return { workbook: wb, warnings };
}

/** STEP 15 「감독표 양식 맞춰 내보내기」 — 날짜별 시트 엑셀을 내려받는다. 양식에 맞지 않는 항목은 warnings로 돌려준다. */
export async function exportSupervisionSheetWorkbook(exam: Exam): Promise<{ warnings: string[] }> {
  const { workbook, warnings } = buildSupervisionSheetWorkbook(exam);
  if (workbook.worksheets.length === 0) {
    throw new Error(warnings[0] ?? "내보낼 시험 날짜가 없습니다. STEP 2 시험표와 STEP 8 감독 슬롯을 먼저 만들어 주세요.");
  }
  const buf = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${exam.name || "exam"}_감독시간표.xlsx`,
  );
  return { warnings };
}

function examDates(exam: Exam): string[] {
  const dates = new Set<string>();
  for (const s of exam.dutySlots) dates.add(s.date);
  for (const s of exam.examSlots) dates.add(s.date);
  return Array.from(dates).filter(Boolean).sort();
}

function buildColumns(exam: Exam, warnings: string[]): GridColumn[] {
  const cols: GridColumn[] = [];
  let next = FIRST_GRID_COL;

  for (const grade of GRADES) {
    const prefix = `${grade}-`;
    const rooms = exam.rooms.filter((r) => r.name.startsWith(prefix));
    const classRooms = rooms
      .filter((r) => /^\d+$/.test(r.name.slice(prefix.length)))
      .sort((a, b) => Number(a.name.slice(prefix.length)) - Number(b.name.slice(prefix.length)));
    const specialRooms = rooms
      .filter((r) => !/^\d+$/.test(r.name.slice(prefix.length)))
      .sort((a, b) => specialRank(a.name.slice(prefix.length)) - specialRank(b.name.slice(prefix.length)));
    if (classRooms.length + specialRooms.length === 0) continue;

    for (const r of classRooms) {
      cols.push({ grade, kind: "class", label: r.name.slice(prefix.length), roomId: r.id, col: next++ });
    }
    for (const r of specialRooms) {
      cols.push({ grade, kind: "special", label: r.name.slice(prefix.length), roomId: r.id, col: next++ });
    }
    cols.push({ grade, kind: "integrated", label: INTEGRATED_LABEL[grade], col: next++ });

    cols
      .filter((c) => c.grade === grade)
      .forEach((c, i) => {
        if (i % 2 === 1) c.fill = COLUMN_PASTELS[((i - 1) / 2) % COLUMN_PASTELS.length];
      });
  }

  const known = new Set(cols.map((c) => c.roomId).filter(Boolean));
  const skipped = exam.rooms.filter((r) => !known.has(r.id)).map((r) => r.name);
  if (skipped.length) warnings.push(`양식에 열이 없는 고사실 ${skipped.length}곳: ${skipped.join(", ")}`);
  return cols;
}

function specialRank(name: string): number {
  const i = SPECIAL_ORDER.indexOf(name);
  return i >= 0 ? i : SPECIAL_ORDER.length;
}

function dutyRole(dutyTypeName: string): Role {
  if (dutyTypeName === "부감독") return "assist";
  if (dutyTypeName === "자습감독") return "study";
  if (dutyTypeName === "복도감독") return "hall";
  return "chief"; // 정감독·특별실감독·기타
}

function gradeInExamRange(exam: Exam, grade: Grade, date: string): boolean {
  const g = exam.gradeSchedule.find((x) => x.grade === grade);
  if (!g || !g.startDate || !g.endDate) return true;
  return date >= g.startDate && date <= g.endDate;
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}:${m}`;
}

function buildDateSheet(
  wb: ExcelJS.Workbook,
  exam: Exam,
  date: string,
  columns: GridColumn[],
  warnings: string[],
) {
  const [, mm, dd] = date.split("-").map(Number);
  const monthDay = `${mm}.${dd}`;
  const ws = wb.addWorksheet(monthDay);

  let unassigned = 0;
  const nameOf = (slot: DutySlot): string => {
    const a = exam.assignments.find((x) => x.dutySlotId === slot.id);
    const t = a && exam.teachers.find((x) => x.id === a.teacherId);
    if (!t) {
      unassigned++;
      return "(미배정)";
    }
    return t.name;
  };

  const dutyTypeName = new Map(exam.dutyTypes.map((d) => [d.id, d.name]));
  const slotsToday = exam.dutySlots.filter((s) => s.date === date);
  const examsToday = exam.examSlots.filter((s) => s.date === date);
  const lastPeriod = Math.max(
    0,
    ...slotsToday.map((s) => s.period),
    ...examsToday.map((s) => s.period),
  );
  const periods = Array.from({ length: lastPeriod }, (_, i) => i + 1);
  const lastCol = columns[columns.length - 1].col;

  // ── 교시 × 열 내용 계산 ────────────────────────────────────
  const content = new Map<string, CellContent>();
  const key = (p: number, c: GridColumn) => `${p}|${c.col}`;
  for (const p of periods) {
    for (const c of columns) {
      if (c.kind === "integrated" || !c.roomId) continue;
      const roles = new Map<Role, string[]>();
      for (const s of slotsToday) {
        if (s.period !== p || s.roomId !== c.roomId) continue;
        const role = dutyRole(dutyTypeName.get(s.dutyTypeId) ?? "");
        roles.set(role, [...(roles.get(role) ?? []), nameOf(s)]);
      }
      const join = (r: Role) => roles.get(r)?.join(", ");
      const info = classNumbersForRoomId(c.roomId);
      const exams = info
        ? examsToday.filter(
            (e) => e.period === p && e.grade === info.grade && e.classes.some((n) => info.classNums.includes(n)),
          )
        : [];

      const cell: CellContent = { label: "", group: "" };
      if (join("chief") || join("assist")) {
        cell.chief = join("chief");
        cell.assist = join("assist");
        if (join("study") || join("hall")) {
          warnings.push(`${monthDay} ${p}교시 ${c.grade}-${c.label}: 정/부감독과 자습·복도감독이 겹쳐 정/부만 표시`);
        }
      } else if (join("study")) {
        cell.single = join("study");
      } else if (join("hall")) {
        cell.single = join("hall");
      }

      if (exams.length) cell.group = `exam:${exams.map((e) => e.subject).join(",")}`;
      else if (join("study")) Object.assign(cell, { label: "자습", group: "자습" });
      else if (join("hall")) Object.assign(cell, { label: "복도", group: "복도" });
      else if (!gradeInExamRange(exam, c.grade, date)) Object.assign(cell, { label: "수업", group: "수업" });
      content.set(key(p, c), cell);
    }

    // 복도감독: 이름은 그 반 칸에 두고, 과목 줄의 "복도"는 반 묶음 전체로 펼친다 (묶음끼리는 병합하지 않는다)
    for (const c of columns) {
      const x = content.get(key(p, c));
      if (c.kind !== "class" || !x?.single || x.label !== "복도") continue;
      const groups = HALL_DUTY_GROUPS[c.grade];
      const gi = groups.findIndex((g) => g.includes(Number(c.label)));
      if (gi < 0) continue;
      const groupKey = `hall:${c.grade}:${gi}`;
      x.group = groupKey;
      for (const m of columns) {
        if (m.grade !== c.grade || m.kind !== "class" || !groups[gi].includes(Number(m.label))) continue;
        const y = content.get(key(p, m));
        if (y && y.group === "") Object.assign(y, { label: "복도", group: groupKey });
      }
    }

    // 통합교육실 열은 같은 학년의 과목 줄(수업·자습, 학년 전체 시험)을 따라간다
    for (const c of columns) {
      if (c.kind !== "integrated") continue;
      const classCells = columns
        .filter((x) => x.grade === c.grade && x.kind === "class")
        .map((x) => content.get(key(p, x)));
      const cell: CellContent = { label: "", group: "" };
      if (!gradeInExamRange(exam, c.grade, date)) {
        Object.assign(cell, { label: "수업", group: "수업" });
      } else if (c.grade === 1 && classCells.some((x) => x?.group === "자습")) {
        // 자습은 1학년 통합교육실에만 표시한다 (2·3학년 통합교육실은 자습을 적지 않는다)
        Object.assign(cell, { label: "자습", group: "자습" });
      } else {
        const exams = new Set(classCells.map((x) => x?.group).filter((g): g is string => !!g?.startsWith("exam:")));
        if (exams.size === 1) cell.group = [...exams][0];
      }
      content.set(key(p, c), cell);
    }
  }

  if (unassigned > 0) warnings.push(`${monthDay}: 미배정 슬롯 ${unassigned}건 — 감독표에 "(미배정)"으로 표시됩니다`);

  // ── 열 너비 ────────────────────────────────────────────
  ws.getColumn(1).width = PERIOD_COL_WIDTH;
  ws.getColumn(2).width = ROLE_COL_WIDTH;
  for (const c of columns) ws.getColumn(c.col).width = GRID_COL_WIDTH;

  // ── 1행 제목 / 2행 학년 / 3행 반 ─────────────────────────
  const title = `${exam.name || "정기시험"} 감독시간표(${monthDay}. ${weekdayKo(date)}요일)`;
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 27;

  ws.getRow(2).height = 20.1;
  for (const grade of GRADES) {
    const gc = columns.filter((c) => c.grade === grade);
    if (!gc.length) continue;
    ws.mergeCellsWithoutStyle(2, gc[0].col, 2, gc[gc.length - 1].col);
    ws.getCell(2, gc[0].col).value = `${grade}학년`;
    for (const c of gc) {
      const cell = ws.getCell(2, c.col);
      cell.font = { name: FONT, size: 11, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  ws.getRow(3).height = Math.max(
    HEADER_ROW_MIN_HEIGHT,
    ...columns.filter((c) => c.kind !== "class").map((c) => [...c.label].length * 16.8),
  );
  for (const c of columns) {
    const cell = ws.getCell(3, c.col);
    cell.value = c.kind === "class" ? Number(c.label) : c.label;
    cell.font = { name: FONT, size: 11, bold: true };
    cell.alignment =
      c.kind === "class"
        ? { vertical: "middle", horizontal: "center" }
        : { vertical: "middle", horizontal: "center", textRotation: "vertical" };
    if (c.fill) cell.fill = solid(c.fill);
  }

  // ── 교시 블록 ──────────────────────────────────────────
  /** 정/부가 위아래 두 칸으로 나뉜 곳 — 둘 사이 선을 점선으로 바꾼다 */
  const splitPairs: Array<{ r2: number; r3: number; col: number }> = [];
  /** 과목 줄에서 색이 들어간 칸(교과목·자습·복도) — 중간 굵기 테두리를 두른다 */
  const labelBoxes: Array<{ r: number; from: number; to: number }> = [];
  let row = 4;
  for (const p of periods) {
    const r1 = row;
    const r2 = row + 1;
    const r3 = row + 2;
    row += 3;
    ws.getRow(r1).height = LABEL_ROW_HEIGHT;
    ws.getRow(r2).height = NAME_ROW_HEIGHT;
    ws.getRow(r3).height = NAME_ROW_HEIGHT;

    const pt = exam.periodTimes.find((x) => x.period === p);
    const periodText = pt ? `${p}교시\n${timeLabel(pt.start)}~${timeLabel(pt.end)}` : `${p}교시`;
    ws.mergeCellsWithoutStyle(r1, 1, r3, 1);
    const periodCell = ws.getCell(r1, 1);
    periodCell.value = periodText;
    periodCell.font = { name: FONT, size: 12, bold: true };
    periodCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    const twoRowMode = columns.some((c) => {
      const x = content.get(key(p, c));
      return !!(x?.chief || x?.assist);
    });
    if (twoRowMode) {
      splitPairs.push({ r2, r3, col: 2 });
      for (const [r, text] of [[r2, "정"], [r3, "부"]] as const) {
        const c = ws.getCell(r, 2);
        c.value = text;
        c.font = { name: FONT, size: 12, bold: true };
        c.alignment = { horizontal: "center", vertical: "middle" };
      }
    } else {
      ws.mergeCellsWithoutStyle(r2, 2, r3, 2);
      const c = ws.getCell(r2, 2);
      c.value = "정";
      c.font = { name: FONT, size: 12, bold: true };
      c.alignment = { horizontal: "center", vertical: "middle" };
    }

    // 과목 줄: 같은 그룹이 이어지면 학년 안에서 병합 (시험 교과는 글자 없이 병합만)
    const labelGroups = groupLabels(columns, (c) => content.get(key(p, c)));

    // 수업 구간(시험 없는 학년)은 이름 칸을 합친 한 덩어리로 둔다 (통합교육실 칸은 따로)
    const classOff = new Set<number>();
    for (const g of labelGroups) {
      if (g.key !== "수업") continue;
      let to = g.to;
      if (columns[to].kind === "integrated") to -= 1;
      if (to < g.from) continue;
      for (let i = g.from; i <= to; i++) classOff.add(i);
      ws.mergeCellsWithoutStyle(r2, columns[g.from].col, r3, columns[to].col);
    }

    // 복도감독: 묶음 안에 이름이 하나뿐이면 이름 칸도 묶음 전체로 합쳐 표시한다
    for (const g of labelGroups) {
      if (!g.key.startsWith("hall:") || g.to === g.from) continue;
      const named: CellContent[] = [];
      for (let i = g.from; i <= g.to; i++) {
        const x = content.get(key(p, columns[i]));
        if (x?.chief || x?.assist || x?.single) named.push(x);
      }
      if (named.length !== 1 || !named[0].single) continue;
      for (let i = g.from; i <= g.to; i++) classOff.add(i);
      ws.mergeCellsWithoutStyle(r2, columns[g.from].col, r3, columns[g.to].col);
      setNameCell(ws, r2, columns[g.from].col, named[0].single);
    }

    for (const [ci, c] of columns.entries()) {
      if (classOff.has(ci)) continue;
      const x = content.get(key(p, c)) ?? { label: "", group: "" };
      if (twoRowMode && !x.single && c.kind !== "integrated") {
        splitPairs.push({ r2, r3, col: c.col });
        setNameCell(ws, r2, c.col, x.chief, c.fill);
        setNameCell(ws, r3, c.col, x.assist, c.fill);
      } else {
        ws.mergeCellsWithoutStyle(r2, c.col, r3, c.col);
        setNameCell(ws, r2, c.col, x.single, c.fill);
        setNameCell(ws, r3, c.col, undefined, c.fill);
      }
    }

    // 과목 줄: 교과목=남색, 자습·복도=초록 (흰색 글자, 중간 굵기 테두리). 수업·빈 칸은 색 없음.
    for (const g of labelGroups) {
      if (g.to > g.from) ws.mergeCellsWithoutStyle(r1, columns[g.from].col, r1, columns[g.to].col);
      const fill = labelFill(g.key);
      for (let i = g.from; i <= g.to; i++) {
        const cell = ws.getCell(r1, columns[i].col);
        if (i === g.from) cell.value = g.text || undefined;
        cell.font = { name: FONT, size: 12, bold: true, ...(fill ? { color: { argb: WHITE } } : {}) };
        cell.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
        if (fill) cell.fill = solid(fill);
      }
      if (fill) labelBoxes.push({ r: r1, from: columns[g.from].col, to: columns[g.to].col });
    }
  }

  // ── 이름별 감독 횟수 조회 (BK:BL) ─────────────────────────
  const lastRow = row - 1;
  const bk = lastCol + 3;
  for (let c = lastCol + 1; c <= bk + 1; c++) ws.getColumn(c).width = SIDE_COL_WIDTH;
  const range = `$C$2:$${letter(lastCol)}$${lastRow}`;
  const lookup: Array<[number, number, ExcelJS.CellValue]> = [
    [5, bk, "이름"],
    [5, bk + 1, "감독 수"],
    [6, bk, null],
    [6, bk + 1, { formula: `IF($${letter(bk)}$6="","",COUNTIF(${range},"*"&$${letter(bk)}$6&"*"))` }],
  ];
  for (const [r, c, v] of lookup) {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.font = { name: FONT, size: 12, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BOX;
  }

  // ── 테두리 (아래로 갈수록 우선) ─────────────────────────────
  // 이웃한 두 칸이 같은 선을 공유하므로 양쪽 칸에 같은 두께를 지정한다.
  type Side = "top" | "left" | "bottom" | "right";
  const setSide = (r: number, c: number, side: Side, border: ExcelJS.Border) => {
    if (r < 1 || c < 1 || r > lastRow || c > lastCol) return;
    const cell = ws.getCell(r, c);
    cell.border = { ...cell.border, [side]: border };
  };

  // 1) 기본: 모든 칸 얇은 선
  for (let r = 2; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) ws.getCell(r, c).border = BOX;
  }
  // 2) 정/부 위아래 두 칸 사이: 점선
  for (const { r2, r3, col } of splitPairs) {
    setSide(r2, col, "bottom", DOTTED);
    setSide(r3, col, "top", DOTTED);
  }
  // 3) 과목 줄 색칠 칸(교과목·자습·복도): 중간 굵기 테두리
  for (const { r, from, to } of labelBoxes) {
    for (let c = from; c <= to; c++) {
      setSide(r, c, "top", MEDIUM);
      setSide(r - 1, c, "bottom", MEDIUM);
      setSide(r, c, "bottom", MEDIUM);
      setSide(r + 1, c, "top", MEDIUM);
    }
    setSide(r, from, "left", MEDIUM);
    setSide(r, from - 1, "right", MEDIUM);
    setSide(r, to, "right", MEDIUM);
    setSide(r, to + 1, "left", MEDIUM);
  }
  // 4) 교시 칸(A)과 정/부 칸(B) 사이: 중간 굵기
  for (let r = 2; r <= lastRow; r++) {
    setSide(r, 1, "right", MEDIUM);
    setSide(r, 2, "left", MEDIUM);
  }
  setSide(2, 2, "top", MEDIUM);
  setSide(lastRow, 2, "bottom", MEDIUM);
  // 5) 학년별 바깥 테두리: 가장 굵은 선 (학년 머리글 줄부터 마지막 줄까지)
  for (const grade of GRADES) {
    const gc = columns.filter((c) => c.grade === grade);
    if (gc.length === 0) continue;
    const first = gc[0].col;
    const last = gc[gc.length - 1].col;
    for (let r = 2; r <= lastRow; r++) {
      setSide(r, first, "left", THICK);
      setSide(r, first - 1, "right", THICK);
      setSide(r, last, "right", THICK);
      setSide(r, last + 1, "left", THICK);
    }
    for (let c = first; c <= last; c++) {
      setSide(2, c, "top", THICK);
      setSide(lastRow, c, "bottom", THICK);
    }
  }

  // ── 인쇄·보기 설정 ───────────────────────────────────────
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    printArea: `A1:${letter(lastCol)}${lastRow}`,
    margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3, zoomScale: 85 }];
}

type LabelGroup = { from: number; to: number; key: string; text: string };

/** 같은 학년에서 그룹 값이 같고 비어 있지 않은 이웃 열을 묶는다. */
function groupLabels(
  columns: GridColumn[],
  contentOf: (c: GridColumn) => CellContent | undefined,
): LabelGroup[] {
  const groups: LabelGroup[] = [];
  columns.forEach((c, i) => {
    const x = contentOf(c);
    const groupKey = x?.group ?? "";
    const prev = groups[groups.length - 1];
    if (prev && groupKey !== "" && groupKey === prev.key && columns[i - 1].grade === c.grade) {
      prev.to = i;
    } else {
      groups.push({ from: i, to: i, key: groupKey, text: x?.label ?? "" });
    }
  });
  return groups;
}

function setNameCell(
  ws: ExcelJS.Worksheet,
  r: number,
  c: number,
  value: string | undefined,
  fill?: string,
) {
  const cell = ws.getCell(r, c);
  if (value) cell.value = value;
  cell.font = { name: FONT, size: 12, bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle", textRotation: "vertical" };
  if (fill) cell.fill = solid(fill);
}

/** 과목 줄 그룹의 색 — 교과목=진한 남색, 자습·복도=진한 초록, 수업·빈 칸=없음 */
function labelFill(groupKey: string): string | undefined {
  if (groupKey.startsWith("exam:")) return LABEL_FILL_SUBJECT;
  if (groupKey === "자습" || groupKey === "복도" || groupKey.startsWith("hall:")) return LABEL_FILL_DUTY;
  return undefined;
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function letter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}
