"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  rows: (string | number | null)[][];
  maxRows?: number;
  headerRowIndex?: number;
  className?: string;
};

export function SheetPreviewTable({ rows, maxRows = 12, headerRowIndex = 0, className }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>;
  }
  const slice = rows.slice(0, maxRows);
  const maxCols = Math.max(...slice.map((r) => r.length));
  return (
    <div className={cn("overflow-x-auto border rounded-md", className)}>
      <table className="text-xs">
        <thead>
          <tr>
            <th className="border-r border-b p-1 bg-muted text-muted-foreground">#</th>
            {Array.from({ length: maxCols }, (_, i) => (
              <th key={i} className="border-r border-b p-1 bg-muted text-muted-foreground min-w-[80px]">
                {String.fromCharCode(65 + (i % 26))}
                {i >= 26 ? Math.floor(i / 26) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((r, ri) => (
            <tr key={ri} className={cn(ri === headerRowIndex && "bg-amber-50")}>
              <td className="border-r border-b p-1 bg-muted text-muted-foreground">{ri + 1}</td>
              {Array.from({ length: maxCols }, (_, ci) => {
                const v = r[ci];
                return (
                  <td key={ci} className="border-r border-b p-1 whitespace-nowrap">
                    {v === null || v === undefined ? "" : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
