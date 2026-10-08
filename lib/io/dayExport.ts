import type { Exam } from "@/lib/types";
import { downloadBlob, weekdayKo } from "@/lib/utils";

/** 감독시간표·감독누계를 날짜별로 내보낼 때 쓰는 시험일 목록 (감독 슬롯 또는 시험표가 있는 날짜, 오름차순) */
export function examDays(exam: Exam): string[] {
  const dates = new Set<string>();
  for (const s of exam.dutySlots) dates.add(s.date);
  for (const s of exam.examSlots) dates.add(s.date);
  return Array.from(dates).filter(Boolean).sort();
}

/** 파일 이름에 붙이는 날짜 — 예: 10.12(월) */
export function dayFileLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}.${d}(${weekdayKo(date)})`;
}

/**
 * 시험 시작일부터 `date`까지의 데이터만 남긴 시험 (감독누계 일별용).
 * 감독 횟수·곤란도·시험 기간 수업이 모두 감독 슬롯·배정·학년별 시험 일정에서 계산되므로,
 * 이 셋을 `date`까지로 자르면 기존 감독누계 계산을 그대로 써서 그날까지의 누계가 나온다.
 */
export function examThroughDate(exam: Exam, date: string): Exam {
  const dutySlots = exam.dutySlots.filter((s) => s.date <= date);
  const slotIds = new Set(dutySlots.map((s) => s.id));
  return {
    ...exam,
    dutySlots,
    assignments: exam.assignments.filter((a) => slotIds.has(a.dutySlotId)),
    preassigns: exam.preassigns.filter((p) => slotIds.has(p.dutySlotId)),
    dutyDemands: exam.dutyDemands.filter((d) => d.date <= date),
    examSlots: exam.examSlots.filter((s) => s.date <= date),
    gradeSchedule: exam.gradeSchedule.map((gs) => {
      if (!gs.startDate) return gs;
      // 그날까지 시험이 시작되지 않은 학년은 일정을 비워 정규 수업 중으로 본다
      if (gs.startDate > date) return { ...gs, startDate: "", endDate: "" };
      return !gs.endDate || gs.endDate > date ? { ...gs, endDate: date } : gs;
    }),
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 여러 파일을 차례로 내려받는다. 브라우저는 한 번에 여러 파일을 받을 때 허용을 물을 수 있다.
 * 너무 빠르게 연달아 시작하면 일부가 무시될 수 있어 파일 사이에 짧은 간격을 둔다.
 */
export async function downloadBlobsSequentially(
  files: Array<{ blob: Blob; filename: string }>,
  gapMs = 500,
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    downloadBlob(files[i].blob, files[i].filename);
    if (i < files.length - 1) await sleep(gapMs);
  }
}
