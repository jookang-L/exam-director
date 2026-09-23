"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { TeacherSearchSelect } from "@/components/TeacherSearchSelect";
import { newId, type Exam, type Preassign } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shortDate } from "@/lib/utils";
import { Trash2, Plus } from "lucide-react";

export default function PreassignPage() {
  const exam = useExam();
  const m = useExamMutators();

  if (!exam) return null;

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 9 — 우선 / 고정 배정</h1>
        <p className="text-sm text-muted-foreground">
          STEP 8에서 만든 감독 슬롯에 특정 교사를 미리 지정합니다. 자동 배정 전에 등록하며, STEP 12에서도 자물쇠로 고정할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>우선/고정 배정</CardTitle>
          <CardDescription>
            고정은 반드시 해당 슬롯에 배정되고, 우선은 가능하면 해당 교사를 먼저 고려합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.dutySlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">STEP 8에서 감독 슬롯을 먼저 생성해주세요.</p>
          ) : (
            <PreassignForm exam={exam} onAdd={(p) => m.upsertPreassign(p)} />
          )}
          {exam.preassigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">현재 등록된 우선/고정 배정이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">교사</th>
                  <th className="p-2">슬롯</th>
                  <th className="p-2">우선순위</th>
                  <th className="p-2">사유</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {exam.preassigns.map((p) => {
                  const teacher = exam.teachers.find((t) => t.id === p.teacherId);
                  const slot = exam.dutySlots.find((s) => s.id === p.dutySlotId);
                  const room = slot ? exam.rooms.find((r) => r.id === slot.roomId)?.name : "?";
                  const dt = slot ? exam.dutyTypes.find((d) => d.id === slot.dutyTypeId)?.name : "";
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{teacher?.name ?? p.teacherId}</td>
                      <td className="p-2">
                        {slot ? `${shortDate(slot.date)} ${slot.period}교시 ${room} · ${dt}` : "?"}
                      </td>
                      <td className="p-2">{p.priority === "fixed" ? "고정" : "우선"}</td>
                      <td className="p-2">{p.reason ?? ""}</td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" onClick={() => m.removePreassign(p.id)}>
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

      <StepNavButtons currentPath="preassign" />
    </div>
  );
}

function PreassignForm({
  exam,
  onAdd,
}: {
  exam: Exam;
  onAdd: (p: Preassign) => void;
}) {
  const [teacherId, setTeacherId] = React.useState("");
  const [slotId, setSlotId] = React.useState("");
  const [priority, setPriority] = React.useState<"fixed" | "preferred">("fixed");
  const [preReason, setPreReason] = React.useState("");

  const slotOptions = [...exam.dutySlots]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.period !== b.period) return a.period - b.period;
      return a.roomId.localeCompare(b.roomId);
    });

  React.useEffect(() => {
    if (!slotId) return;
    if (!slotOptions.some((s) => s.id === slotId)) setSlotId("");
  }, [slotId, slotOptions]);

  const add = () => {
    if (!teacherId || !slotId) return;
    onAdd({
      id: newId(),
      teacherId,
      dutySlotId: slotId,
      priority,
      reason: preReason || undefined,
    });
    setPreReason("");
  };

  return (
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
      <div className="md:col-span-2">
        <label className="text-xs text-muted-foreground">슬롯</label>
        <Select value={slotId} onValueChange={setSlotId}>
          <SelectTrigger>
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            {slotOptions.map((s) => {
              const room = exam.rooms.find((r) => r.id === s.roomId)?.name ?? s.roomId;
              const dt = exam.dutyTypes.find((d) => d.id === s.dutyTypeId)?.name ?? "";
              return (
                <SelectItem key={s.id} value={s.id}>
                  {shortDate(s.date)} {s.period}교시 · {room} · {dt}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">우선순위</label>
        <Select value={priority} onValueChange={(v) => setPriority(v as "fixed" | "preferred")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">고정</SelectItem>
            <SelectItem value="preferred">우선</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-4">
        <label className="text-xs text-muted-foreground">사유 (선택)</label>
        <Input value={preReason} onChange={(e) => setPreReason(e.target.value)} placeholder="예: 학년부장 지정" />
      </div>
      <div>
        <Button onClick={add} className="w-full">
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>
    </div>
  );
}
