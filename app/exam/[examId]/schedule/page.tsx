"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Plus, Trash2 } from "lucide-react";
import { newId, type ExamSlot, type Grade } from "@/lib/types";
import { MAJOR_EXAM_CLASS_THRESHOLD } from "@/lib/algorithm/examSubjectRules";
import { ClassPicker } from "@/components/schedule/ClassPicker";
import {
  formatClassesDisplay,
  parseClassesDisplayInput,
  specialRoomNamesForGrade,
} from "@/lib/roomClassMap";
import { eachDate, shortDate, weekdayKo, cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GRADE_ROW_CLASS: Record<Grade, string> = {
  1: "bg-[hsl(211_38%_82%)] hover:bg-[hsl(211_38%_78%)]",
  2: "bg-[hsl(46_42%_78%)] hover:bg-[hsl(46_42%_74%)]",
  3: "bg-[hsl(142_32%_80%)] hover:bg-[hsl(142_32%_76%)]",
};

const GRADE_LEGEND_CLASS: Record<Grade, string> = {
  1: "bg-[hsl(211_42%_74%)] border-[hsl(211_45%_58%)]",
  2: "bg-[hsl(46_48%_70%)] border-[hsl(46_50%_52%)]",
  3: "bg-[hsl(142_36%_72%)] border-[hsl(142_38%_48%)]",
};

export default function SchedulePage() {
  const exam = useExam();
  const m = useExamMutators();
  const [draft, setDraft] = React.useState<{
    date: string;
    period: number;
    grade: Grade;
    subject: string;
    classesText: string;
  }>({ date: "", period: 1, grade: 1, subject: "", classesText: "" });

  const allDates = React.useMemo(() => {
    const set = new Set<string>();
    if (!exam) return [];
    for (const g of exam.gradeSchedule) {
      if (g.startDate && g.endDate) {
        for (const d of eachDate(g.startDate, g.endDate)) set.add(d);
      }
    }
    return Array.from(set).sort();
  }, [exam]);

  if (!exam) return null;

  const sorted = [...exam.examSlots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.period !== b.period) return a.period - b.period;
    return a.grade - b.grade;
  });

  const handleAdd = () => {
    if (!draft.date || !draft.subject) return;
    const classes = parseClassesDisplayInput(draft.grade, draft.classesText);
    const slot: ExamSlot = {
      id: newId(),
      date: draft.date,
      period: draft.period,
      grade: draft.grade,
      subject: draft.subject,
      classes,
      isMinority: classes.length > 0 && classes.length < MAJOR_EXAM_CLASS_THRESHOLD,
    };
    m.upsertExamSlot(slot);
    setDraft({ ...draft, subject: "", classesText: "" });
  };

  const updateSlot = (id: string, patch: Partial<ExamSlot>) => {
    const cur = exam.examSlots.find((s) => s.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    if ("classes" in patch) {
      next.isMinority = next.classes.length > 0 && next.classes.length < MAJOR_EXAM_CLASS_THRESHOLD;
    }
    m.upsertExamSlot(next);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 2 — 시험표</h1>
        <p className="text-sm text-muted-foreground">
          날짜·교시·학년·과목·시험 보는 반을 입력합니다. 시험 반 수와 관계없이 해당 교과 교사는 그 교시 모든 감독 배정에서 제외됩니다.
          입력한 시험은 STEP 3에 정감독 1·부감독 1이 자동 반영됩니다. 특별실은 이름(예: 2층음악실A)으로
          선택하면 STEP 3 고사실과 자동 연결됩니다 (2학년 특별실 6곳 · 3학년 특별실 8곳). 자습감독은 일반 반(1학년 1~13 ·
          2학년 1~15 · 3학년 1~13)에만 채워집니다. 4교시에는 자습·복도를 넣지 않고 시험 고사실의 정·부감독만 채웁니다.
          복도감독 포함 여부는 STEP 3에서 고릅니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>새 시험 일정 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">날짜</label>
              {allDates.length > 0 ? (
                <Select value={draft.date} onValueChange={(v) => setDraft((d) => ({ ...d, date: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="날짜 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {allDates.map((d) => (
                      <SelectItem key={d} value={d}>
                        {shortDate(d)} ({weekdayKo(d)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">교시</label>
              <Input
                type="number"
                min={1}
                max={exam.periodCount}
                value={draft.period}
                onChange={(e) => setDraft((d) => ({ ...d, period: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">학년</label>
              <Select
                value={String(draft.grade)}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, grade: Number(v) as Grade, classesText: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">과목</label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="국어"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                시험반 (예: 1-8, 2층음악실A)
              </label>
              <Input
                value={draft.classesText}
                onChange={(e) => setDraft((d) => ({ ...d, classesText: e.target.value }))}
                placeholder={
                  draft.grade === 1
                    ? "1-8"
                    : `1-8 또는 ${specialRoomNamesForGrade(draft.grade)[0] ?? "특별실"} 등`
                }
              />
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4" /> 추가
            </Button>
          </div>
          <ClassPicker
            grade={draft.grade}
            classesText={draft.classesText}
            onChange={(classesText) => setDraft((d) => ({ ...d, classesText }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>시험 일정 ({sorted.length})</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>표 내 셀을 직접 수정할 수 있습니다.</span>
            <span className="flex flex-wrap items-center gap-2 text-xs">
              {([1, 2, 3] as Grade[]).map((g) => (
                <span
                  key={g}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5",
                    GRADE_LEGEND_CLASS[g],
                  )}
                >
                  {g}학년
                </span>
              ))}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 시험이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2">날짜</th>
                    <th className="p-2">교시</th>
                    <th className="p-2">학년</th>
                    <th className="p-2">과목</th>
                    <th className="p-2">시험반</th>
                    <th className="p-2">소수반</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr
                      key={s.id}
                      className={cn("border-t border-border/60 transition-colors", GRADE_ROW_CLASS[s.grade])}
                    >
                      <td className="p-2 whitespace-nowrap">
                        {shortDate(s.date)} ({weekdayKo(s.date)})
                      </td>
                      <td className="p-2">{s.period}교시</td>
                      <td className="p-2 font-medium">{s.grade}학년</td>
                      <td className="p-2">
                        <Input
                          value={s.subject}
                          onChange={(e) => updateSlot(s.id, { subject: e.target.value })}
                          className="h-8 bg-background/60"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          key={`${s.id}-${formatClassesDisplay(s.grade, s.classes)}`}
                          defaultValue={formatClassesDisplay(s.grade, s.classes)}
                          onBlur={(e) =>
                            updateSlot(s.id, {
                              classes: parseClassesDisplayInput(s.grade, e.target.value),
                            })
                          }
                          className="h-8 min-w-[12rem] bg-background/60"
                        />
                      </td>
                      <td className="p-2">
                        {s.isMinority ? <Badge variant="warning">소수과목</Badge> : null}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => m.removeExamSlot(s.id)}
                          aria-label="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <StepNavButtons currentPath="schedule" />
    </div>
  );
}
