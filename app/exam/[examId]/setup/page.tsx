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
  const [firstStart, setFirstStart] = React.useState("09:00");
  const [examMinutes, setExamMinutes] = React.useState(50);
  const [breakMinutes, setBreakMinutes] = React.useState(20);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!exam || seeded.current) return;
    seeded.current = true;
    const inferred = inferPeriodSchedule(exam.periodTimes);
    setFirstStart(inferred.firstStart);
    setExamMinutes(inferred.examMinutes);
    setBreakMinutes(inferred.breakMinutes);
  }, [exam]);

  const applyGeneratedTimes = (
    count: number,
    start: string,
    examMin: number,
    breakMin: number,
  ) => {
    const safe = clampPeriodCount(count);
    const times = buildPeriodTimes(safe, start, examMin, breakMin);
    if (!times) {
      m.setPeriodCount(safe);
      return;
    }
    m.patchExam({ periodCount: safe, periodTimes: times });
  };

  if (!exam) return null;

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
          <CardDescription>
            교시 수, 1교시 시작, 시험시간, 쉬는시간을 입력하면 1교시부터 마지막 교시까지 시작·종료
            시간이 채워집니다. 각 교시 시간은 아래에서 직접 고칠 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="periodCount">교시 수</Label>
              <Input
                id="periodCount"
                type="number"
                min={1}
                max={10}
                className="w-24"
                value={exam.periodCount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  applyGeneratedTimes(n, firstStart, examMinutes, breakMinutes);
                }}
              />
            </div>
            <div>
              <Label htmlFor="firstStart">1교시 시작</Label>
              <Input
                id="firstStart"
                type="time"
                className="w-32"
                value={firstStart}
                onChange={(e) => {
                  const start = e.target.value;
                  setFirstStart(start);
                  applyGeneratedTimes(exam.periodCount, start, examMinutes, breakMinutes);
                }}
              />
            </div>
            <div>
              <Label htmlFor="examMinutes">시험시간 (분)</Label>
              <Input
                id="examMinutes"
                type="number"
                min={1}
                max={180}
                className="w-28"
                value={examMinutes}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setExamMinutes(n);
                  applyGeneratedTimes(exam.periodCount, firstStart, n, breakMinutes);
                }}
              />
            </div>
            <div>
              <Label htmlFor="breakMinutes">쉬는시간 (분)</Label>
              <Input
                id="breakMinutes"
                type="number"
                min={0}
                max={180}
                className="w-28"
                value={breakMinutes}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setBreakMinutes(n);
                  applyGeneratedTimes(exam.periodCount, firstStart, examMinutes, n);
                }}
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

const MINUTES_PER_DAY = 24 * 60;

function clampPeriodCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function minutesFromTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeFromMinutes(total: number): string {
  const wrapped = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function diffMinutes(start: string, end: string): number | null {
  const from = minutesFromTime(start);
  const to = minutesFromTime(end);
  if (from == null || to == null || to < from) return null;
  return to - from;
}

function inferPeriodSchedule(times: PeriodTime[]): {
  firstStart: string;
  examMinutes: number;
  breakMinutes: number;
} {
  const first = times[0];
  const firstStart = first && minutesFromTime(first.start) != null ? first.start : "09:00";
  const exam = first ? diffMinutes(first.start, first.end) : null;
  const examMinutes = exam != null && exam > 0 ? exam : 50;
  const gap = first && times[1] ? diffMinutes(first.end, times[1].start) : null;
  return { firstStart, examMinutes, breakMinutes: gap ?? 20 };
}

function buildPeriodTimes(
  count: number,
  firstStart: string,
  examMinutes: number,
  breakMinutes: number,
): PeriodTime[] | null {
  const start0 = minutesFromTime(firstStart);
  if (start0 == null || examMinutes < 1 || examMinutes > 180 || breakMinutes < 0 || breakMinutes > 180) {
    return null;
  }
  const times: PeriodTime[] = [];
  let cursor = start0;
  for (let period = 1; period <= count; period++) {
    times.push({
      period,
      start: timeFromMinutes(cursor),
      end: timeFromMinutes(cursor + examMinutes),
    });
    cursor += examMinutes + breakMinutes;
  }
  return times;
}
