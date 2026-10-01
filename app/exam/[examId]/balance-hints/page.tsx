"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Shuffle } from "lucide-react";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import {
  buildBalanceHintExam,
  findBalanceHintSuggestions,
  hasThreeDutyDayWithoutSelfStudy,
  MAX_BALANCE_HINT_SUGGESTIONS,
  type BalanceHintSuggestion,
} from "@/lib/algorithm/balanceHints";
import type { ValidationIssue } from "@/lib/types";
import { runFullValidation } from "@/lib/validation/rules";
import {
  isAcknowledgedWarning,
  loadAcknowledgedWarningKeys,
} from "@/lib/validation/acknowledgedWarnings";
import { toast } from "@/components/ui/use-toast";
import { shortDate } from "@/lib/utils";

export default function BalanceHintsPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [applyCount, setApplyCount] = React.useState(0);
  const [suggestions, setSuggestions] = React.useState<BalanceHintSuggestion[]>([]);
  const [calculating, setCalculating] = React.useState(false);
  const [acknowledgedWarningKeys, setAcknowledgedWarningKeys] = React.useState<Set<string>>(
    () => new Set(),
  );

  const currentIssues = React.useMemo(() => (exam ? runFullValidation(exam) : []), [exam]);
  const currentErrors = currentIssues.filter((issue) => issue.severity === "error");

  React.useEffect(() => {
    if (!exam) return;
    setAcknowledgedWarningKeys(loadAcknowledgedWarningKeys(exam.id));
  }, [exam?.id]);

  React.useEffect(() => {
    if (!exam) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setCalculating(true);
    setSuggestions([]);
    const timer = window.setTimeout(() => {
      const next = findBalanceHintSuggestions(exam);
      if (!cancelled) {
        setSuggestions(next);
        setCalculating(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [exam]);

  if (!exam) return null;

  const applySuggestion = (suggestion: BalanceHintSuggestion) => {
    const nextExam = buildBalanceHintExam(exam, suggestion);
    const issues = runFullValidation(nextExam);
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter(
      (issue) => issue.severity === "warning" && !isAcknowledgedWarning(issue, acknowledgedWarningKeys),
    );

    if (errors.length > 0) {
      toast({
        title: "추천을 적용할 수 없습니다",
        description: "적용 직전 전체 규칙 검증에서 오류가 발견되었습니다.",
        variant: "destructive",
      });
      return;
    }

    if (hasThreeDutyDayWithoutSelfStudy(nextExam)) {
      toast({
        title: "추천을 적용할 수 없습니다",
        description: "하루 3교시 감독인데 자습감독이 없는 배정은 허용하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (
      warnings.length > 0 &&
      !confirm(`경고 ${warnings.length}건이 있습니다. 그래도 이 추천을 적용할까요?`)
    ) {
      return;
    }

    m.replaceAssignments(nextExam.assignments);
    setApplyCount((count) => count + 1);
    toast({
      title: "균형 힌트를 적용했습니다",
      description: "현재 감독표 기준으로 추천 목록을 다시 계산합니다.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">STEP 13 — 감독 균형 힌트</h1>
          <p className="text-sm text-muted-foreground">
            정+부 편차를 1 이내로 유지하면서 맞교환 또는 자습감독 넘기기로 쏠림을 낮출 수 있는지 점검합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={currentErrors.length > 0 ? "destructive" : "success"}>
            현재 오류 {currentErrors.length}
          </Badge>
          <Badge variant="outline">
            {calculating
              ? "추천 계산 중"
              : suggestions.length >= MAX_BALANCE_HINT_SUGGESTIONS
                ? `상위 ${MAX_BALANCE_HINT_SUGGESTIONS}개 표시`
                : `현재 추천 ${suggestions.length}개`}
          </Badge>
          {applyCount > 0 ? <Badge variant="success">적용 후 재계산 {applyCount}회</Badge> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            추천 기준
          </CardTitle>
          <CardDescription>
            강사·영양교사·평가담당과 STEP9 우선/고정 배정은 건드리지 않습니다. 후보마다 전체 규칙을 다시 검사하고,
            오류가 없는 추천만 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <RulePill label="같은 날짜·교시" />
            <RulePill label="정/부 ↔ 자습 또는 자습 넘기기" />
            <RulePill label="정+부 편차 1 이내" />
            <RulePill label="오류 0건만 추천" />
          </div>
          {currentErrors.length > 0 ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              현재 감독표에 오류가 있어 추천을 만들지 않았습니다. STEP12에서 오류를 먼저 해결해주세요.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {calculating ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            현재 감독표 기준으로 규칙을 검증하며 추천을 계산하고 있습니다.
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {currentErrors.length > 0
              ? "현재 오류가 없어지면 다시 추천을 계산합니다."
              : "현재 조건에서 규칙을 모두 지키며 정+부/자습 균형을 개선하는 추천안을 찾지 못했습니다."}
          </div>
        ) : (
          suggestions.map((suggestion, index) => (
            <SuggestionPanel
              key={suggestion.id}
              suggestion={suggestion}
              index={index}
              acknowledgedWarningKeys={acknowledgedWarningKeys}
              onApply={() => applySuggestion(suggestion)}
            />
          ))
        )}
      </div>

      <StepNavButtons currentPath="balance-hints" />
    </div>
  );
}

function RulePill({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      <span>{label}</span>
    </div>
  );
}

function SuggestionPanel({
  suggestion,
  index,
  acknowledgedWarningKeys,
  onApply,
}: {
  suggestion: BalanceHintSuggestion;
  index: number;
  acknowledgedWarningKeys: Set<string>;
  onApply: () => void;
}) {
  const visibleSuggestionWarnings = suggestion.warnings.filter(
    (warning) => !isAcknowledgedWarning(warning, acknowledgedWarningKeys),
  );
  const warningCount = visibleSuggestionWarnings.length;
  const sortedWarnings = React.useMemo(
    () => sortWarningsForDisplay(visibleSuggestionWarnings),
    [visibleSuggestionWarnings],
  );
  const visibleWarnings = sortedWarnings.slice(0, 5);
  const hiddenWarnings = sortedWarnings.slice(5);
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">추천 {index + 1}</Badge>
            <Badge variant="outline">
              {suggestion.kind === "swap" ? "맞교환" : "자습 넘기기"}
            </Badge>
            <Badge variant={warningCount > 0 ? "warning" : "success"}>
              {warningCount > 0 ? `주의 · 경고 ${warningCount}건` : "규칙 검증 통과"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {shortDate(suggestion.date)} {suggestion.period}교시
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TeacherSwapText suggestion={suggestion} />
          </div>
        </div>
        <Button onClick={onApply} className="shrink-0">
          <Shuffle className="mr-2 h-4 w-4" />
          {suggestion.kind === "swap" ? "교환 적용" : "자습 넘기기"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <TeacherChange
          title={suggestion.hardTeacherName}
          before={suggestion.hardTeacherBefore}
          after={suggestion.hardTeacherAfter}
        />
        <TeacherChange
          title={suggestion.selfStudyTeacherName}
          before={suggestion.selfStudyTeacherBefore}
          after={suggestion.selfStudyTeacherAfter}
        />
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <Metric label="정+부 편차" before={suggestion.before.hardSpread} after={suggestion.after.hardSpread} />
        <Metric
          label="자습 편차"
          before={suggestion.before.selfStudySpread}
          after={suggestion.after.selfStudySpread}
        />
        <Metric
          label="전체 총피로도 편차"
          before={suggestion.before.totalFatigueSpread}
          after={suggestion.after.totalFatigueSpread}
          title="통계 대상 전체 교사 중 총피로도 최고점과 최저점의 차이입니다."
        />
      </div>

      {warningCount > 0 ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            적용 가능하지만 확인할 경고가 있습니다
          </div>
          <ul className="space-y-1">
            {visibleWarnings.map((warning) => (
              <li key={warning.id}>· {warning.message}</li>
            ))}
            {hiddenWarnings.length > 0 ? (
              <li>
                ·{" "}
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded px-1 font-medium underline decoration-amber-700/50 underline-offset-2 hover:bg-amber-100"
                      >
                        외 {hiddenWarnings.length}건
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-[42rem] bg-amber-950 px-3 py-2 text-left text-amber-50"
                    >
                      <div className="max-h-80 overflow-auto">
                        <div className="mb-1 font-semibold">숨긴 경고</div>
                        <ol className="space-y-1">
                          {hiddenWarnings.map((warning) => (
                            <li key={warning.id} className="whitespace-normal leading-snug">
                              {formatWarningPrefix(warning)} {warning.message}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TeacherSwapText({ suggestion }: { suggestion: BalanceHintSuggestion }) {
  if (suggestion.kind === "selfStudyMove") {
    return (
      <>
        <span className="font-medium">{suggestion.hardTeacherName}</span>
        <FatigueInline fatigue={suggestion.hardTeacherBefore.fatigue} />
        <span className="text-muted-foreground">
          자습감독({suggestion.selfStudyRoomName}) 넘김
        </span>
        <Shuffle className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{suggestion.selfStudyTeacherName}</span>
        <FatigueInline fatigue={suggestion.selfStudyTeacherBefore.fatigue} />
        <span className="text-muted-foreground">받음</span>
      </>
    );
  }

  return (
    <>
      <span className="font-medium">{suggestion.hardTeacherName}</span>
      <FatigueInline fatigue={suggestion.hardTeacherBefore.fatigue} />
      <span className="text-muted-foreground">
        {suggestion.hardDutyName}({suggestion.hardRoomName})
      </span>
      <Shuffle className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{suggestion.selfStudyTeacherName}</span>
      <FatigueInline fatigue={suggestion.selfStudyTeacherBefore.fatigue} />
      <span className="text-muted-foreground">자습감독({suggestion.selfStudyRoomName})</span>
    </>
  );
}

function FatigueInline({
  fatigue,
}: {
  fatigue: BalanceHintSuggestion["hardTeacherBefore"]["fatigue"];
}) {
  return (
    <span
      className="rounded border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
      title="이전피로도 / 현피로도 / 총피로도"
    >
      이전 {formatFatigue(fatigue.previous)} | 현 {formatFatigue(fatigue.current)} | 총{" "}
      {formatFatigue(fatigue.total)}
    </span>
  );
}

function TeacherChange({
  title,
  before,
  after,
}: {
  title: string;
  before: BalanceHintSuggestion["hardTeacherBefore"];
  after: BalanceHintSuggestion["hardTeacherAfter"];
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <FatigueChange before={before.fatigue} after={after.fatigue} />
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Count label="정" before={before.chief} after={after.chief} />
        <Count label="부" before={before.assistant} after={after.assistant} />
        <Count label="정+부" before={before.hard} after={after.hard} />
        <Count label="자습" before={before.selfStudy} after={after.selfStudy} />
      </div>
    </div>
  );
}

function FatigueChange({
  before,
  after,
}: {
  before: BalanceHintSuggestion["hardTeacherBefore"]["fatigue"];
  after: BalanceHintSuggestion["hardTeacherAfter"]["fatigue"];
}) {
  return (
    <span className="text-xs text-muted-foreground">
      이전 {formatFatigue(before.previous)} | 현 {formatFatigue(before.current)} →{" "}
      {formatFatigue(after.current)} | 총 {formatFatigue(before.total)} →{" "}
      {formatFatigue(after.total)}
    </span>
  );
}

function Count({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="rounded border bg-background px-2 py-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold">
        {before} → {after}
      </div>
    </div>
  );
}

function Metric({
  label,
  before,
  after,
  title,
}: {
  label: string;
  before: number;
  after: number;
  title?: string;
}) {
  const delta = after - before;
  const improved = delta < 0;
  const same = delta === 0;
  return (
    <div className="rounded-md border bg-muted/20 p-3" title={title}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {improved ? (
          <Badge variant="success">-{Math.abs(delta).toFixed(0)}</Badge>
        ) : same ? (
          <Badge variant="outline">변화 없음</Badge>
        ) : (
          <Badge variant="warning">+{delta.toFixed(0)}</Badge>
        )}
      </div>
      <div className="text-muted-foreground">
        {before.toFixed(0)} → {after.toFixed(0)}
      </div>
    </div>
  );
}

function formatFatigue(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function sortWarningsForDisplay(warnings: ValidationIssue[]): ValidationIssue[] {
  return [...warnings].sort((a, b) => {
    const aDate = a.target?.date ?? "9999-99-99";
    const bDate = b.target?.date ?? "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aPeriod = a.target?.period ?? 999;
    const bPeriod = b.target?.period ?? 999;
    if (aPeriod !== bPeriod) return aPeriod - bPeriod;

    const aTeacher = extractWarningTeacher(a.message);
    const bTeacher = extractWarningTeacher(b.message);
    const teacherCompare = aTeacher.localeCompare(bTeacher, "ko");
    if (teacherCompare !== 0) return teacherCompare;

    return a.message.localeCompare(b.message, "ko");
  });
}

function formatWarningPrefix(warning: ValidationIssue): string {
  const parts = [
    warning.target?.date ? shortDate(warning.target.date) : null,
    warning.target?.period ? `${warning.target.period}교시` : null,
    extractWarningTeacher(warning.message) || null,
  ].filter(Boolean);
  return parts.length > 0 ? `[${parts.join(" · ")}]` : "";
}

function extractWarningTeacher(message: string): string {
  const assignmentMatch = message.match(/^\S+\s+\d+교시\s+([^:]+):/);
  if (assignmentMatch?.[1]) return assignmentMatch[1].trim();
  const leadingNameMatch = message.match(/^([^:：\s]+)\s*[:：]/);
  if (leadingNameMatch?.[1]) return leadingNameMatch[1].trim();
  return "";
}
