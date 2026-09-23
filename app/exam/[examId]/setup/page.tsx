"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import type { PeriodTime } from "@/lib/types";

export default function SetupPage() {
  const exam = useExam();
  const m = useExamMutators();

  if (!exam) return null;

  const setPeriodCount = (n: number) => {
    const safe = Math.max(1, Math.min(10, n));
    m.setPeriodCount(safe);
    // sync periodTimes length
    const cur = exam.periodTimes ?? [];
    if (cur.length < safe) {
      const add: PeriodTime[] = [];
      for (let i = cur.length + 1; i <= safe; i++) {
        add.push({ period: i, start: "", end: "" });
      }
      m.setPeriodTimes([...cur, ...add]);
    } else if (cur.length > safe) {
      m.setPeriodTimes(cur.slice(0, safe));
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 1 — 기본사항</h1>
        <p className="text-sm text-muted-foreground">시험명, 학년별 시험기간, 교시 시간을 입력합니다.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>시험명</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={exam.name}
            onChange={(e) => m.setName(e.target.value)}
            placeholder="예: 2026학년도 1학기 중간고사"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>학년별 시험 기간</CardTitle>
          <CardDescription>
            해당 학년이 시험을 보지 않는 경우 비워두세요. 비어 있으면 그 학년은 정상 수업 중으로 간주됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exam.gradeSchedule.map((gs, idx) => (
            <div key={gs.grade} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <Label>학년</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted">{gs.grade}학년</div>
              </div>
              <div>
                <Label htmlFor={`start-${gs.grade}`}>시작일</Label>
                <Input
                  id={`start-${gs.grade}`}
                  type="date"
                  value={gs.startDate}
                  onChange={(e) => {
                    const next = [...exam.gradeSchedule];
                    next[idx] = { ...gs, startDate: e.target.value };
                    m.setGradeSchedule(next);
                  }}
                />
              </div>
              <div>
                <Label htmlFor={`end-${gs.grade}`}>종료일</Label>
                <Input
                  id={`end-${gs.grade}`}
                  type="date"
                  value={gs.endDate}
                  onChange={(e) => {
                    const next = [...exam.gradeSchedule];
                    next[idx] = { ...gs, endDate: e.target.value };
                    m.setGradeSchedule(next);
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>교시 시간</CardTitle>
          <CardDescription>교시 수와 각 교시의 시작/종료 시간을 입력합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <Label htmlFor="periodCount">교시 수</Label>
              <Input
                id="periodCount"
                type="number"
                min={1}
                max={10}
                className="w-24"
                value={exam.periodCount}
                onChange={(e) => setPeriodCount(Number(e.target.value))}
              />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">교시</th>
                <th className="p-2">시작</th>
                <th className="p-2">종료</th>
              </tr>
            </thead>
            <tbody>
              {exam.periodTimes.map((pt, idx) => (
                <tr key={pt.period} className="border-t">
                  <td className="p-2 font-medium">{pt.period}교시</td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={pt.start}
                      onChange={(e) => {
                        const next = [...exam.periodTimes];
                        next[idx] = { ...pt, start: e.target.value };
                        m.setPeriodTimes(next);
                      }}
                      className="w-32"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={pt.end}
                      onChange={(e) => {
                        const next = [...exam.periodTimes];
                        next[idx] = { ...pt, end: e.target.value };
                        m.setPeriodTimes(next);
                      }}
                      className="w-32"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>누적피로도 이월 계수</CardTitle>
          <CardDescription>
            이전 시험 피로도를 이번 시험 계산에 어느 정도 반영할지 (0 ~ 1). 기본 0.5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={1}
            className="w-32"
            value={exam.carryOverRatio}
            onChange={(e) => m.setCarryOverRatio(Number(e.target.value))}
          />
        </CardContent>
      </Card>

      <StepNavButtons currentPath="setup" />
    </div>
  );
}
