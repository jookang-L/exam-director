"use client";

import * as React from "react";
import { useExam } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { FileSpreadsheet, FileJson } from "lucide-react";
import { exportTeacherGridWorkbook } from "@/lib/io/teacherGridExcel";
import { exportSupervisionSheetWorkbook } from "@/lib/io/supervisionSheetExcel";
import { exportExamJson } from "@/lib/io/json";
import { SupervisionSheetPreview } from "@/components/export/SupervisionSheetPreview";
import { toast } from "@/components/ui/use-toast";

export default function ExportPage() {
  const exam = useExam();

  if (!exam) return null;

  const exportSheet = async () => {
    try {
      const { warnings } = await exportSupervisionSheetWorkbook(exam);
      toast({
        title: "감독표 양식 엑셀을 다운로드했습니다.",
        description: warnings.length > 0 ? `양식에 맞지 않는 항목 ${warnings.length}건 — 미리보기 아래 목록을 확인하세요.` : undefined,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "감독표 양식 내보내기 실패",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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
          학교 양식 감독표 엑셀, 감독누계 엑셀, JSON으로 결과를 내보낼 수 있습니다.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">파일 내보내기</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>감독시간표</CardTitle>
              <CardDescription>날짜별 시트 · 학교 감독표 양식</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button onClick={exportSheet} className="w-full">
                <FileSpreadsheet className="h-4 w-4" /> 감독표 양식 맞춰 내보내기
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>감독누계</CardTitle>
              <CardDescription>
                교사별 감독 횟수·누계
                <br />
                (STEP 12 엑셀과 같은 파일)
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button onClick={exportSupervisorSummaryExcel} className="w-full">
                <FileSpreadsheet className="h-4 w-4" /> 감독누계 내보내기
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>JSON</CardTitle>
              <CardDescription>백업 · 다른 컴퓨터에서 불러오기</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button onClick={exportJson} className="w-full">
                <FileJson className="h-4 w-4" /> JSON 내보내기
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>미리보기 (감독표 양식)</CardTitle>
          <CardDescription>「감독표 양식 맞춰 내보내기」로 받는 엑셀과 같은 모양입니다. 날짜 탭으로 바꿔 볼 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupervisionSheetPreview exam={exam} />
        </CardContent>
      </Card>

      <StepNavButtons currentPath="export" />
    </div>
  );
}
