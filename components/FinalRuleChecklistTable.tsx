"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  resolveChecklistItem,
  summarizeChecklist,
  type ChecklistItemState,
  type RuleChecklistItem,
  type RuleFailure,
} from "@/lib/validation/ruleChecklist";
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";

const VISIBLE_FAILURE_LIMIT = 5;

type Props = {
  items: RuleChecklistItem[];
  /** 사용자가 「확인」으로 통과 처리한 위반 키 */
  acknowledgedKeys: ReadonlySet<string>;
  onAcknowledge: (item: RuleChecklistItem, failures: RuleFailure[]) => void;
  onRevoke: (item: RuleChecklistItem, failures: RuleFailure[]) => void;
  className?: string;
};

export function FinalRuleChecklistTable({
  items,
  acknowledgedKeys,
  onAcknowledge,
  onRevoke,
  className,
}: Props) {
  const summary = summarizeChecklist(items, acknowledgedKeys);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={className}>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium w-28">통과여부</th>
                <th className="px-3 py-2 text-left font-medium w-28">규칙항목</th>
                <th className="px-3 py-2 text-left font-medium">규칙내용</th>
                <th className="px-3 py-2 text-right font-medium w-28">확인</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const state = resolveChecklistItem(item, acknowledgedKeys);
                return (
                  <tr key={item.code} className="border-b last:border-b-0 align-top">
                    <td className="px-3 py-2">
                      <StatusBadge state={state} />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                      {item.label}
                    </td>
                    <td className="px-3 py-2">
                      <p>{item.description}</p>
                      {state.pending.length > 0 ? (
                        <FailureList failures={state.pending} />
                      ) : null}
                      {state.acknowledged.length > 0 ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          확인 처리됨 {state.acknowledged.length}건
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {state.pending.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAcknowledge(item, state.pending)}
                        >
                          확인
                        </Button>
                      ) : state.acknowledged.length > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => onRevoke(item, state.acknowledged)}
                        >
                          확인 취소
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          필수 규칙 미통과 {summary.requiredFailed}건
          {summary.warnings > 0 ? ` · 경고 ${summary.warnings}건` : ""}
          {summary.acknowledged > 0 ? ` · 확인 처리 ${summary.acknowledged}건` : ""}
        </p>
      </div>
    </TooltipProvider>
  );
}

function FailureList({ failures }: { failures: RuleFailure[] }) {
  const visible = failures.slice(0, VISIBLE_FAILURE_LIMIT);
  const hiddenCount = failures.length - visible.length;

  return (
    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
      {visible.map((failure) => (
        <li key={failure.key}>{failure.message}</li>
      ))}
      {hiddenCount > 0 ? (
        <li className="list-none -ml-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-help text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                외 {hiddenCount}건 · 마우스를 올리면 전체 {failures.length}건
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="start"
              className="max-w-lg max-h-80 overflow-y-auto p-3 text-left whitespace-normal"
            >
              <p className="font-semibold mb-2">위반 {failures.length}건 전체</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {failures.map((failure) => (
                  <li key={`all-${failure.key}`} className="leading-snug">
                    {failure.message}
                  </li>
                ))}
              </ol>
            </TooltipContent>
          </Tooltip>
        </li>
      ) : null}
    </ul>
  );
}

function StatusBadge({ state }: { state: ChecklistItemState }) {
  switch (state.status) {
    case "passed":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">통과</span>
        </span>
      );
    case "acknowledged":
      return (
        <span className="inline-flex items-center gap-1 text-sky-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="font-medium">확인됨</span>
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <Badge variant="warning" className="font-normal">
            경고
          </Badge>
        </span>
      );
    default:
      return (
        <span className={cn("inline-flex items-center gap-1 text-destructive")}>
          <XCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">미통과</span>
        </span>
      );
  }
}
