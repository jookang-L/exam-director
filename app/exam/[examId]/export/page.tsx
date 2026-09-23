"use client";

import * as React from "react";
import { useReactToPrint } from "react-to-print";
import { useExam } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Printer, FileSpreadsheet, FileJson } from "lucide-react";
import { exportAssignmentsWorkbook } from "@/lib/io/excel";
import { exportTeacherGridWorkbook } from "@/lib/io/teacherGridExcel";
import { exportExamJson } from "@/lib/io/json";
import { FullGridPrint, DailyPrint, TeacherPrint } from "@/components/print/FullGrid";
import { toast } from "@/components/ui/use-toast";

export default function ExportPage() {
  const exam = useExam();
  const fullRef = React.useRef<HTMLDivElement>(null);
  const dailyRef = React.useRef<HTMLDivElement>(null);
  const teacherRef = React.useRef<HTMLDivElement>(null);

  const printFull = useReactToPrint({ contentRef: fullRef, documentTitle: `${exam?.name ?? "exam"}_전체` });
  const printDaily = useReactToPrint({ contentRef: dailyRef, documentTitle: `${exam?.name ?? "exam"}_일별` });
  const printTeacher = useReactToPrint({ contentRef: teacherRef, documentTitle: `${exam?.name ?? "exam"}_개인별` });

  if (!exam) return null;

  const dates = Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();
  const teacherIds = exam.teachers.map((t) => t.id);

  const exportExcel = async () => {
    try {
      await exportAssignmentsWorkbook(exam);
      toast({ title: "엑셀 파일을 다운로드했습니다.", variant: "success" });
    } catch (err) {
      toast({ title: "엑셀 내보내기 실패", description: String(err), variant: "destructive" });
    }
  };

  const exportSupervisorSummaryExcel = async () => {
    try {
      await exportTeacherGridWorkbook(exam, { filenameSuffix: "감독누계" });
      toast({ title: "감독누계 엑셀을 다운로드했습니다.", variant: "success" });
    } catch (err) {
      toast({ title: "감독누계 내보내기 실패", description: String(err), variant: "destructive" });
    }
  };

  const exportJson = () => {
    exportExamJson(exam);
    toast({ title: "JSON 파일을 저장했습니다.", variant: "success" });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 15 — 출력</h1>
        <p className="text-sm text-muted-foreground">
          PDF(브라우저 인쇄), 엑셀, JSON으로 결과를 내보낼 수 있습니다.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>전체 감독표</CardTitle>
            <CardDescription>날짜 × 교시 × 고사실 통합 표</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => printFull()} className="w-full">
              <Printer className="h-4 w-4" /> PDF / 인쇄
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>일별 감독표</CardTitle>
            <CardDescription>날짜마다 별도 페이지</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => printDaily()} className="w-full">
              <Printer className="h-4 w-4" /> PDF / 인쇄
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>개인별 감독표</CardTitle>
            <CardDescription>교사마다 별도 페이지</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => printTeacher()} className="w-full">
              <Printer className="h-4 w-4" /> PDF / 인쇄
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>파일 내보내기</CardTitle>
          <CardDescription>
            엑셀은 날짜별 감독표 시트와 개인별 요약 시트를 포함합니다. JSON은 다른 컴퓨터에서도 불러올 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> 엑셀 다운로드 (.xlsx)
          </Button>
          <Button variant="outline" onClick={exportSupervisorSummaryExcel}>
            <FileSpreadsheet className="h-4 w-4" /> 감독누계 다운로드 (.xlsx)
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <FileJson className="h-4 w-4" /> JSON 저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>미리보기 (전체 감독표)</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={fullRef} className="bg-white border rounded-md overflow-x-auto">
            <FullGridPrint exam={exam} />
          </div>
        </CardContent>
      </Card>

      <div className="hidden">
        <div ref={dailyRef}>
          <DailyPrint exam={exam} dates={dates} />
        </div>
        <div ref={teacherRef}>
          <TeacherPrint exam={exam} teacherIds={teacherIds} />
        </div>
      </div>

      <StepNavButtons currentPath="export" />
    </div>
  );
}
