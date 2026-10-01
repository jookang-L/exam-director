"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Plus, Trash2, Upload } from "lucide-react";
import { newId, type Grade, type RoleType, type Teacher } from "@/lib/types";
import { readCsvFile, readExcelFile, type SheetPreview } from "@/lib/io/excel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { SheetPreviewTable } from "@/components/upload/SheetPreviewTable";

const ROLE_TYPES: RoleType[] = ["정교사", "기간제", "강사", "보건교사", "영양교사", "평가담당"];

export default function TeachersPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [previews, setPreviews] = React.useState<SheetPreview[] | null>(null);
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [mapping, setMapping] = React.useState<Record<string, number>>({
    이름: 0,
    교과: 1,
    역할: 2,
    담임학년: 3,
    담임반: 4,
    누적피로도: 5,
  });
  const [headerRow, setHeaderRow] = React.useState(0);

  if (!exam) return null;

  const handleFile = async (file: File) => {
    try {
      const sheets = file.name.toLowerCase().endsWith(".csv")
        ? await readCsvFile(file)
        : await readExcelFile(file);
      setPreviews(sheets);
      setActiveSheet(0);
    } catch (err) {
      toast({
        title: "파일을 읽지 못했습니다",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const importTeachers = () => {
    if (!previews) return;
    const sheet = previews[activeSheet];
    if (!sheet) return;
    const dataRows = sheet.rows.slice(headerRow + 1);
    const created: Teacher[] = [];
    const nameCount = new Map<string, number>();
    for (const row of dataRows) {
      const name = String(row[mapping["이름"]] ?? "").trim();
      if (!name) continue;
      const subject = String(row[mapping["교과"]] ?? "").trim() || "기타";
      const roleRaw = String(row[mapping["역할"]] ?? "").trim();
      const roleType: RoleType = (ROLE_TYPES.includes(roleRaw as RoleType)
        ? (roleRaw as RoleType)
        : "정교사");
      const grade = Number(row[mapping["담임학년"]]);
      const klass = Number(row[mapping["담임반"]]);
      const fatigue = Number(row[mapping["누적피로도"]]);
      const dupCount = (nameCount.get(name) ?? 0) + 1;
      nameCount.set(name, dupCount);
      created.push({
        id: dupCount === 1 ? `t_${name}_${created.length}` : `t_${name}_${dupCount}`,
        name,
        subject,
        roleType,
        homeroomGrade: [1, 2, 3].includes(grade) ? (grade as Grade) : undefined,
        homeroomClass: Number.isFinite(klass) && klass > 0 ? klass : undefined,
        previousFatigueScore: Number.isFinite(fatigue) ? fatigue : 0,
      });
    }
    // Make IDs unique
    const merged = [...exam.teachers, ...created];
    const finalList = ensureUniqueIds(merged);
    m.replaceTeachers(finalList);
    setPreviews(null);
    toast({
      title: "교사 명단 가져옴",
      description: `${created.length}명을 명단에 추가했습니다.`,
      variant: "success",
    });
  };

  const addManual = () => {
    const t: Teacher = {
      id: newId(),
      name: "",
      subject: "",
      roleType: "정교사",
      previousFatigueScore: 0,
    };
    m.upsertTeacher(t);
  };

  const clearAll = () => {
    if (!confirm("모든 교사를 삭제할까요?")) return;
    m.replaceTeachers([]);
  };

  const dupNames = countDuplicates(exam.teachers);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 4 — 교사 명단</h1>
        <p className="text-sm text-muted-foreground">
          엑셀(.xlsx) 또는 CSV로 일괄 업로드하거나 직접 입력합니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>파일 업로드</CardTitle>
          <CardDescription>
            컬럼 순서: 이름 · 교과 · 역할 · 담임학년 · 담임반 · 누적피로도 (자유롭게 매핑 가능).
            누적피로도는 정·부 100, 자습·수업 30 점수 척도와 동일하게 입력하세요.
            교과는 쉼표(,)로 여러 과목 입력 가능 (예: 공통국어1, 화법과작문). 시험표와
            띄어쓰기나 Ⅰ/1 표기가 달라도 같은 과목으로 봅니다.
            역할이 <strong>강사</strong>인 교사는 <strong>부감독</strong>만 배정되며(C4), 하루 최대 3교시입니다. 가운데 자습 조건(C7b)은 면제됩니다.
            <strong>영양교사</strong>는 전체 일정에서 <strong>2교시 부감독</strong>을 교사당 연속 2일만 맡습니다(C9).
            <strong>평가담당</strong>은 자동 배정에서 빠지며, STEP 12에서 직접 배정할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
            className="text-sm"
          />

          {previews && previews.length > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {previews.map((p, i) => (
                  <Button
                    key={i}
                    variant={i === activeSheet ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveSheet(i)}
                  >
                    {p.sheetName}
                  </Button>
                ))}
              </div>

              <SheetPreviewTable rows={previews[activeSheet].rows} headerRowIndex={headerRow} />

              <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground">헤더 행</label>
                  <Input
                    type="number"
                    min={0}
                    value={headerRow}
                    onChange={(e) => setHeaderRow(Number(e.target.value))}
                    className="h-8"
                  />
                </div>
                {(["이름", "교과", "역할", "담임학년", "담임반", "누적피로도"] as const).map((k) => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground">{k} 컬럼</label>
                    <Input
                      type="number"
                      min={0}
                      value={mapping[k]}
                      onChange={(e) => setMapping((cur) => ({ ...cur, [k]: Number(e.target.value) }))}
                      className="h-8"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={importTeachers}>
                  <Upload className="h-4 w-4" /> 가져오기
                </Button>
                <Button variant="outline" onClick={() => setPreviews(null)}>
                  취소
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>교사 명단 ({exam.teachers.length})</CardTitle>
              {dupNames.length > 0 ? (
                <CardDescription className="text-amber-600">
                  동명이인 발견: {dupNames.join(", ")}
                </CardDescription>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addManual}>
                <Plus className="h-4 w-4" /> 직접 추가
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                전체 삭제
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {exam.teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 교사가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2">이름</th>
                    <th className="p-2">교과</th>
                    <th className="p-2">역할</th>
                    <th className="p-2">담임</th>
                    <th className="p-2">이전 피로도</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {exam.teachers.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2">
                        <Input
                          value={t.name}
                          className="h-8"
                          onChange={(e) => m.upsertTeacher({ ...t, name: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={t.subject}
                          className="h-8 w-32"
                          onChange={(e) => m.upsertTeacher({ ...t, subject: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={t.roleType}
                          onValueChange={(v) => m.upsertTeacher({ ...t, roleType: v as RoleType })}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_TYPES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Input
                          type="number"
                          min={1}
                          max={3}
                          placeholder="학년"
                          value={t.homeroomGrade ?? ""}
                          className="h-8 w-16 inline-block"
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            m.upsertTeacher({
                              ...t,
                              homeroomGrade: [1, 2, 3].includes(v) ? (v as Grade) : undefined,
                            });
                          }}
                        />
                        <span className="mx-1">-</span>
                        <Input
                          type="number"
                          min={1}
                          placeholder="반"
                          value={t.homeroomClass ?? ""}
                          className="h-8 w-16 inline-block"
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            m.upsertTeacher({
                              ...t,
                              homeroomClass: v > 0 ? v : undefined,
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step={0.1}
                          value={t.previousFatigueScore}
                          className="h-8 w-24"
                          onChange={(e) =>
                            m.upsertTeacher({ ...t, previousFatigueScore: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => m.removeTeacher(t.id)}
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

      <StepNavButtons currentPath="teachers" />
    </div>
  );
}

function countDuplicates(teachers: Teacher[]): string[] {
  const m = new Map<string, number>();
  for (const t of teachers) m.set(t.name, (m.get(t.name) ?? 0) + 1);
  const dups: string[] = [];
  m.forEach((n, name) => {
    if (n > 1) dups.push(`${name} (${n}명)`);
  });
  return dups;
}

function ensureUniqueIds(teachers: Teacher[]): Teacher[] {
  const seen = new Set<string>();
  return teachers.map((t) => {
    let id = t.id;
    let n = 2;
    while (seen.has(id)) {
      id = `${t.id}_${n++}`;
    }
    seen.add(id);
    return { ...t, id };
  });
}
