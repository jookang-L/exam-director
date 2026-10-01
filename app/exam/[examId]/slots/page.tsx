"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { RefreshCw, Trash2 } from "lucide-react";
import { generateDutySlots } from "@/lib/algorithm/slots";
import { dateWithWeekday } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

export default function SlotsPage() {
  const exam = useExam();
  const m = useExamMutators();

  if (!exam) return null;

  const regenerate = () => {
    const next = generateDutySlots(exam, exam.dutySlots);
    m.replaceDutySlots(next);
    toast({
      title: "감독 슬롯 재생성",
      description: `${next.length}개 슬롯이 만들어졌습니다.`,
      variant: "success",
    });
  };

  const dates = Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 8 — 감독 슬롯</h1>
        <p className="text-sm text-muted-foreground">
          STEP 3의 감독 수요로부터 (date × period × room × dutyType × N명) 단위 슬롯을 생성합니다. 생성 후 STEP 9에서 우선/고정 배정을 등록할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>슬롯 생성</CardTitle>
          <CardDescription>이미 생성된 슬롯이 있다면 같은 키의 슬롯은 보존됩니다 (배정 데이터 유지).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={regenerate}>
              <RefreshCw className="h-4 w-4" /> 슬롯 재생성
            </Button>
            {exam.dutySlots.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirm("모든 슬롯과 배정을 삭제할까요?")) return;
                  m.replaceDutySlots([]);
                  m.replaceAssignments([]);
                }}
              >
                <Trash2 className="h-4 w-4" /> 전체 삭제
              </Button>
            ) : null}
          </div>
          <p className="text-sm">
            현재 슬롯 수: <strong>{exam.dutySlots.length}</strong>
          </p>
        </CardContent>
      </Card>

      {dates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>날짜별 슬롯</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dates.map((date) => {
              const day = exam.dutySlots.filter((s) => s.date === date);
              const periods = Array.from(new Set(day.map((s) => s.period))).sort((a, b) => a - b);
              return (
                <div key={date}>
                  <h3 className="font-medium mb-1">
                    {dateWithWeekday(date)} — {day.length}개
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {periods.map((p) => {
                      const slots = day.filter((s) => s.period === p);
                      return (
                        <Badge key={p} variant="outline">
                          {p}교시 {slots.length}건
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <StepNavButtons currentPath="slots" />
    </div>
  );
}
