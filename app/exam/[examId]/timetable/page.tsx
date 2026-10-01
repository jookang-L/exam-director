"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { newId, type Grade, type TeacherTimetable } from "@/lib/types";
import { readCsvFile, readExcelFile, type SheetPreview } from "@/lib/io/excel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { SheetPreviewTable } from "@/components/upload/SheetPreviewTable";

const WEEKDAYS = ["월", "화", "수", "목", "금"] as const;

type Mode = "teacherRow" | "periodRow";

export default function TimetablePage() {
  const exam = useExam();
  const m = useExamMutators();
  const [previews, setPreviews] = React.useState<SheetPreview[] | null>(null);
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [mode, setMode] = React.useState<Mode>("teacherRow");
  const [headerRow, setHeaderRow] = React.useState(0);
  const [teacherCol, setTeacherCol] = React.useState(0);
  const [dataStartCol, setDataStartCol] = React.useState(1);

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

  // Mode 1: each row = a teacher, columns = weekday×period grouped
  // Assumed header row has labels like "월1" "월2" ... or merged days with period rows
  // Simpler heuristic: parse header cells for weekday+period
  const importMode1 = () => {
    if (!previews) return;
    const sheet = previews[activeSheet];
    if (!sheet) return;
    if (exam.teachers.length === 0) {
      toast({
        title: "STEP 4 교사 명단이 비어 있습니다",
        description: "먼저 교사 명단을 등록한 뒤 시간표를 가져오세요.",
        variant: "destructive",
      });
      return;
    }

    const header = sheet.rows[headerRow] ?? [];
    const dataRows = sheet.rows.slice(headerRow + 1);

    const colMap = new Map<number, { weekday: typeof WEEKDAYS[number]; period: number }>();
    let skippedByPeriod = 0;
    for (let c = dataStartCol; c < header.length; c++) {
      const label = String(header[c] ?? "").trim();
      const match = label.match(/([월화수목금])\s*(\d+)/);
      if (match) {
        const wd = match[1] as typeof WEEKDAYS[number];
        const period = Number(match[2]);
        if (period > 0 && period <= exam.periodCount) {
          colMap.set(c, { weekday: wd, period });
        } else if (period > exam.periodCount) {
          skippedByPeriod++;
        }
      }
    }

    if (colMap.size === 0) {
      toast({
        title: "헤더에서 요일·교시 정보를 찾지 못했습니다",
        description:
          skippedByPeriod > 0
            ? `STEP 1 교시 수(${exam.periodCount})보다 큰 교시 열이 있습니다. 교시 수를 늘리거나 파일을 확인하세요.`
            : "예: '월1', '월2' 같은 형식의 헤더가 필요합니다.",
        variant: "destructive",
      });
      return;
    }

    const created: TeacherTimetable[] = [];
    const unmatched = new Set<string>();
    for (const row of dataRows) {
      const rawName = String(row[teacherCol] ?? "").trim();
      if (!rawName) continue;
      const teacher = findTeacherByName(exam.teachers, rawName);
      if (!teacher) {
        unmatched.add(normalizeTeacherName(rawName));
        continue;
      }
      colMap.forEach(({ weekday, period }, col) => {
        const cell = String(row[col] ?? "").trim();
        if (!cell) return;
        const { grade, className, subject } = parseCell(cell);
        created.push({
          id: newId(),
          teacherId: teacher.id,
          weekday,
          period,
          grade,
          className,
          subject,
        });
      });
    }

    finishImport(created, unmatched, skippedByPeriod, exam.timetable.length === 0);
  };

  const importMode2 = () => {
    if (!previews) return;
    const sheet = previews[activeSheet];
    if (!sheet) return;
    const header = sheet.rows[headerRow] ?? [];
    const dataRows = sheet.rows.slice(headerRow + 1);

    const colToTeacher = new Map<number, string>();
    const unmatched = new Set<string>();
    for (let c = dataStartCol; c < header.length; c++) {
      const name = String(header[c] ?? "").trim();
      if (!name) continue;
      const teacher = findTeacherByName(exam.teachers, name);
      if (teacher) colToTeacher.set(c, teacher.id);
      else unmatched.add(normalizeTeacherName(name));
    }
    if (colToTeacher.size === 0) {
      toast({
        title: "헤더에서 교사 이름을 찾지 못했습니다",
        description: "헤더 행이 교사 명단에 있는 이름과 일치해야 합니다.",
        variant: "destructive",
      });
      return;
    }
    const created: TeacherTimetable[] = [];
    for (const row of dataRows) {
      const label = String(row[teacherCol] ?? "").trim();
      const match = label.match(/([월화수목금])\s*(\d+)/);
      if (!match) continue;
      const weekday = match[1] as typeof WEEKDAYS[number];
      const period = Number(match[2]);
      if (period > exam.periodCount) continue;
      colToTeacher.forEach((teacherId, col) => {
        const cell = String(row[col] ?? "").trim();
        if (!cell) return;
        const { grade, className, subject } = parseCell(cell);
        created.push({
          id: newId(),
          teacherId,
          weekday,
          period,
          grade,
          className,
          subject,
        });
      });
    }
    finishImport(created, unmatched, 0, exam.timetable.length === 0);
  };

  const finishImport = (
    created: TeacherTimetable[],
    unmatched: Set<string>,
    skippedByPeriod: number,
    replace: boolean,
  ) => {
    if (created.length === 0) {
      const sample = Array.from(unmatched).slice(0, 5).join(", ");
      toast({
        title: "가져온 시간표가 없습니다",
        description:
          unmatched.size > 0
            ? `STEP 4에 없는 교사 ${unmatched.size}명(예: ${sample}). 교사명이 파일과 같은지 확인하세요.`
            : skippedByPeriod > 0
              ? `STEP 1 교시 수(${exam.periodCount})를 확인하세요.`
              : "매칭된 수업 셀이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    m.replaceTimetable(replace ? created : [...exam.timetable, ...created]);
    setPreviews(null);

    const unmatchedNote =
      unmatched.size > 0 ? ` · STEP 4 미등록 ${unmatched.size}명 제외` : "";
    const periodNote =
      skippedByPeriod > 0
        ? ` · ${exam.periodCount}교시 초과 열 ${skippedByPeriod}개 무시`
        : "";

    toast({
      title: "시간표 반영 완료",
      description: `${created.length}건 저장됨${unmatchedNote}${periodNote}`,
      variant: unmatched.size > 0 || skippedByPeriod > 0 ? "warning" : "success",
    });
  };

  const clearAll = () => {
    if (!confirm("시간표를 전부 삭제할까요?")) return;
    m.replaceTimetable([]);
  };

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 6 — 교사 시간표</h1>
        <p className="text-sm text-muted-foreground">
          학교별 형식 차이를 흡수하기 위해 두 가지 매핑 모드를 지원합니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>시간표 업로드</CardTitle>
          <CardDescription>
            ① 파일 선택 → 미리보기 ② 「가져오기」로 저장. 교사 이름은 STEP 4와 동일해야 합니다.
            현재 시간표가 (0)이면 아직 반영되지 않은 상태입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild>
            <a href="/templates/timetable-upload-template.xlsx" download="시간표_업로드_양식.xlsx">
              양식 내려받기
            </a>
          </Button>
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
              <div className="flex gap-2 flex-wrap">
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

              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList>
                  <TabsTrigger value="teacherRow">모드 1: 행=교사, 열=요일·교시</TabsTrigger>
                  <TabsTrigger value="periodRow">모드 2: 행=요일·교시, 열=교사</TabsTrigger>
                </TabsList>
                <TabsContent value="teacherRow" className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground">헤더 행</label>
                      <Input type="number" min={0} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">교사명 컬럼</label>
                      <Input type="number" min={0} value={teacherCol} onChange={(e) => setTeacherCol(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">데이터 시작 컬럼</label>
                      <Input type="number" min={0} value={dataStartCol} onChange={(e) => setDataStartCol(Number(e.target.value))} className="h-8" />
                    </div>
                  </div>
                  <Button onClick={importMode1}>가져오기 (모드 1)</Button>
                </TabsContent>
                <TabsContent value="periodRow" className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground">헤더 행 (교사 이름)</label>
                      <Input type="number" min={0} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">라벨 컬럼 (월1 등)</label>
                      <Input type="number" min={0} value={teacherCol} onChange={(e) => setTeacherCol(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">데이터 시작 컬럼</label>
                      <Input type="number" min={0} value={dataStartCol} onChange={(e) => setDataStartCol(Number(e.target.value))} className="h-8" />
                    </div>
                  </div>
                  <Button onClick={importMode2}>가져오기 (모드 2)</Button>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>현재 시간표 ({exam.timetable.length})</CardTitle>
              <CardDescription>교사·요일·교시별 수업 기록입니다. 행을 직접 추가/삭제할 수 있습니다.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={exam.timetable.length === 0}>
              전체 삭제
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {exam.teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">먼저 STEP 4에서 교사 명단을 등록해주세요.</p>
          ) : (
            <ManualTimetableEditor
              onAdd={(row) => m.replaceTimetable([...exam.timetable, row])}
              onRemove={(id) => m.replaceTimetable(exam.timetable.filter((r) => r.id !== id))}
              rows={exam.timetable}
              teachers={exam.teachers}
              periodCount={exam.periodCount}
            />
          )}
        </CardContent>
      </Card>

      <StepNavButtons currentPath="timetable" />
    </div>
  );
}

function normalizeTeacherName(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*\(\d+\)\s*$/);
  return m ? m[1].trim() : s;
}

function findTeacherByName(
  teachers: { id: string; name: string }[],
  raw: string,
): { id: string; name: string } | undefined {
  const normalized = normalizeTeacherName(raw);
  return teachers.find(
    (t) => t.name === raw.trim() || t.name === normalized || normalizeTeacherName(t.name) === normalized,
  );
}

function parseCell(s: string): { grade?: Grade; className?: string; subject?: string } {
  const text = s.replace(/\r\n/g, "\n").trim();
  // 1-7 국어
  const dash = text.match(/^([123])-(\d+)\s*(.*)$/);
  if (dash) {
    const grade = Number(dash[1]) as Grade;
    return {
      grade,
      className: dash[2],
      subject: dash[3] || undefined,
    };
  }
  // 107 + 줄바꿈 + 국어 (원본 시간표)
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const roomLine = lines.find((l) => /^\d{3}$/.test(l));
  if (roomLine) {
    const grade = Number(roomLine[0]) as Grade;
    const className = String(Number(roomLine.slice(1)));
    const subject = lines.find((l) => l !== roomLine) || undefined;
    if ([1, 2, 3].includes(grade)) {
      return { grade: grade as Grade, className, subject };
    }
  }
  return { subject: text };
}

function ManualTimetableEditor({
  rows,
  teachers,
  periodCount,
  onAdd,
  onRemove,
}: {
  rows: TeacherTimetable[];
  teachers: { id: string; name: string }[];
  periodCount: number;
  onAdd: (row: TeacherTimetable) => void;
  onRemove: (id: string) => void;
}) {
  const [teacherId, setTeacherId] = React.useState("");
  const [weekday, setWeekday] = React.useState<typeof WEEKDAYS[number]>("월");
  const [period, setPeriod] = React.useState(1);
  const [grade, setGrade] = React.useState<string>("");
  const [className, setClassName] = React.useState("");
  const [subject, setSubject] = React.useState("");

  const add = () => {
    if (!teacherId) return;
    onAdd({
      id: newId(),
      teacherId,
      weekday,
      period,
      grade: [1, 2, 3].includes(Number(grade)) ? (Number(grade) as Grade) : undefined,
      className: className || undefined,
      subject: subject || undefined,
    });
    setSubject("");
    setClassName("");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground">교사</label>
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">요일</label>
          <Select value={weekday} onValueChange={(v) => setWeekday(v as typeof WEEKDAYS[number])}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">교시</label>
          <Input type="number" min={1} max={periodCount} className="h-8" value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">학년</label>
          <Input type="number" min={1} max={3} className="h-8" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">반</label>
          <Input className="h-8" value={className} onChange={(e) => setClassName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">과목</label>
          <Input className="h-8" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <Button onClick={add} size="sm">
          행 추가
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">교사</th>
              <th className="p-2">요일·교시</th>
              <th className="p-2">학년-반</th>
              <th className="p-2">과목</th>
              <th className="p-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => {
              const teacher = teachers.find((t) => t.id === r.teacherId);
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{teacher?.name ?? "?"}</td>
                  <td className="p-2">{r.weekday}{r.period}</td>
                  <td className="p-2">{r.grade ? `${r.grade}-${r.className ?? ""}` : ""}</td>
                  <td className="p-2">{r.subject ?? ""}</td>
                  <td className="p-2">
                    <Button variant="ghost" size="icon" onClick={() => onRemove(r.id)}>
                      <span className="sr-only">삭제</span>
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 200 ? (
          <p className="text-xs text-muted-foreground py-2">앞 200건만 표시 (총 {rows.length}건)</p>
        ) : null}
      </div>
    </div>
  );
}
