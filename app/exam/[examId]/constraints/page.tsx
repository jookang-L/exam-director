"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { TeacherSearchSelect } from "@/components/TeacherSearchSelect";
import { newId, type Exclude as ExcludeT } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateWithWeekday, eachDate } from "@/lib/utils";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { isDutyAllowRule } from "@/lib/algorithm/constraints";
import { conflictsByExclude, conflictsFor, type ExcludeConflict } from "@/lib/algorithm/excludeConflicts";

export default function ConstraintsPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [teacherId, setTeacherId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [period, setPeriod] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [mode, setMode] = React.useState<"exclude" | "allow">("exclude");
  const [allowedIds, setAllowedIds] = React.useState<string[]>([]);

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

  const candidate = React.useMemo<ExcludeT | null>(() => {
    if (!teacherId) return null;
    if (mode === "allow" && allowedIds.length === 0) return null;
    return {
      id: "__candidate__",
      teacherId,
      date: date || undefined,
      period: period ? Number(period) : undefined,
      reason: reason || undefined,
      allowedDutyTypeIds: mode === "allow" ? allowedIds : undefined,
    };
  }, [teacherId, date, period, reason, mode, allowedIds]);

  const candidateConflicts = React.useMemo<ExcludeConflict[]>(
    () => (exam && candidate ? conflictsFor(exam, candidate) : []),
    [exam, candidate],
  );
  const rowConflicts = React.useMemo<Map<string, ExcludeConflict[]>>(
    () => (exam ? conflictsByExclude(exam) : new Map()),
    [exam],
  );

  if (!exam) return null;

  const dutyName = (id: string) => exam.dutyTypes.find((d) => d.id === id)?.name ?? id;
  const toggleAllowed = (id: string) =>
    setAllowedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addExclude = () => {
    if (!teacherId) return;
    if (mode === "allow" && allowedIds.length === 0) return;
    const ex: ExcludeT = {
      id: newId(),
      teacherId,
      date: date || undefined,
      period: period ? Number(period) : undefined,
      reason: reason || undefined,
      allowedDutyTypeIds: mode === "allow" ? allowedIds : undefined,
    };
    m.upsertExclude(ex);
    setReason("");
  };

  const addRangeExclude = () => {
    if (!teacherId || !date) return;
    const ex: ExcludeT = {
      id: newId(),
      teacherId,
      date: date,
      period: period ? Number(period) : undefined,
      reason: reason || "출장/연수",
    };
    m.upsertExclude(ex);
    setReason("");
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 7 — 특정 감독 지정/제외</h1>
        <p className="text-sm text-muted-foreground">
          출장·연수 등으로 감독을 맡길 수 없는 교사를 제외하거나, 특정 날짜에 맡을 수 있는 감독 종류를 제한합니다. 슬롯 생성 전에도 설정할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>조건 추가</CardTitle>
          <CardDescription>
            날짜만 고르고 교시를 전체로 두면 그날 모든 교시에 적용됩니다. 날짜와 교시를 모두 전체로 두면 고사 기간 전체에 적용됩니다.
            허용 조건은 선택한 감독 종류만 맡길 수 있고, 같은 시간대에 여러 개이면 교집합만 허용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "exclude" ? "default" : "outline"}
              onClick={() => setMode("exclude")}
            >
              제외 (감독 불가)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "allow" ? "default" : "outline"}
              onClick={() => setMode("allow")}
            >
              허용 조건 (선택한 감독만)
            </Button>
            {mode === "allow" && (
              <div className="flex flex-wrap items-center gap-1 ml-2">
                {exam.dutyTypes.map((d) => {
                  const on = allowedIds.includes(d.id);
                  return (
                    <Button
                      key={d.id}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      className={on ? "border border-sky-500 bg-sky-500/15" : ""}
                      aria-pressed={on}
                      onClick={() => toggleAllowed(d.id)}
                    >
                      {d.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">교사</label>
              <TeacherSearchSelect
                teachers={exam.teachers}
                value={teacherId}
                onValueChange={setTeacherId}
                placeholder="교사 선택"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">날짜 (선택)</label>
              <Select value={date || "_none"} onValueChange={(v) => setDate(v === "_none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체</SelectItem>
                  {allDates.map((d) => (
                    <SelectItem key={d} value={d}>
                      {dateWithWeekday(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">교시 (선택)</label>
              <Select value={period || "_none"} onValueChange={(v) => setPeriod(v === "_none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체</SelectItem>
                  {Array.from({ length: exam.periodCount }, (_, i) => i + 1).map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}교시
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">사유</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="출장 등" />
            </div>
          </div>
          {mode === "allow" && allowedIds.length === 0 && (
            <p className="text-xs text-muted-foreground">허용할 감독 종류를 하나 이상 선택하세요.</p>
          )}
          {candidateConflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-1"
            >
              <div className="flex items-center gap-1 font-medium">
                <AlertTriangle className="h-4 w-4" /> 이미 등록된 조건과 겹칩니다
              </div>
              {candidateConflicts.map((c, i) => (
                <p key={i}>· {c.message}</p>
              ))}
              <p className="text-xs text-muted-foreground">그대로 추가할 수는 있습니다.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={addExclude}>
              <Plus className="h-4 w-4" /> 추가
            </Button>
            {mode === "exclude" && (
              <Button variant="outline" onClick={addRangeExclude}>
                날짜 단위 추가
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록된 조건 ({exam.excludes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {exam.excludes.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 조건이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 w-40">구분</th>
                  <th className="p-2">교사</th>
                  <th className="p-2">날짜</th>
                  <th className="p-2">교시</th>
                  <th className="p-2">사유</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {exam.excludes.map((e) => {
                  const teacher = exam.teachers.find((t) => t.id === e.teacherId);
                  const allow = isDutyAllowRule(e);
                  const conflicts = rowConflicts.get(e.id) ?? [];
                  return (
                    <tr
                      key={e.id}
                      className={`border-t ${allow ? "bg-sky-500/10 border-l-4 border-l-sky-500" : ""}`}
                    >
                      <td className="p-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            allow
                              ? "bg-sky-500/20 text-sky-900 dark:text-sky-200"
                              : "bg-red-500/15 text-red-900 dark:text-red-200"
                          }`}
                        >
                          {allow
                            ? `허용 · ${e.allowedDutyTypeIds!.map(dutyName).join("·")}만`
                            : "제외"}
                        </span>
                      </td>
                      <td className="p-2">{teacher?.name ?? e.teacherId}</td>
                      <td className="p-2">{e.date ? dateWithWeekday(e.date) : "전체"}</td>
                      <td className="p-2">{e.period ?? "전체"}</td>
                      <td className="p-2">
                        {e.reason ?? ""}
                        {conflicts.map((c, i) => (
                          <div
                            key={i}
                            className={`text-xs flex items-start gap-1 ${
                              c.severity === "warning" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
                            }`}
                          >
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {c.message}
                          </div>
                        ))}
                      </td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" onClick={() => m.removeExclude(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <StepNavButtons currentPath="constraints" />
    </div>
  );
}
