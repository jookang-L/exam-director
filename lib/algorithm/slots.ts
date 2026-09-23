import type { DutySlot, Exam } from "@/lib/types";
import { newId } from "@/lib/types";

// Generate DutySlots from STEP 2 (examSlots — to know which days/periods are exam-days)
// and STEP 3 (dutyDemands — per room/period/dutyType count).
// Strategy: for each unique (date, period) that appears in dutyDemands, for each demand row,
// emit `count` DutySlot rows (one per required person).
export function generateDutySlots(exam: Exam, existing: DutySlot[] = []): DutySlot[] {
  const out: DutySlot[] = [];
  const existingKey = (s: DutySlot) =>
    `${s.date}|${s.period}|${s.roomId}|${s.dutyTypeId}`;
  const existingBuckets = new Map<string, DutySlot[]>();
  for (const s of existing) {
    const k = existingKey(s);
    const arr = existingBuckets.get(k) ?? [];
    arr.push(s);
    existingBuckets.set(k, arr);
  }

  for (const d of exam.dutyDemands) {
    if (d.count <= 0) continue;
    const k = `${d.date}|${d.period}|${d.roomId}|${d.dutyTypeId}`;
    const reuse = existingBuckets.get(k) ?? [];
    for (let i = 0; i < d.count; i++) {
      const r = reuse[i];
      if (r) {
        out.push(r);
      } else {
        out.push({
          id: newId(),
          date: d.date,
          period: d.period,
          roomId: d.roomId,
          dutyTypeId: d.dutyTypeId,
        });
      }
    }
  }
  return out;
}
