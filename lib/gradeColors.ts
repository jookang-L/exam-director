import type { Grade } from "@/lib/types";

/** STEP 2 시험표와 동일한 학년 색상 */
export const GRADE_CHIP_CLASS: Record<Grade, string> = {
  1: "bg-[hsl(211_38%_82%)] border-[hsl(211_45%_58%)]",
  2: "bg-[hsl(46_42%_78%)] border-[hsl(46_50%_52%)]",
  3: "bg-[hsl(142_32%_80%)] border-[hsl(142_38%_48%)]",
};
