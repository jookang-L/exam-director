"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { AlertTriangle, Sparkles, Trash, UserCheck } from "lucide-react";
import type { Assignment } from "@/lib/types";
import {
  evaluateAssignmentCandidateAsync,
  runSolverBestOfAsync,
  type SolverProgress,
} from "@/lib/algorithm/runSolverAsync";
import {
  buildLecturerPriorityAssignments,
  releaseLecturerPriorityFixes,
  withLecturerPeriodRule,
} from "@/lib/algorithm/lecturerPriority";
import type { MultiSolverResult } from "@/lib/algorithm/solver";
import { isBetterSolverScore } from "@/lib/algorithm/balanceScore";
import {
  buildEnhancedSolverSeeds,
  ENHANCED_SOLVER_MAX_RUNS,
} from "@/lib/algorithm/solverSeeds";
import { computeAverageTotalFatigue } from "@/lib/algorithm/averageFatigue";
import { FatigueSummaryBar } from "@/components/FatigueSummaryBar";
import { TeacherWorkloadTable } from "@/components/TeacherWorkloadTable";
import { toast } from "@/components/ui/use-toast";
import { dateWithWeekday } from "@/lib/utils";

type RunMode = "auto" | "lecturer";

export default function AssignPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [result, setResult] = React.useState<MultiSolverResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runMode, setRunMode] = React.useState<RunMode>("auto");
  const [lecturerSummary, setLecturerSummary] = React.useState<{
    assignments: number;
    teachers: number;
  } | null>(null);
  const [progress, setProgress] = React.useState<SolverProgress | null>(null);
  const [enhancedBalance, setEnhancedBalance] = React.useState(false);
  const [keepReason, setKeepReason] = React.useState<"validation" | "not-better" | null>(null);

  const dateGroups = React.useMemo(() => {
    if (!exam) return [] as [string, { total: number; assigned: number }][];
    const assignedSlotIds = new Set(exam.assignments.map((a) => a.dutySlotId));
    const groups = new Map<string, { total: number; assigned: number }>();
    for (const s of exam.dutySlots) {
      const k = s.date;
      const cur = groups.get(k) ?? { total: 0, assigned: 0 };
      cur.total += 1;
      if (assignedSlotIds.has(s.id)) cur.assigned += 1;
      groups.set(k, cur);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [exam]);

  const averageFatigue = React.useMemo(
    () => (exam ? computeAverageTotalFatigue(exam) : null),
    [exam],
  );

  if (!exam) return null;

  const plannedRuns = enhancedBalance ? ENHANCED_SOLVER_MAX_RUNS : 1;

  const runAuto = (mode: RunMode = "auto") => {
    const lecturerFirst = mode === "lecturer";
    const fixedAssignments = exam.assignments.filter((a) => a.fixed);
    const baseExam = { ...exam, assignments: fixedAssignments };

    // 강사 무조건 배정: 강사가 맡을 수 있는 모든 시간에 부감독을 먼저 깔고 고정한 채 솔버를 돌린다.
    let lecturerAssignments: Assignment[] = [];
    if (lecturerFirst) {
      lecturerAssignments = buildLecturerPriorityAssignments(baseExam);
      if (lecturerAssignments.length === 0) {
        toast({
          title: "강사 우선 배정할 시간이 없습니다",
          description:
            "역할이 강사인 교사가 없거나, 강사가 맡을 수 있는 빈 부감독 슬롯이 없습니다 (STEP 7 제외·정규 수업 포함).",
          variant: "warning",
        });
        return;
      }
      const lecturerCount = new Set(lecturerAssignments.map((a) => a.teacherId)).size;
      const replaced = exam.assignments.length - fixedAssignments.length;
      const message = [
        `강사 ${lecturerCount}명에게 부감독 ${lecturerAssignments.length}건을 먼저 배정한 뒤 나머지를 자동 배정합니다.`,
        replaced > 0
          ? `고정되지 않은 기존 배정 ${replaced}건은 새 결과로 교체됩니다 (고정 배정은 유지).`
          : null,
        "",
        "계속하시겠습니까?",
      ]
        .filter((line) => line !== null)
        .join("\n");
      if (!confirm(message)) return;
    }

    setRunning(true);
    setRunMode(mode);
    setProgress(null);
    setKeepReason(null);
    setLecturerSummary(null);
    const seeds = enhancedBalance ? buildEnhancedSolverSeeds() : [1];
    const baselineAssignments = exam.assignments.map((assignment) => ({ ...assignment }));
    const solverBase = {
      ...baseExam,
      assignments: [...fixedAssignments, ...lecturerAssignments],
    };
    // 강사 무조건 배정이면 이어지는 자동 배정에서도 강사에게 1교시를 주지 않도록 제한을 붙인다 (저장되는 시험에는 쓰지 않음).
    const examForSolver = lecturerFirst ? withLecturerPeriodRule(solverBase) : solverBase;
    const lecturerAssignmentIds = new Set(lecturerAssignments.map((a) => a.id));
    void Promise.all([
      runSolverBestOfAsync(examForSolver, {
        seeds,
        onProgress: (p) => setProgress(p),
      }),
      // 강사 무조건 배정은 기존 배정과 비교하지 않고 항상 새 결과를 적용한다(제약 오류가 없을 때).
      lecturerFirst
        ? Promise.resolve(null)
        : evaluateAssignmentCandidateAsync(examForSolver, baselineAssignments),
    ])
      .then(([solved, baseline]) => {
        // 솔버 동안에만 고정했던 강사 배정은 일반 배정으로 돌려놓는다 (STEP 12에서 수정 가능).
        const r = lecturerFirst
          ? {
              ...solved,
              assignments: releaseLecturerPriorityFixes(solved.assignments, lecturerAssignmentIds),
            }
          : solved;
        const hasValidationErrors = r.validationErrors.length > 0;
        const improved = baseline === null || isBetterSolverScore(r.score, baseline.score);
        const nextKeepReason = hasValidationErrors
          ? "validation"
          : improved
            ? null
            : "not-better";

        if (!nextKeepReason) {
          React.startTransition(() => {
            m.replaceAssignments(r.assignments);
            setResult(r);
          });
        } else {
          setResult(r);
        }
        setKeepReason(nextKeepReason);
        if (lecturerFirst) {
          setLecturerSummary({
            assignments: lecturerAssignments.length,
            teachers: new Set(lecturerAssignments.map((a) => a.teacherId)).size,
          });
        }
        const lecturerNote = lecturerFirst
          ? `강사 부감독 ${lecturerAssignments.length}건 우선 배정 · `
          : "";
        toast({
          title:
            nextKeepReason === "validation"
              ? "자동 적용 보류"
              : nextKeepReason === "not-better"
                ? "기존 배정 유지"
                : lecturerFirst
                  ? "강사 우선 배정 + 자동 배정 완료"
                  : "자동 배정 완료",
          description:
            nextKeepReason === "validation"
              ? `제약 오류 ${r.validationErrors.length}건이 있어 기존 배정을 유지했습니다.`
              : nextKeepReason === "not-better"
              ? `${r.runs}회 탐색했지만 기존 배정보다 좋은 결과가 없어 유지했습니다.`
              : r.runs > 1
              ? `${lecturerNote}${r.runs}회 탐색 중 seed ${r.pickedSeed} 선택 · ${r.assignments.length}건 배정, 미배정 ${r.unassigned.length}건`
              : `${lecturerNote}${r.assignments.length}건 배정, 미배정 ${r.unassigned.length}건 · 제약 오류 ${r.validationErrors.length}건`,
          variant:
            !nextKeepReason && r.unassigned.length === 0
              ? "success"
              : "warning",
        });
      })
      .catch((err) => {
        toast({
          title: "배정 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      })
      .finally(() => {
        setRunning(false);
        setProgress(null);
      });
  };

  const applyErroredResult = () => {
    if (!result || result.validationErrors.length === 0) return;
    if (
      !confirm(
        `제약 오류 ${result.validationErrors.length}건이 있는 결과입니다. 그래도 기존 배정을 교체하시겠습니까?`,
      )
    ) {
      return;
    }
    m.replaceAssignments(result.assignments);
    setKeepReason(null);
    toast({
      title: "오류 결과를 적용했습니다",
      description: "STEP 12에서 표시된 제약 오류를 반드시 확인하세요.",
      variant: "warning",
    });
  };

  const clearAll = () => {
    if (!confirm("모든 배정(고정 포함)을 삭제하시겠습니까?")) return;
    m.replaceAssignments([]);
    setResult(null);
    setKeepReason(null);
  };

  const clearNonFixed = () => {
    m.replaceAssignments(exam.assignments.filter((a) => a.fixed));
    setResult(null);
    setKeepReason(null);
  };

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 11 — 자동 배정</h1>
        <p className="text-sm text-muted-foreground">
          7가지 규칙을 만족하는 배정을 그리디 + 백트래킹으로 찾습니다. 기본은 <strong>1회</strong> 실행(약 30초~1분)이며,
          균형 강화 옵션을 켜면 최대 {ENHANCED_SOLVER_MAX_RUNS}회 탐색 후 최선을 선택합니다(그만큼 더
          오래 걸립니다).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>자동 배정 실행</CardTitle>
          <CardDescription>
            기존 배정 중 <strong>고정(fixed=true)</strong> 항목은 보존됩니다. 새 결과가 더 좋을 때만 기존 배정을 교체합니다.
            <br />
            <strong>강사 무조건 배정</strong>은 강사가 맡을 수 있는 모든 시간(STEP 7 제외·정규 수업 제외)에 부감독을 먼저
            배정한 뒤 나머지를 자동 배정합니다. 강사에게는 <strong>1교시를 배정하지 않습니다</strong>(2교시 이후만, 이어지는
            자동 배정 단계 포함). 영양교사·담임 첫날 자습·STEP 9 배정이 항상 우선이며, 강사 부담은 늘고 다른 교사의 부담은
            줄고, 기존 배정은 비교 없이 새 결과로 교체됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => runAuto("auto")} disabled={running}>
                <Sparkles className="h-4 w-4" />
                {running && runMode === "auto"
                  ? progress
                    ? plannedRuns > 1
                      ? `탐색 중 (${progress.completed}/${progress.total})…`
                      : "배정 중…"
                    : "준비 중…"
                  : "자동 배정 실행"}
              </Button>
              <Button variant="secondary" onClick={() => runAuto("lecturer")} disabled={running}>
                <UserCheck className="h-4 w-4" />
                {running && runMode === "lecturer"
                  ? progress
                    ? plannedRuns > 1
                      ? `탐색 중 (${progress.completed}/${progress.total})…`
                      : "배정 중…"
                    : "준비 중…"
                  : "강사 무조건 배정"}
              </Button>
              <Button variant="outline" onClick={clearNonFixed} disabled={running}>
                고정 외 초기화
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={running}>
                <Trash className="h-4 w-4" /> 전체 초기화
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enhanced-balance"
                checked={enhancedBalance}
                onCheckedChange={(v) => setEnhancedBalance(v === true)}
                disabled={running}
              />
              <Label htmlFor="enhanced-balance" className="text-sm font-normal cursor-pointer">
                균형 강화 (최대 {ENHANCED_SOLVER_MAX_RUNS}회 탐색, 느림)
              </Label>
            </div>
          </div>

          {running ? (
            <p className="text-sm text-muted-foreground">
              {plannedRuns > 1
                ? `백그라운드에서 ${plannedRuns}회 탐색 중입니다. 1회당 수십 초 × ${plannedRuns}회 ≈ 수 분 걸릴 수 있습니다.`
                : "배정 중입니다. 잠시만 기다려 주세요."}
            </p>
          ) : null}

          {result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={result.score.roleBalanceAcceptable ? "success" : "warning"}>
                  {result.score.roleBalanceAcceptable
                    ? "정·부 균형 정상"
                    : "정·부 균형 허용범위 초과"}
                </Badge>
                {result.validationErrors.length > 0 ? (
                  <Badge variant="destructive">자동 적용 안 됨</Badge>
                ) : keepReason === "not-better" ? (
                  <Badge variant="warning">기존 배정 유지</Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3 text-sm">
                <Stat label="탐색 횟수" value={result.runs > 1 ? `${result.runs}회 중 선택` : "1회"} />
                <Stat label="선택 seed" value={result.pickedSeed} />
                <Stat label="배정 완료" value={result.assignments.length} />
                {lecturerSummary ? (
                  <Stat
                    label="강사 우선 배정"
                    value={`${lecturerSummary.assignments}건 · ${lecturerSummary.teachers}명`}
                  />
                ) : null}
                <Stat label="미배정" value={result.unassigned.length} variant={result.unassigned.length === 0 ? "success" : "warning"} />
                <Stat label="정 편차" value={result.score.chiefSpread} />
                <Stat label="부 편차" value={result.score.assistantSpread} />
                <Stat label="기존 누적 편차" value={result.score.totalFatigueSpread} />
                <Stat label="목표 초과" value={result.score.maxTargetExcess.toFixed(0)} />
                <Stat label="목표 SSD" value={result.score.targetSSD.toFixed(0)} />
                <Stat
                  label="제약 오류"
                  value={result.validationErrors.length}
                  variant={result.validationErrors.length === 0 ? "success" : "warning"}
                />
              </div>
              {result.validationErrors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    제약 오류가 있어 기존 배정을 유지했습니다.
                  </div>
                  <ul className="space-y-1 text-xs text-destructive">
                    {result.validationErrors.slice(0, 5).map((error, index) => (
                      <li key={`${error.assignmentId ?? error.dutySlotId ?? "error"}-${index}`}>
                        {error.reasons.map((reason) => reason.message).join(" · ")}
                      </li>
                    ))}
                  </ul>
                  <Button variant="destructive" size="sm" onClick={applyErroredResult}>
                    오류 결과 강제 적용
                  </Button>
                </div>
              ) : null}
              {keepReason === "not-better" ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  탐색 결과가 기존 배정보다 좋지 않거나 동점이어서 기존 배정을 유지했습니다.
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>날짜별 배정 진행률</CardTitle>
        </CardHeader>
        <CardContent>
          {dateGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">슬롯이 없습니다. STEP 8에서 슬롯을 생성하세요.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">날짜</th>
                  <th className="p-2">슬롯</th>
                  <th className="p-2">배정</th>
                  <th className="p-2">미배정</th>
                </tr>
              </thead>
              <tbody>
                {dateGroups.map(([date, { total, assigned }]) => (
                  <tr key={date} className="border-t">
                    <td className="p-2">{dateWithWeekday(date)}</td>
                    <td className="p-2">{total}</td>
                    <td className="p-2">{assigned}</td>
                    <td className="p-2">
                      {total - assigned > 0 ? (
                        <Badge variant="destructive">{total - assigned}</Badge>
                      ) : (
                        <Badge variant="success">완료</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>교사별 업무강도</CardTitle>
          <CardDescription>
            열 헤더를 클릭하면 정렬됩니다. 총 누적도 = 이전시험(×이월) + 현재시험(감독+수업).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {averageFatigue && !running ? <FatigueSummaryBar stats={averageFatigue} /> : null}
          {!running ? <TeacherWorkloadTable exam={exam} /> : null}
        </CardContent>
      </Card>

      <StepNavButtons currentPath="assign" />
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: number | string; variant?: "success" | "warning" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-2xl font-bold " +
          (variant === "success" ? "text-emerald-600" : variant === "warning" ? "text-amber-600" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
