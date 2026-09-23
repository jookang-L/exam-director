"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { STEPS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/lib/store/examStore";
import { runPreflight, hasErrors } from "@/lib/validation/rules";
import { toast } from "@/components/ui/use-toast";

type Props = {
  examId: string;
  currentPath: string;
};

/** "STEP 3 감독수요" → "감독수요" */
export function stepShortLabel(label: string): string {
  return label.replace(/^STEP \d+\s*/, "");
}

export function Stepper({ examId, currentPath }: Props) {
  const exam = useExamStore((s) => s.exam);
  const wizardSteps = STEPS.filter((s) => s.path !== "");
  const currentIndex = wizardSteps.findIndex((s) => s.path === currentPath);
  const validateIndex = wizardSteps.findIndex((s) => s.path === "validate");

  const handleStepClick = (e: React.MouseEvent, targetIndex: number) => {
    if (!exam || validateIndex < 0 || targetIndex <= validateIndex) return;
    const issues = runPreflight(exam);
    if (hasErrors(issues)) {
      e.preventDefault();
      toast({
        title: "사전 검증 오류",
        description: "STEP 10의 오류를 해결한 후 다음 단계로 이동해주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <nav
      className="step-nav-strip no-print flex items-center gap-2 overflow-x-auto scrollbar-thin border-t px-3 py-2"
      aria-label="진행 단계"
    >
      <Link
        href="/"
        className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        ← 목록
      </Link>
      <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
      <ol className="flex min-w-0 items-center gap-1">
        {wizardSteps.map((step, i) => {
          const isCurrent = step.path === currentPath;
          const isDone = i < currentIndex;
          const short = stepShortLabel(step.label);
          return (
            <li key={step.id} className="shrink-0">
              <Link
                href={`/exam/${examId}/${step.path}`}
                onClick={(e) => handleStepClick(e, i)}
                title={step.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm",
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isDone
                      ? "paper-panel text-foreground ring-1 ring-border hover:bg-accent"
                      : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-xs",
                    isCurrent
                      ? "bg-primary-foreground text-primary"
                      : isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : i + 1}
                </span>
                <span className="max-w-[4.5rem] truncate sm:max-w-none">{short}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
