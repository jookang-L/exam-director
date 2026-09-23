"use client";

import * as React from "react";
import type { Grade } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  REGULAR_CLASS_MAX,
  classButtonTooltip,
  formatClassesDisplay,
  parseClassesDisplayInput,
  specialClassLabel,
  specialClassNumbers,
} from "@/lib/roomClassMap";

type Props = {
  grade: Grade;
  classesText: string;
  onChange: (text: string) => void;
};

export function ClassPicker({ grade, classesText, onChange }: Props) {
  const selected = React.useMemo(
    () => new Set(parseClassesDisplayInput(grade, classesText)),
    [grade, classesText],
  );
  const regularMax = REGULAR_CLASS_MAX[grade];
  const specials = specialClassNumbers(grade);

  const applySelection = (nums: number[]) => {
    onChange(formatClassesDisplay(grade, nums));
  };

  const toggle = (n: number) => {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    applySelection(Array.from(next).sort((a, b) => a - b));
  };

  const renderRegularButton = (n: number) => (
    <Tooltip key={n}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={selected.has(n) ? "default" : "outline"}
          size="sm"
          className="h-7 min-w-[2rem] px-2 text-xs"
          onClick={() => toggle(n)}
        >
          {n}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{classButtonTooltip(grade, n)}</TooltipContent>
    </Tooltip>
  );

  const renderSpecialButton = (n: number) => {
    const label = specialClassLabel(grade, n) ?? String(n);
    return (
      <Tooltip key={n}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={selected.has(n) ? "default" : "outline"}
            size="sm"
            className="h-auto min-h-7 border-dashed px-2 py-1 text-[11px] leading-tight"
            onClick={() => toggle(n)}
          >
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{classButtonTooltip(grade, n)}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            시험반 선택 — 일반반은 번호, 특별실은 이름으로 표시됩니다
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                applySelection(Array.from({ length: regularMax }, (_, i) => i + 1))
              }
            >
              일반반 전체
            </Button>
            {specials.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const next = new Set(selected);
                  for (const n of specials) next.add(n);
                  applySelection(Array.from(next).sort((a, b) => a - b));
                }}
              >
                특별실 전체
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange("")}
            >
              초기화
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: regularMax }, (_, i) => renderRegularButton(i + 1))}
        </div>
        {specials.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">특별실</p>
            <div className="flex flex-wrap gap-1">
              {specials.map((n) => renderSpecialButton(n))}
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
};
