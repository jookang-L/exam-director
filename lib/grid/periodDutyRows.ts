import type { Exam } from "@/lib/types";

/** 감독표 행 순서: 정감독 → 부감독 → 자습감독 → 기타 */
export const DUTY_TYPE_ROW_ORDER = [
  "정감독",
  "부감독",
  "자습감독",
  "복도감독",
  "특별실감독",
] as const;

export function dutyTypeDisplayOrder(name: string): number {
  const idx = DUTY_TYPE_ROW_ORDER.indexOf(name as (typeof DUTY_TYPE_ROW_ORDER)[number]);
  return idx >= 0 ? idx : 99;
}

export function compareDutyTypesByDisplayOrder(a: { name: string }, b: { name: string }): number {
  return dutyTypeDisplayOrder(a.name) - dutyTypeDisplayOrder(b.name);
}

export type PeriodDutyRow = {
  period: number;
  dutyTypeId: string;
  dutyTypeName: string;
  rowSpan: number;
  isFirstInPeriod: boolean;
};

/** 슬롯이 실제로 있는 (교시 × 감독종류) 행만 반환 — rowSpan 계산용 */
export function periodDutyRowsForDate(
  exam: Exam,
  date: string,
  periods: number[],
): PeriodDutyRow[] {
  const rows: PeriodDutyRow[] = [];
  for (const period of periods) {
    const activeTypes = exam.dutyTypes
      .filter((dt) =>
        exam.dutySlots.some(
          (s) => s.date === date && s.period === period && s.dutyTypeId === dt.id,
        ),
      )
      .sort(compareDutyTypesByDisplayOrder);
    activeTypes.forEach((dt, i) => {
      rows.push({
        period,
        dutyTypeId: dt.id,
        dutyTypeName: dt.name,
        rowSpan: activeTypes.length,
        isFirstInPeriod: i === 0,
      });
    });
  }
  return rows;
}
