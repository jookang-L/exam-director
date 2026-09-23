"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Save, Undo2, Redo2 } from "lucide-react";
import { useExamStore, startAutosave, stopAutosave } from "@/lib/store/examStore";
import { loadExam } from "@/lib/storage/db";
import { Stepper } from "./Stepper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STEPS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { runPreflight, hasErrors } from "@/lib/validation/rules";

type Props = {
  examId: string;
  children: React.ReactNode;
};

export function WizardFrame({ examId, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [loaded, setLoaded] = React.useState(false);
  const exam = useExamStore((s) => s.exam);
  const isSaving = useExamStore((s) => s.isSaving);
  const isDirty = useExamStore((s) => s.isDirty);
  const setExam = useExamStore((s) => s.setExam);

  const segments = (pathname ?? "").split("/").filter(Boolean);
  const currentPath = segments[segments.length - 1] === examId ? "" : segments[segments.length - 1];

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadExam(examId);
      if (!loaded) {
        toast({
          title: "시험을 찾을 수 없습니다",
          description: "목록으로 돌아갑니다",
          variant: "destructive",
        });
        router.push("/");
        return;
      }
      if (!cancelled) {
        setExam(loaded);
        setLoaded(true);
      }
    })();
    startAutosave();
    return () => {
      cancelled = true;
      stopAutosave();
      setExam(null);
    };
  }, [examId, router, setExam]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
        e.preventDefault();
        useExamStore.temporal.getState().undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        const target = e.target as HTMLElement | null;
        if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
        e.preventDefault();
        useExamStore.temporal.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded || !exam) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="site-header-bar h-14" />
        <div className="container flex flex-1 items-center py-10">
          <p className="text-muted-foreground">불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-20 shadow-md">
        <div className="site-header-bar flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 text-sm font-bold tracking-wide text-primary-foreground sm:text-base"
          >
            설화고 시험감독표
          </Link>
          <div className="hidden h-5 w-px bg-primary-foreground/30 sm:block" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm text-primary-foreground/90" title={exam.name}>
            {exam.name}
          </p>
          <UndoRedoButtons />
          <SaveBadge isSaving={isSaving} isDirty={isDirty} />
        </div>
        <Stepper examId={examId} currentPath={currentPath} />
      </header>
      <main className={cn("flex-1 py-6", currentPath === "review" ? "px-2 sm:px-4" : "px-4 sm:px-6")}>
        <div
          className={cn(
            "mx-auto w-full min-w-0",
            currentPath === "review" ? "max-w-none" : "max-w-6xl",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function SaveBadge({ isSaving, isDirty }: { isSaving: boolean; isDirty: boolean }) {
  if (isSaving) {
    return (
      <Badge variant="secondary" className="gap-1 border-0 bg-white/20 text-primary-foreground">
        <Save className="h-3 w-3 animate-pulse" /> 저장 중
      </Badge>
    );
  }
  if (isDirty) {
    return (
      <Badge variant="secondary" className="gap-1 border-0 bg-white text-primary">
        <Save className="h-3 w-3" /> 수정됨
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 border-0 bg-white/15 text-primary-foreground">
      <Save className="h-3 w-3" /> 저장됨
    </Badge>
  );
}

function UndoRedoButtons() {
  const [_, force] = React.useState(0);
  React.useEffect(() => {
    return useExamStore.temporal.subscribe(() => force((x) => x + 1));
  }, []);
  const t = useExamStore.temporal.getState();
  return (
    <div className="flex gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
        onClick={() => t.undo()}
        disabled={t.pastStates.length === 0}
        title="실행 취소 (Ctrl+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
        onClick={() => t.redo()}
        disabled={t.futureStates.length === 0}
        title="다시 실행 (Ctrl+Y)"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function StepNavButtons({
  currentPath,
  disableNext,
  disableNextTitle,
}: {
  currentPath: string;
  disableNext?: boolean;
  disableNextTitle?: string;
}) {
  const router = useRouter();
  const exam = useExamStore((s) => s.exam);
  const wizard = STEPS.filter((s) => s.path !== "");
  const idx = wizard.findIndex((s) => s.path === currentPath);
  const prev = idx > 0 ? wizard[idx - 1] : null;
  const next = idx >= 0 && idx < wizard.length - 1 ? wizard[idx + 1] : null;

  const goNext = () => {
    if (!next || !exam) return;
    const validateIndex = wizard.findIndex((s) => s.path === "validate");
    const targetIndex = wizard.findIndex((s) => s.path === next.path);
    if (validateIndex >= 0 && targetIndex > validateIndex) {
      const issues = runPreflight(exam);
      if (hasErrors(issues)) {
        toast({
          title: "사전 검증 오류",
          description: "STEP 10의 오류를 해결한 후 다음 단계로 이동해주세요.",
          variant: "destructive",
        });
        return;
      }
    }
    router.push(`/exam/${exam.id}/${next.path}`);
  };

  return (
    <div className="flex justify-between border-t pt-6">
      {prev ? (
        <Button variant="outline" onClick={() => router.push(`/exam/${exam?.id}/${prev.path}`)}>
          ← {prev.label}
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button disabled={disableNext} title={disableNext ? disableNextTitle : undefined} onClick={goNext}>
          {next.label} →
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
