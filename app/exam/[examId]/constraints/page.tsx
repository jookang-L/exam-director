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
import { eachDate, shortDate, weekdayKo } from "@/lib/utils";
import { Trash2, Plus } from "lucide-react";

export default function ConstraintsPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [teacherId, setTeacherId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [period, setPeriod] = React.useState<string>("");
  const [reason, setReason] = React.useState("");

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

  const addExclude = () => {
    if (!teacherId) return;
    const ex: ExcludeT = {
      id: newId(),
      teacherId,
      date: date || undefined,
      period: period ? Number(period) : undefined,
      reason: reason || undefined,
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
        <h1 className="text-2xl font-bold">STEP 7 — 제외 조건</h1>
        <p className="text-sm text-muted-foreground">
          출장·연수 등으로 감독을 맡길 수 없는 교사를 등록합니다. 슬롯 생성 전에도 설정할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>제외 조건</CardTitle>
          <CardDescription>
            날짜/교시를 비워두면 해당 교사의 전체 감독이 제외됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      {shortDate(d)} ({weekdayKo(d)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">교시 (선택)</label>
              <Input
                type="number"
                min={1}
                max={exam.periodCount}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">사유</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="출장 등" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addExclude}>
              <Plus className="h-4 w-4" /> 추가
            </Button>
            <Button variant="outline" onClick={addRangeExclude}>
              날짜 단위 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록된 제외 조건 ({exam.excludes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {exam.excludes.length === 0 ? (
            <p className="text-sm text-muted-foreground">제외 조건이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
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
                  return (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">{teacher?.name ?? e.teacherId}</td>
                      <td className="p-2">{e.date ? shortDate(e.date) : "전체"}</td>
                      <td className="p-2">{e.period ?? "전체"}</td>
                      <td className="p-2">{e.reason ?? ""}</td>
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
