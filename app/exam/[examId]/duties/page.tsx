"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Plus, Trash2 } from "lucide-react";
import { newId, DEFAULT_DUTY_TYPES } from "@/lib/types";
import { FATIGUE_WEIGHT } from "@/lib/fatigueWeights";

export default function DutiesPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [name, setName] = React.useState("");
  const [weight, setWeight] = React.useState<number>(FATIGUE_WEIGHT.chief);

  if (!exam) return null;

  const add = () => {
    if (!name.trim()) return;
    m.upsertDutyType({ id: newId(), name: name.trim(), weight });
    setName("");
    setWeight(FATIGUE_WEIGHT.chief);
  };

  const resetDefaults = () => {
    if (!confirm("기본 감독 종류로 초기화하시겠습니까?")) return;
    m.replaceDutyTypes(DEFAULT_DUTY_TYPES.map((d) => ({ ...d })));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 5 — 감독 종류 / 곤란도</h1>
        <p className="text-sm text-muted-foreground">
          곤란도는 업무강도·이전 누적피로도(CSV)와 같은 점수 척도입니다. 정·부감독 100, 자습·복도 30.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>감독 종류</CardTitle>
          <CardDescription>
            기본값: 정·부감독 100, 자습·복도 30, 특별실 100. 「기본값 복원」으로 맞출 수 있습니다.
            "자습감독"과 "복도감독" 이름은 C7 완충 규칙에서 그대로 사용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exam.dutyTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">감독 종류가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">이름</th>
                  <th className="p-2">곤란도</th>
                  <th className="p-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {exam.dutyTypes.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      <Input
                        className="h-8"
                        value={d.name}
                        onChange={(e) => m.upsertDutyType({ ...d, name: e.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step={1}
                        min={0}
                        className="h-8 w-24"
                        value={d.weight}
                        onChange={(e) =>
                          m.upsertDutyType({ ...d, weight: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => m.removeDutyType(d.id)}
                        aria-label="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="새 감독 종류 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <Input
              type="number"
              step={0.1}
              className="w-24"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 0)}
            />
            <Button onClick={add}>
              <Plus className="h-4 w-4" /> 추가
            </Button>
            <Button variant="outline" onClick={resetDefaults}>
              기본값
            </Button>
          </div>
        </CardContent>
      </Card>

      <StepNavButtons currentPath="duties" />
    </div>
  );
}
