"use client";

import * as React from "react";
import type ExcelJS from "exceljs";
import type { Exam } from "@/lib/types";
import { buildSupervisionSheetWorkbook } from "@/lib/io/supervisionSheetExcel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * STEP 15 미리보기 — 「감독표 양식 맞춰 내보내기」 엑셀과 같은 시트를 그대로 읽어 표로 그린다.
 * 엑셀 생성 코드(supervisionSheetExcel.ts)가 만든 병합·테두리·열 너비·행 높이를 그대로 따르므로
 * 미리보기와 다운로드 파일의 양식이 어긋나지 않는다.
 */

const PX_PER_CHAR = 7; // 엑셀 열 너비 1 ≈ 7px (+5px 여백)
const PT_TO_PX = 96 / 72;

type Range = { top: number; left: number; bottom: number; right: number };

type PreviewCell = {
  key: string;
  rowSpan: number;
  colSpan: number;
  text: string;
  vertical: boolean;
  style: React.CSSProperties;
};

type PreviewSheet = {
  name: string;
  label: string;
  width: number;
  height: number;
  colWidths: number[];
  rows: Array<{ key: number; height: number; cells: PreviewCell[] }>;
};

function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(a1: string): Range | null {
  const m = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) return null;
  const left = colNumber(m[1]);
  const top = Number(m[2]);
  return { left, top, right: m[3] ? colNumber(m[3]) : left, bottom: m[4] ? Number(m[4]) : top };
}

function borderCss(b?: Partial<ExcelJS.Border>): string {
  if (!b?.style) return "none";
  return b.style === "dotted" ? "1px dotted #000" : "1px solid #000";
}

/** 12pt 굵은 글씨 기준 대략의 가로 길이(px): 한글 16, 영문·숫자 9, 공백 5 */
function textWidthPx(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code === 32 ? 5 : code < 0x2000 ? 9 : 16;
  }
  return w;
}

function toPreviewSheet(ws: ExcelJS.Worksheet): PreviewSheet {
  const area = parseRange(ws.pageSetup.printArea ?? "") ?? {
    top: 1,
    left: 1,
    bottom: ws.rowCount,
    right: ws.columnCount,
  };
  const lastRow = area.bottom;
  const lastCol = area.right;

  const merges = ((ws.model as unknown as { merges?: string[] }).merges ?? [])
    .map(parseRange)
    .filter((r): r is Range => r !== null);
  const masterAt = new Map<string, Range>();
  const covered = new Set<string>();
  for (const m of merges) {
    masterAt.set(`${m.top},${m.left}`, m);
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (r !== m.top || c !== m.left) covered.add(`${r},${c}`);
      }
    }
  }

  const colWidths = Array.from({ length: lastCol }, (_, i) =>
    Math.round((ws.getColumn(i + 1).width ?? 8.43) * PX_PER_CHAR + 5),
  );

  const rows: PreviewSheet["rows"] = [];
  let height = 0;
  for (let r = 1; r <= lastRow; r++) {
    const rowHeight = Math.round((ws.getRow(r).height ?? 15) * PT_TO_PX);
    height += rowHeight;
    const cells: PreviewCell[] = [];
    for (let c = 1; c <= lastCol; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const m = masterAt.get(`${r},${c}`);
      const r2 = m?.bottom ?? r;
      const c2 = m?.right ?? c;
      const cell = ws.getCell(r, c);
      const value = cell.value;
      const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

      const align = cell.alignment ?? {};
      const vertical = align.textRotation === "vertical" || align.textRotation === 255;
      const fontPx = (cell.font?.size ?? 11) * PT_TO_PX;
      let fontSize = fontPx;
      if (align.shrinkToFit && text) {
        const avail = colWidths.slice(c - 1, c2).reduce((a, b) => a + b, 0) - 6;
        const need = textWidthPx(text) * (fontPx / 16);
        if (need > avail) fontSize = Math.max(7, fontPx * (avail / need));
      }

      cells.push({
        key: `${r},${c}`,
        rowSpan: r2 - r + 1,
        colSpan: c2 - c + 1,
        text,
        vertical,
        style: {
          borderTop: borderCss(cell.border?.top),
          borderLeft: borderCss(cell.border?.left),
          borderRight: borderCss(ws.getCell(r, c2).border?.right),
          borderBottom: borderCss(ws.getCell(r2, c).border?.bottom),
          fontSize,
          fontWeight: cell.font?.bold ? 700 : 400,
          textAlign: align.horizontal === "center" ? "center" : "left",
          verticalAlign: "middle",
          whiteSpace: align.wrapText ? "pre-line" : "nowrap",
          padding: 0,
          overflow: "hidden",
        },
      });
    }
    rows.push({ key: r, height: rowHeight, cells });
  }

  const title = ws.getCell(1, 1).value;
  const label = typeof title === "string" ? (title.match(/\(([^)]+)\)\s*$/)?.[1] ?? ws.name) : ws.name;
  return {
    name: ws.name,
    label,
    width: colWidths.reduce((a, b) => a + b, 0),
    height,
    colWidths,
    rows,
  };
}

function SheetTable({ sheet }: { sheet: PreviewSheet }) {
  return (
    <table
      className="bg-white text-black"
      style={{ borderCollapse: "collapse", tableLayout: "fixed", width: sheet.width }}
    >
      <colgroup>
        {sheet.colWidths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        {sheet.rows.map((row) => (
          <tr key={row.key} style={{ height: row.height }}>
            {row.cells.map((cell) => (
              <td key={cell.key} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={cell.style}>
                {cell.vertical && cell.text ? (
                  <div
                    style={{
                      writingMode: "vertical-rl",
                      textOrientation: "upright",
                      margin: "0 auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cell.text}
                  </div>
                ) : (
                  cell.text
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SupervisionSheetPreview({ exam }: { exam: Exam }) {
  const built = React.useMemo(() => buildSupervisionSheetWorkbook(exam), [exam]);
  const sheets = React.useMemo(() => built.workbook.worksheets.map(toPreviewSheet), [built]);

  const [activeName, setActiveName] = React.useState<string | null>(null);
  const [fit, setFit] = React.useState(true);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = React.useState(0);

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheets.length]);

  if (sheets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {built.warnings[0] ?? "미리볼 감독표가 없습니다. STEP 2 시험표와 STEP 8 감독 슬롯을 먼저 만들어 주세요."}
      </p>
    );
  }

  const current = sheets.find((s) => s.name === activeName) ?? sheets[0];
  const scale = fit && boxWidth > 0 ? Math.min(1, boxWidth / current.width) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={current.name} onValueChange={setActiveName}>
          <TabsList className="h-auto flex-wrap justify-start">
            {sheets.map((s) => (
              <TabsTrigger key={s.name} value={s.name}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => setFit((v) => !v)}>
          {fit ? "원본 크기로 보기" : "화면 너비에 맞추기"}
        </Button>
      </div>

      <div
        ref={boxRef}
        className={cn("rounded-md border bg-white", fit ? "overflow-hidden" : "overflow-x-auto")}
      >
        <div style={{ width: current.width * scale, height: current.height * scale }}>
          <div style={{ width: current.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <SheetTable sheet={current} />
          </div>
        </div>
      </div>

      {built.warnings.length > 0 && (
        <div className="rounded-md border border-warning/60 bg-warning/10 p-3 text-sm">
          <p className="font-medium">양식에 맞지 않는 항목 {built.warnings.length}건</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {built.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {built.warnings.length > 8 && (
            <p className="mt-1 text-muted-foreground">… 외 {built.warnings.length - 8}건</p>
          )}
        </div>
      )}
    </div>
  );
}
