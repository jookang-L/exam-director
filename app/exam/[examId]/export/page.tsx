"use client";

import * as React from "react";
import { useExam } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { FileSpreadsheet, FileJson } from "lucide-react";
import { exportTeacherGridWorkbook, exportTeacherGridWorkbooksByDay } from "@/lib/io/teacherGridExcel";
import {
  exportSupervisionSheetWorkbook,
  exportSupervisionSheetWorkbooksByDay,
} from "@/lib/io/supervisionSheetExcel";
import { examDays } from "@/lib/io/dayExport";
import { exportExamJson } from "@/lib/io/json";
import { SupervisionSheetPreview } from "@/components/export/SupervisionSheetPreview";
import { toast } from "@/components/ui/use-toast";

function ExportCard({
  title,
  description,
  label,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  description: React.ReactNode;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button onClick={onClick} disabled={disabled} className="w-full">
          {icon} {label}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ExportPage() {
  const exam = useExam();
  const [busy, setBusy] = React.useState(false);

  if (!exam) return null;

  const days = examDays(exam);
  const dayCount = days.length;
  const sheetIcon = <FileSpreadsheet className="h-4 w-4" />;

  const failToast = (title: string, err: unknown) =>
    toast({ title, description: err instanceof Error ? err.message : String(err), variant: "destructive" });

  const warningText = (warnings: string[]) =>
    warnings.length > 0 ? `양식에 맞지 않는 항목 ${warnings.length}건 — 미리보기 아래 목록을 확인하세요.` : undefined;

  const exportSheet = async () => {
    try {
      const { warnings } = await exportSupervisionSheetWorkbook(exam);
      toast({
        title: "감독시간표(전체) 엑셀을 다운로드했습니다.",
        description: warningText(warnings),
        variant: "success",
      });
    } catch (err) {
      failToast("감독시간표(전체) 내보내기 실패", err);
    }
  };

  const exportSummary = async () => {
    try {
      await exportTeacherGridWorkbook(exam, { filenameSuffix: "감독누계" });
      toast({ title: "감독누계(전체) 엑셀을 다운로드했습니다.", variant: "success" });
    } catch (err) {
      failToast("감독누계(전체) 내보내기 실패", err);
    }
  };

  const exportJson = () => {
    exportExamJson(exam);
    toast({ title: "JSON 파일을 저장했습니다.", variant: "success" });
  };

  const exportSheetByDay = async () => {
    setBusy(true);
    try {
      const { count, warnings } = await exportSupervisionSheetWorkbooksByDay(exam);
      toast({
        title: `감독시간표(일별) ${count}개 파일을 다운로드했습니다.`,
        description: warningText(warnings),
        variant: "success",
      });
    } catch (err) {
      failToast("감독시간표(일별) 내보내기 실패", err);
    } finally {
      setBusy(false);
    }
  };

  const exportSummaryByDay = async () => {
    setBusy(true);
    try {
      const { count } = await exportTeacherGridWorkbooksByDay(exam);
      toast({ title: `감독누계(일별) ${count}개 파일을 다운로드했습니다.`, variant: "success" });
    } catch (err) {
      failToast("감독누계(일별) 내보내기 실패", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 15 — 출력</h1>
        <p className="text-sm text-muted-foreground">
          학교 양식 감독표 엑셀, 감독누계 엑셀(전체·일별), JSON으로 결과를 내보낼 수 있습니다.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">파일 내보내기 1 · 전체</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ExportCard
            title="감독시간표(전체)"
            description="날짜별 시트 · 학교 감독표 양식"
            label="감독시간표(전체) 내보내기"
            icon={sheetIcon}
            onClick={exportSheet}
          />
          <ExportCard
            title="감독누계(전체)"
            description={
              <>
                교사별 감독 횟수·누계
                <br />
                (STEP 12 엑셀과 같은 파일)
              </>
            }
            label="감독누계(전체) 내보내기"
            icon={sheetIcon}
            onClick={exportSummary}
          />
          <ExportCard
            title="JSON"
            description="백업 · 다른 컴퓨터에서 불러오기"
            label="JSON 내보내기"
            icon={<FileJson className="h-4 w-4" />}
            onClick={exportJson}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">파일 내보내기 2 · 일별</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ExportCard
            title="감독시간표(일별)"
            description={
              <>
                시험일마다 엑셀 1개씩
                <br />({dayCount}개 파일)
              </>
            }
            label="감독시간표(일별) 내보내기"
            icon={sheetIcon}
            onClick={exportSheetByDay}
            disabled={busy || dayCount === 0}
          />
          <ExportCard
            title="감독누계(일별)"
            description={
              <>
                시험일마다 그날까지의 누계 (화요일 = 월 + 화)
                <br />({dayCount}개 파일)
              </>
            }
            label="감독누계(일별) 내보내기"
            icon={sheetIcon}
            onClick={exportSummaryByDay}
            disabled={busy || dayCount === 0}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          일별 내보내기는 시험일 수만큼 파일이 차례로 내려받아집니다. 브라우저가 「여러 파일 다운로드」 허용을 물으면 허용해 주세요.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>미리보기 (감독표 양식)</CardTitle>
          <CardDescription>「감독시간표(전체)」로 받는 엑셀과 같은 모양입니다. 날짜 탭으로 바꿔 볼 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupervisionSheetPreview exam={exam} />
        </CardContent>
      </Card>

      <StepNavButtons currentPath="export" />
    </div>
  );
}
