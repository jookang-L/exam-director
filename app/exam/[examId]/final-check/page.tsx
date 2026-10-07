"use client";

import * as React from "react";
import { useExam } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { FinalRuleChecklistTable } from "@/components/FinalRuleChecklistTable";
import { FinalFatigueSummary } from "@/components/FinalFatigueSummary";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  evaluateRuleChecklist,
  summarizeChecklist,
  type RuleChecklistItem,
  type RuleFailure,
} from "@/lib/validation/ruleChecklist";
import {
  loadAcknowledgedWarningKeys,
  saveAcknowledgedWarningKeys,
} from "@/lib/validation/acknowledgedWarnings";
import {
  computeAverageTotalFatigue,
  computeCurrentExamFatigue,
} from "@/lib/algorithm/averageFatigue";
import { toast } from "@/components/ui/use-toast";

const CONFIRM_PREVIEW_LIMIT = 3;

export default function FinalCheckPage() {
  const exam = useExam();
  const [acknowledgedKeys, setAcknowledgedKeys] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if (!exam) return;
    setAcknowledgedKeys(loadAcknowledgedWarningKeys(exam.id));
  }, [exam?.id]);

  const checklist = React.useMemo(
    () => (exam ? evaluateRuleChecklist(exam, exam.assignments) : []),
    [exam],
  );
  const totalFatigue = React.useMemo(() => (exam ? computeAverageTotalFatigue(exam) : null), [exam]);
  const currentFatigue = React.useMemo(
    () => (exam ? computeCurrentExamFatigue(exam) : null),
    [exam],
  );

  if (!exam || !totalFatigue || !currentFatigue) return null;

  const summary = summarizeChecklist(checklist, acknowledgedKeys);

  const updateAcknowledged = (change: (next: Set<string>) => void) => {
    const next = new Set(acknowledgedKeys);
    change(next);
    setAcknowledgedKeys(next);
    try {
      saveAcknowledgedWarningKeys(exam.id, next);
    } catch {
      toast({
        title: "확인 내용을 저장하지 못했습니다",
        description: "이 화면에서는 유지되지만 새로고침하면 사라질 수 있습니다.",
        variant: "destructive",
      });
    }
  };

  const acknowledge = (item: RuleChecklistItem, failures: RuleFailure[]) => {
    const preview = failures.slice(0, CONFIRM_PREVIEW_LIMIT).map((f) => `· ${f.message}`);
    const ok = window.confirm(
      [
        `${item.required ? "필수 규칙 " : ""}${item.label}의 위반 ${failures.length}건을 확인 처리합니다.`,
        "",
        ...preview,
        failures.length > CONFIRM_PREVIEW_LIMIT
          ? `· 외 ${failures.length - CONFIRM_PREVIEW_LIMIT}건`
          : "",
        "",
        "의도한 예외일 때만 확인하세요. 확인하면 통과로 표시되고,",
        "STEP 12·13에서도 같은 항목은 확인된 것으로 취급됩니다.",
      ]
        .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
        .join("\n"),
    );
    if (!ok) return;
    updateAcknowledged((next) => failures.forEach((f) => next.add(f.key)));
    toast({ title: `${item.label} ${failures.length}건을 확인 처리했습니다` });
  };

  const revoke = (item: RuleChecklistItem, failures: RuleFailure[]) => {
    updateAcknowledged((next) => failures.forEach((f) => next.delete(f.key)));
    toast({ title: `${item.label} 확인을 취소했습니다` });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 14 — 최종 검토</h1>
        <p className="text-sm text-muted-foreground">
          현재 저장된 배정을 필수 규칙, STEP 7 감독지정/제외, STEP 9 우선/고정 기준으로 모두
          점검합니다. 필수 규칙이라도 의도한 예외라면 <strong>확인</strong>을 눌러 통과로 처리할 수
          있습니다.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            규칙 점검
            {summary.requiredFailed > 0 ? (
              <Badge variant="destructive" className="font-normal">
                필수 규칙 미통과 {summary.requiredFailed}건
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal border-emerald-300 text-emerald-700">
                필수 규칙 통과
              </Badge>
            )}
            {summary.warnings > 0 ? (
              <Badge variant="warning" className="font-normal">
                경고 {summary.warnings}건
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>앱에 저장된 배정 기준 (STEP 12에서 수정한 내용)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FinalRuleChecklistTable
            items={checklist}
            acknowledgedKeys={acknowledgedKeys}
            onAcknowledge={acknowledge}
            onRevoke={revoke}
          />
          {summary.requiredFailed > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                미통과 항목은 STEP 12에서 수정하거나, 의도한 예외라면 「확인」을 눌러 통과 처리하세요.
              </span>
            </div>
          ) : summary.warnings > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>필수 규칙은 통과했습니다. 경고 {summary.warnings}건을 확인하세요.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                모든 항목을 통과했습니다
                {summary.acknowledged > 0 ? ` (확인 처리 ${summary.acknowledged}건 포함)` : ""}.
                STEP 15에서 출력하세요.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">최종 곤란도 결과</CardTitle>
          <CardDescription>현재 저장된 배정 기준 평균·최고·최저</CardDescription>
        </CardHeader>
        <CardContent>
          <FinalFatigueSummary total={totalFatigue} current={currentFatigue} />
        </CardContent>
      </Card>

      <StepNavButtons currentPath="final-check" />
    </div>
  );
}
