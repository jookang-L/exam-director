import type { Exam } from "@/lib/types";
import { SCHEMA_VERSION, newId } from "@/lib/types";
import { downloadBlob } from "@/lib/utils";
import { examSchema } from "./examSchema";

export function exportExamJson(exam: Exam) {
  const safe = JSON.stringify(exam, null, 2);
  const blob = new Blob([safe], { type: "application/json" });
  const filename = `${exam.name || "exam"}.json`;
  downloadBlob(blob, filename);
}

export async function importExamJson(file: File): Promise<Exam> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 파싱에 실패했습니다");
  }
  const result = examSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).slice(0, 3).join("; ");
    throw new Error(`올바른 시험 JSON이 아닙니다: ${msg}`);
  }
  const exam = result.data as Exam;
  if (exam.schemaVersion !== SCHEMA_VERSION) {
    console.warn("schemaVersion 다름 - 호환 가능한 형태로 가공 시도");
  }
  return exam;
}

export function cloneExam(exam: Exam, newName: string): Exam {
  const now = new Date().toISOString();
  return {
    ...structuredClone(exam),
    id: newId(),
    name: newName,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
  };
}
