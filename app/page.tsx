"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload, Trash2, Copy, Sparkles, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { listExams, saveExam, deleteExam, loadExam } from "@/lib/storage/db";
import { createEmptyExam, type ExamMeta } from "@/lib/types";
import { importExamJson, cloneExam } from "@/lib/io/json";
import { createSampleExam } from "@/lib/sample";
import { shortDate } from "@/lib/utils";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function HomePage() {
  const router = useRouter();
  const [exams, setExams] = React.useState<ExamMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newName, setNewName] = React.useState("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    const list = await listExams();
    setExams(list);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = newName.trim() || `시험 ${new Date().toLocaleDateString("ko-KR")}`;
    const exam = createEmptyExam(name);
    await saveExam(exam);
    router.push(`/exam/${exam.id}/setup`);
  };

  const handleImport = async (file: File) => {
    try {
      const exam = await importExamJson(file);
      await saveExam(exam);
      toast({ title: "불러오기 완료", description: exam.name, variant: "success" });
      router.push(`/exam/${exam.id}/setup`);
    } catch (err) {
      toast({
        title: "불러오기 실패",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleClone = async (id: string) => {
    const exam = await loadExam(id);
    if (!exam) return;
    const cloned = cloneExam(exam, `${exam.name} (복사)`);
    await saveExam(cloned);
    toast({
      title: "이전 시험 복사 완료",
      description: "시험 안의 모든 설정과 배정 내용이 그대로 복사되었습니다.",
      variant: "success",
    });
    router.push(`/exam/${cloned.id}/setup`);
  };

  const handleDelete = async (id: string) => {
    await deleteExam(id);
    await refresh();
  };

  const handleRename = async (id: string, name: string) => {
    const exam = await loadExam(id);
    if (!exam) return;
    const nextName = name.trim();
    if (!nextName || nextName === exam.name) return;
    await saveExam({ ...exam, name: nextName });
    toast({ title: "시험 이름을 변경했습니다.", description: nextName, variant: "success" });
    await refresh();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader subtitle="정기시험 감독표 자동 배정 · 모든 데이터는 이 브라우저에만 저장됩니다." />

      <main className="container flex-1 max-w-5xl px-4 py-8 sm:px-6">
        <Card className="mb-6 border-0 shadow-md">
          <CardHeader className="border-b bg-card pb-4">
            <CardTitle className="text-primary">새 시험 만들기</CardTitle>
            <CardDescription>STEP 0 — 시험 관리</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="examName" className="sr-only">
                  시험명
                </Label>
                <Input
                  id="examName"
                  placeholder="예: 2026학년도 1학기 중간고사"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-11 bg-card"
                />
              </div>
              <Button onClick={handleCreate} className="h-11 shrink-0">
                <Plus className="h-4 w-4" /> 새로 만들기
              </Button>
              <ImportJsonButton onPick={handleImport} />
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const sample = createSampleExam();
                  await saveExam(sample);
                  router.push(`/exam/${sample.id}/setup`);
                }}
              >
                <Sparkles className="h-4 w-4" /> 샘플 데이터로 시작
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-card pb-4">
            <CardTitle>이전 시험 목록</CardTitle>
            <CardDescription>
              기존 시험을 이어서 편집하거나 모든 설정을 그대로 복사할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            ) : exams.length === 0 ? (
              <p className="text-sm text-muted-foreground">저장된 시험이 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {exams.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/exam/${e.id}/setup`}
                        className="group flex items-center gap-1 font-semibold text-foreground hover:text-primary"
                      >
                        {e.name}
                        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        생성 {shortDate(e.createdAt)} · 수정 {shortDate(e.updatedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <RenameExamDialog
                        name={e.name}
                        onConfirm={(name) => handleRename(e.id, name)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClone(e.id)}
                        title="이전 시험을 그대로 복사"
                      >
                        <Copy className="h-4 w-4" /> 복사
                      </Button>
                      <DeleteConfirm name={e.name} onConfirm={() => handleDelete(e.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="paper-panel border-t py-4 text-center text-xs text-muted-foreground">
        설화고 시험감독표 · 클라이언트 전용 (IndexedDB)
      </footer>
    </div>
  );
}

function ImportJsonButton({ onPick }: { onPick: (file: File) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
      <Button variant="outline" onClick={() => ref.current?.click()} className="h-11 shrink-0">
        <Upload className="h-4 w-4" /> JSON 불러오기
      </Button>
    </>
  );
}

function RenameExamDialog({
  name,
  onConfirm,
}: {
  name: string;
  onConfirm: (name: string) => void | Promise<void>;
}) {
  const [value, setValue] = React.useState(name);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== name;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setValue(name);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" /> 이름 변경
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시험 이름 변경</DialogTitle>
          <DialogDescription>
            목록과 출력 파일명에 사용할 시험 이름을 수정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`rename-${name}`}>시험 이름</Label>
          <Input
            id={`rename-${name}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                void onConfirm(trimmed);
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={() => onConfirm(trimmed)} disabled={!canSave}>
              저장
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" /> 삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 삭제하시겠습니까?</DialogTitle>
          <DialogDescription>
            <strong>{name}</strong> 시험과 관련된 모든 데이터가 영구 삭제됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              삭제
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
