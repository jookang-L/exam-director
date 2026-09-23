"use client";

import { cn } from "@/lib/utils";
import type { RuleChecklistItem } from "@/lib/validation/ruleChecklist";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const VISIBLE_FAILURE_LIMIT = 5;

type Props = {
  items: RuleChecklistItem[];
  title?: string;
  description?: string;
  className?: string;
  /** C2 미통과를 사용자가 「넘어가기」로 확인한 경우 */
  c2Acknowledged?: boolean;
};

export function FinalRuleChecklistTable({
  items,
  title,
  description,
  className,
  c2Acknowledged = false,
}: Props) {
  const requiredFailed = items.filter((item) => item.required && !item.passed).length;
  const c2Failed = items.find((item) => item.code === "C2" && !item.passed);
  const c2Pending = c2Failed != null && !c2Acknowledged;
  const optionalFailed = items.filter((item) => {
    if (item.passed) return false;
    if (item.code === "C2") return c2Acknowledged;
    return !item.required;
  }).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={className}>
        {title ? <h3 className="text-sm font-semibold mb-1">{title}</h3> : null}
        {description ? (
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
        ) : null}
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium w-28">통과여부</th>
                <th className="px-3 py-2 text-left font-medium w-20">규칙항목</th>
                <th className="px-3 py-2 text-left font-medium">규칙내용</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.code} className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <StatusBadge item={item} c2Acknowledged={c2Acknowledged} />
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">{item.label}</td>
                  <td className="px-3 py-2">
                    <p>{item.description}</p>
                    {item.failures.length > 0 ? <FailureList failures={item.failures} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          필수 규칙 미통과 {requiredFailed}건
          {c2Pending ? ` · C2 미통과 ${c2Failed.failures.length}건 (넘어가기 필요)` : ""}
          {optionalFailed > 0 ? ` · 경고 ${optionalFailed}건` : ""}
        </p>
      </div>
    </TooltipProvider>
  );
}

function FailureList({ failures }: { failures: string[] }) {
  const visible = failures.slice(0, VISIBLE_FAILURE_LIMIT);
  const hiddenCount = failures.length - visible.length;

  return (
    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
      {visible.map((msg, index) => (
        <li key={`${index}-${msg}`}>{msg}</li>
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
                {failures.map((msg, index) => (
                  <li key={`all-${index}-${msg}`} className="leading-snug">
                    {msg}
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

function StatusBadge({
  item,
  c2Acknowledged,
}: {
  item: RuleChecklistItem;
  c2Acknowledged: boolean;
}) {
  if (item.passed) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">통과</span>
      </span>
    );
  }

  if (item.code === "C2" && !c2Acknowledged) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-destructive")}>
        <XCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">미통과</span>
      </span>
    );
  }

  if (!item.required || (item.code === "C2" && c2Acknowledged)) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <Badge variant="warning" className="font-normal">
          경고
        </Badge>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-destructive")}>
      <XCircle className="h-4 w-4 shrink-0" />
      <span className="font-medium">미통과</span>
    </span>
  );
}
