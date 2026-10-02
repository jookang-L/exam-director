"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Exam } from "@/lib/types";
import {
  buildTeacherWorkloadRows,
  sortTeacherWorkloadRows,
  type TeacherWorkloadSortKey,
} from "@/lib/algorithm/teacherWorkloadStats";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{
  key: TeacherWorkloadSortKey;
  label: string;
  align?: "right";
  group?: "duty" | "fatigue";
}> = [
  { key: "name", label: "교사" },
  { key: "totalDutyCount", label: "총감독수", align: "right", group: "duty" },
  { key: "chiefCount", label: "정감독", align: "right", group: "duty" },
  { key: "assistantCount", label: "부감독", align: "right", group: "duty" },
  { key: "selfStudyCount", label: "자습감독", align: "right", group: "duty" },
  { key: "hallCount", label: "복도감독", align: "right", group: "duty" },
  { key: "classBurden", label: "수업", align: "right", group: "duty" },
  { key: "totalFatigue", label: "총 누적도", align: "right", group: "fatigue" },
  { key: "currentExamFatigue", label: "현재시험", align: "right", group: "fatigue" },
  { key: "previousCarriedFatigue", label: "이전시험", align: "right", group: "fatigue" },
];

const GROUP_CELL: Record<"duty" | "fatigue", string> = {
  duty: "bg-sky-50/90 dark:bg-sky-950/40",
  fatigue: "bg-amber-50/80 dark:bg-amber-950/30",
};

function groupCellClass(col: (typeof COLUMNS)[number], isFirstInGroup: boolean) {
  if (!col.group) return "";
  return cn(GROUP_CELL[col.group], isFirstInGroup && "border-l-2 border-border");
}

function getCellValue(row: ReturnType<typeof buildTeacherWorkloadRows>[number], key: TeacherWorkloadSortKey): string | number {
  if (key === "name") return row.teacher.name;
  if (key === "totalDutyCount") return row.totalDutyCount;
  if (key === "chiefCount") return row.chiefCount;
  if (key === "assistantCount") return row.assistantCount;
  if (key === "selfStudyCount") return row.selfStudyCount;
  if (key === "hallCount") return row.hallCount;
  return row[key].toFixed(1);
}

function SortHeader({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "right";
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 hover:text-foreground text-muted-foreground font-medium",
        align === "right" ? "justify-end" : "justify-start",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </button>
  );
}

export function TeacherWorkloadTable({ exam }: { exam: Exam }) {
  const [sortKey, setSortKey] = React.useState<TeacherWorkloadSortKey>("totalFatigue");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const built = buildTeacherWorkloadRows(exam);
    return sortTeacherWorkloadRows(built, sortKey, sortDir);
  }, [exam, sortKey, sortDir]);

  const visibleRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.teacher.name.toLowerCase().includes(q));
  }, [rows, query]);

  const toggleSort = (key: TeacherWorkloadSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const isFirstInGroup = (i: number) => {
    const col = COLUMNS[i];
    if (!col.group) return false;
    return COLUMNS[i - 1]?.group !== col.group;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 mb-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="교사명 검색"
          className="h-8 max-w-xs"
        />
        {query.trim() ? (
          <span className="text-xs text-muted-foreground">
            {visibleRows.length}/{rows.length}명
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto border rounded-md">
        <table className="w-full min-w-[960px] text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="p-1.5 px-2 font-normal text-left bg-muted/50" />
              <th
                className={cn("p-1.5 px-2 font-normal text-center", GROUP_CELL.duty, "border-l-2 border-border")}
                colSpan={6}
              >
                감독 · 수업
              </th>
              <th
                className={cn("p-1.5 px-2 font-normal text-center", GROUP_CELL.fatigue, "border-l-2 border-border")}
                colSpan={3}
              >
                누적도 (이전×이월 + 현재시험)
              </th>
            </tr>
            <tr className="border-b text-left bg-muted/50">
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={cn(
                    "p-2 whitespace-nowrap",
                    col.align === "right" && "text-right",
                    groupCellClass(col, isFirstInGroup(i)),
                  )}
                >
                  <SortHeader
                    label={col.label}
                    active={sortKey === col.key}
                    dir={sortDir}
                    align={col.align}
                    onClick={() => toggleSort(col.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.teacher.id} className="border-t hover:bg-muted/15">
                {COLUMNS.map((col, i) => {
                  const cellClass = cn(
                    "p-2",
                    col.align === "right" && "text-right tabular-nums",
                    groupCellClass(col, isFirstInGroup(i)),
                    col.key === "totalFatigue" && "font-semibold font-mono",
                    col.group === "fatigue" && col.key !== "totalFatigue" && "font-mono",
                    col.key === "classBurden" && "font-mono",
                  );

                  if (col.key === "name") {
                    return (
                      <td key={col.key} className={cellClass}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                              {row.teacher.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">{row.teacher.subject || "교과 미입력"}</TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  }

                  const value = getCellValue(row, col.key);
                  return (
                    <td key={col.key} className={cellClass}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="p-4 text-center text-muted-foreground">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
