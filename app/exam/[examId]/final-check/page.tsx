"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { FinalRuleChecklistTable } from "@/components/FinalRuleChecklistTable";
import { AlertTriangle, CheckCircle2, FileUp, Upload, XCircle } from "lucide-react";
import {
  evaluateRuleChecklist,
  c2ChecklistItem,
  ruleChecklistBlocksApply,
} from "@/lib/validation/ruleChecklist";
import {
  importHasBlockingIssues,
  parseTeacherGridWorkbook,
  type TeacherGridImportResult,
} from "@/lib/io/teacherGridExcelImport";
import { c7bConfirmMessage } from "@/lib/algorithm/manualAssignValidation";
import { shortDate } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

export default function FinalCheckPage() {
  const exam = useExam();
  const m = useExamMutators();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<TeacherGridImportResult | null>(null);
  const [c2Acknowledged, setC2Acknowledged] = React.useState(false);

  const currentChecklist = React.useMemo(
    () => (exam ? evaluateRuleChecklist(exam, exam.assignments) : []),
    [exam],
  );

  const importChecklist = React.useMemo(
    () =>
      exam && result && !result.parseIssues.some((i) => i.severity === "error")
        ? evaluateRuleChecklist(exam, result.assignments)
        : null,
    [exam, result],
  );

  if (!exam) return null;

  const parseErrors = result?.parseIssues.filter((issue) => issue.severity === "error") ?? [];
  const parseWarnings = result?.parseIssues.filter((issue) => issue.severity === "warning") ?? [];
  const validationErrors = result?.validationIssues.filter((issue) => issue.severity === "error") ?? [];
  const validationWarnings =
    result?.validationIssues.filter((issue) => issue.severity === "warning") ?? [];
  const c7bWarnings = validationWarnings.filter((issue) => issue.ruleId === "assign.C7b");
  const c2Warnings = validationWarnings.filter((issue) => issue.ruleId === "assign.C2");
  const blockedByImport = result ? importHasBlockingIssues(result) : true;
  const blockedByChecklist = importChecklist
    ? ruleChecklistBlocksApply(importChecklist, { c2Acknowledged })
    : true;
  const blocked = result ? blockedByImport || blockedByChecklist : true;
  const passed = result ? !blocked : false;
  const canApply = result ? !blocked : false;
  const currentAllRequiredPassed = !ruleChecklistBlocksApply(currentChecklist, { c2Acknowledged });
  const currentRequiredFailed = currentChecklist.filter((item) => item.required && !item.passed).length;
  const currentC2 = c2ChecklistItem(currentChecklist);
  const importC2 = importChecklist ? c2ChecklistItem(importChecklist) : null;
  const activeC2 = importChecklist ? importC2 : currentC2;
  const c2Pending = activeC2 != null && !activeC2.passed && !c2Acknowledged;
  const showC2Skip = c2Pending;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setC2Acknowledged(false);
    setChecking(true);
    void file
      .arrayBuffer()
      .then((buffer) => parseTeacherGridWorkbook(buffer, exam))
      .then((next) => {
        setResult(next);
        const checklist =
          !next.parseIssues.some((i) => i.severity === "error")
            ? evaluateRuleChecklist(exam, next.assignments)
            : null;
        const failed =
          importHasBlockingIssues(next) ||
          (checklist && ruleChecklistBlocksApply(checklist, { c2Acknowledged: false }));
        if (failed) {
          toast({
            title: "검토 실패",
            description: "엑셀 해석 또는 규칙 위반이 있습니다. 아래 목록을 확인하세요.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "검토 통과",
            description: `${next.assignedSlotCount}건 배정 · 필수 규칙 통과`,
            variant: "success",
          });
        }
      })
      .catch((err) => {
        setResult(null);
        toast({
          title: "파일 읽기 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      })
      .finally(() => {
        setChecking(false);
        event.target.value = "";
      });
  };

  const acknowledgeC2 = () => {
    const c2 = activeC2;
    if (!c2 || c2.passed) return;
    const preview = c2.failures.slice(0, 3).map((msg) => `· ${msg}`).join("\n");
    if (
      !confirm(
        [
          "C2(담임 첫날 1교시 본인 반 자습감독) 미통과를 경고로 전환하고 계속합니다.",
          "",
          preview,
          c2.failures.length > 3 ? `· 외 ${c2.failures.length - 3}건` : "",
          "",
          "배정 반영은 가능하지만, 담임 자습 배정을 다시 확인하세요.",
        ]
          .filter(Boolean)
          .join("\n"),
      )
    ) {
      return;
    }
    setC2Acknowledged(true);
    toast({
      title: "C2를 경고로 전환했습니다",
      description: "다른 필수 규칙을 통과하면 배정을 반영할 수 있습니다.",
    });
  };

  const applyImport = () => {
    if (!result || !canApply) return;

    const warnParts: string[] = [];
    if (c2Acknowledged && importC2 && !importC2.passed) {
      warnParts.push(`C2 경고 ${importC2.failures.length}건`);
    }
    if (c7bWarnings.length > 0) {
      warnParts.push(`C7b 경고 ${c7bWarnings.length}건`);
    }

    if (warnParts.length > 0) {
      const lines = [
        ...c2Warnings.map((issue) => `· ${issue.message}`),
        ...c7bWarnings.map((issue) => `· ${issue.message}`),
      ];
      if (
        !confirm(
          [
            warnParts.join(" · "),
            ...lines.slice(0, 6),
            lines.length > 6 ? `· 외 ${lines.length - 6}건` : "",
            "",
            c7bWarnings.length > 0
              ? c7bConfirmMessage([]).split("\n").slice(-2).join("\n")
              : "경고를 확인했으면 배정을 반영합니다.",
          ]
            .filter(Boolean)
            .join("\n"),
        )
      ) {
        return;
      }
    } else if (
      !confirm(
        "검토를 통과한 엑셀 내용으로 현재 배정을 교체합니다. 계속하시겠습니까?",
      )
    ) {
      return;
    }

    m.replaceAssignments(result.assignments);
    toast({
      title: "최종 배정을 반영했습니다",
      description: "STEP 15에서 PDF·엑셀·JSON을 출력할 수 있습니다.",
      variant: "success",
    });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 14 — 최종 검토</h1>
        <p className="text-sm text-muted-foreground">
          지정한 규칙별 통과 여부를 확인합니다. <strong>C2</strong>는 미통과 시 「넘어가기」로
          경고 전환 후 진행할 수 있으며, 나머지 필수 규칙은 통과해야 배정을
          반영할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            현재 배정 — 규칙 점검
            {currentAllRequiredPassed ? (
              <Badge variant="outline" className="font-normal text-emerald-700 border-emerald-300">
                필수 규칙 통과
              </Badge>
            ) : c2Pending && currentRequiredFailed === 0 ? (
              <Badge variant="warning" className="font-normal">
                C2 확인 필요
              </Badge>
            ) : (
              <Badge variant="destructive" className="font-normal">
                필수 규칙 미통과
              </Badge>
            )}
          </CardTitle>
          <CardDescription>앱에 저장된 배정 기준 (STEP 12에서 수정한 내용)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FinalRuleChecklistTable items={currentChecklist} c2Acknowledged={c2Acknowledged} />
          {showC2Skip ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <span>
                C2 미통과 {activeC2?.failures.length ?? 0}건 — 확인 후 경고로 전환하면 배정 반영을
                진행할 수 있습니다.
              </span>
              <Button size="sm" variant="outline" onClick={acknowledgeC2}>
                C2 넘어가기
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>엑셀 업로드 검증</CardTitle>
          <CardDescription>
            `{exam.name || "시험"}_교사별감독표.xlsx` 형식(시트명 「교사별감독표」)만 지원합니다.
            교사명·고사실명은 앱 데이터와 정확히 일치해야 합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={checking}
            >
              {checking ? (
                <>
                  <Upload className="h-4 w-4 animate-pulse" />
                  검토 중…
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  엑셀 선택
                </>
              )}
            </Button>
            {fileName ? (
              <span className="text-sm text-muted-foreground truncate max-w-md">{fileName}</span>
            ) : (
              <span className="text-sm text-muted-foreground">아직 파일을 선택하지 않았습니다.</span>
            )}
          </div>

          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
            <li>노란 셀(정규 수업)은 감독 배정으로 읽지 않습니다.</li>
            <li>열을 추가·삭제하거나 날짜 블록 순서를 바꾸면 잘못 해석될 수 있습니다.</li>
            <li>검토 통과 후 「배정 반영」을 눌러야 앱 배정이 갱신됩니다.</li>
          </ul>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {passed ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>업로드 검토 통과</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span>업로드 검토 실패</span>
                </>
              )}
            </CardTitle>
            <CardDescription>
              교사 {result.teacherCount}명 · 배정 {result.assignedSlotCount}건 / 전체 슬롯{" "}
              {exam.dutySlots.length}건
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {importChecklist ? (
              <FinalRuleChecklistTable
                items={importChecklist}
                title="업로드 배정 — 규칙 점검"
                description="엑셀에서 읽은 배정 기준"
                c2Acknowledged={c2Acknowledged}
              />
            ) : null}

            {parseErrors.length > 0 ? (
              <IssueSection title="엑셀 해석 오류" issues={parseErrors} variant="error" />
            ) : null}
            {parseWarnings.length > 0 ? (
              <IssueSection title="엑셀 해석 경고" issues={parseWarnings} variant="warning" />
            ) : null}
            {validationErrors.length > 0 ? (
              <IssueSection
                title="규칙 위반 (오류)"
                issues={validationErrors.map((issue) => ({
                  severity: issue.severity,
                  message: issue.message,
                  meta: issue.target?.date
                    ? `위치: ${shortDate(issue.target.date)}${issue.target.period ? ` ${issue.target.period}교시` : ""}`
                    : issue.ruleId,
                }))}
                variant="error"
              />
            ) : null}
            {validationWarnings.length > 0 ? (
              <IssueSection
                title="규칙 경고"
                issues={validationWarnings.map((issue) => ({
                  severity: issue.severity,
                  message: issue.message,
                  meta: issue.ruleId,
                }))}
                variant="warning"
              />
            ) : null}
            {canApply && c2Acknowledged && importC2 && !importC2.passed ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  C2 경고 {importC2.failures.length}건 — 담임 첫날 자습 배정을 확인한 뒤
                  반영하세요.
                </span>
              </div>
            ) : null}
            {canApply && c7bWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  C7b 경고 {c7bWarnings.length}건이 있습니다. 「배정 반영」 시 확인 후 예외로
                  적용할 수 있습니다. (자동 배정에서는 허용되지 않습니다.)
                </span>
              </div>
            ) : null}
            {passed ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {c7bWarnings.length > 0 || (c2Acknowledged && importC2 && !importC2.passed)
                    ? "필수 규칙을 통과했습니다. 경고(C2·C7b)를 확인한 뒤 반영하세요."
                    : "필수 규칙을 모두 통과했습니다. 아래 버튼으로 앱에 반영한 뒤 STEP 15에서 출력하세요."}
                </span>
              </div>
            ) : (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  규칙 점검표의 미통과 항목 또는 엑셀 오류를 수정한 뒤 다시 업로드하세요.
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={applyImport} disabled={!canApply}>
                배정 반영
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StepNavButtons currentPath="final-check" />
    </div>
  );
}

function IssueSection({
  title,
  issues,
  variant,
}: {
  title: string;
  issues: Array<{ severity: "error" | "warning"; message: string; meta?: string; row?: number; column?: number }>;
  variant: "error" | "warning";
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {issues.map((issue, index) => (
          <li
            key={`${issue.message}-${index}`}
            className={
              variant === "error"
                ? "border-l-4 border-destructive bg-destructive/5 p-3 rounded"
                : "border-l-4 border-amber-400 bg-amber-50 p-3 rounded"
            }
          >
            <div className="flex items-start gap-2">
              <Badge variant={variant === "error" ? "destructive" : "warning"}>
                {variant === "error" ? "오류" : "경고"}
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-medium">{issue.message}</p>
                {issue.meta ? (
                  <p className="text-xs text-muted-foreground">{issue.meta}</p>
                ) : null}
                {issue.row ? (
                  <p className="text-xs text-muted-foreground">
                    위치: {issue.row}행{issue.column ? ` ${issue.column}열` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
