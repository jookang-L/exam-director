"use client";

import * as React from "react";
import { useExam } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { runPreflight, hasErrors } from "@/lib/validation/rules";
import { dateWithWeekday } from "@/lib/utils";

export default function ValidatePage() {
  const exam = useExam();

  const issues = React.useMemo(() => (exam ? runPreflight(exam) : []), [exam]);

  if (!exam) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const hasErr = hasErrors(issues);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 10 — 사전 검증</h1>
        <p className="text-sm text-muted-foreground">
          자동 배정 전에 입력 데이터를 점검합니다. <strong>오류(빨간색)는 STEP 11 진행 전 반드시 해결</strong>해야 합니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasErr ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span>점검 실패 — 오류 {errors.length}건, 경고 {warnings.length}건</span>
              </>
            ) : warnings.length > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>오류 없음 — 경고 {warnings.length}건</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>모든 점검 통과</span>
              </>
            )}
          </CardTitle>
          {hasErr ? (
            <CardDescription className="text-destructive">
              아래 오류들을 먼저 해결해주세요. STEP 11으로 진행할 수 없습니다.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">감지된 문제가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {[...errors, ...warnings].map((i) => (
                <li
                  key={i.id}
                  className={
                    i.severity === "error"
                      ? "border-l-4 border-destructive bg-destructive/5 p-3 rounded"
                      : "border-l-4 border-amber-400 bg-amber-50 p-3 rounded"
                  }
                >
                  <div className="flex items-start gap-2">
                    <Badge variant={i.severity === "error" ? "destructive" : "warning"}>
                      {i.severity === "error" ? "오류" : "경고"}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{i.message}</p>
                      {i.target?.date ? (
                        <p className="text-xs text-muted-foreground">
                          위치: {dateWithWeekday(i.target.date)}
                          {i.target.period ? ` ${i.target.period}교시` : ""}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-muted-foreground font-mono">{i.ruleId}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-2">
        <StepNavButtons
          currentPath="validate"
          disableNext={hasErr}
          disableNextTitle="오류를 해결한 후 자동 배정 단계로 진행할 수 있습니다"
        />
      </div>
    </div>
  );
}
