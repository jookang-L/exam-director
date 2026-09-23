import type { DutyType } from "@/lib/types";

/**
 * 학교 감독·수업 피로도 점수 (CSV 누적피로도와 동일 척도).
 * - 정·부감독: 100
 * - 자습·복도: 30
 * - 수업: 30 (시험 기간 중 아직 시험 전 학년 수업 — STEP 6 시간표 기준 자동 반영)
 */
export const FATIGUE_WEIGHT = {
  chief: 100,
  assistant: 100,
  selfStudy: 30,
  hall: 30,
  special: 100,
  classLesson: 30,
} as const;

/** dutyTypeId 미매칭 시 fallback */
export const DEFAULT_DUTY_WEIGHT_FALLBACK = FATIGUE_WEIGHT.chief;

/** STEP 10 업무강도 편차 경고: 정감독 2회분 이상 차이 */
export const FATIGUE_SPREAD_WARNING_MIN = 200;

/**
 * 솔버 — 정·부감독 횟수 균형 (후보 중 최소 대비 1회당 가산).
 * 피로도(100) 대비 약 40% — C6와 별도, 배정 우선순위에만 반영.
 */
export const CHIEF_ASSISTANT_BALANCE_PENALTY = 40;

/** Best-of에서 허용하는 정·부감독 횟수 편차 */
export const ROLE_BALANCE_ALLOWED_SPREAD = 1;

/** STEP 11 기본 — 1회 실행 (예전 속도 유지) */
export const SOLVER_DEFAULT_RUN_COUNT = 1;

/** 균형 강화(다회 탐색) — 슬롯 수에 따라 3~8회, 대기 시간이 그만큼 늘어남 */
export const SOLVER_MULTI_RUN_COUNT = 8;

export function enhancedSolverRuns(slotCount: number): number {
  if (slotCount >= 400) return 3;
  if (slotCount >= 200) return 5;
  return SOLVER_MULTI_RUN_COUNT;
}

/** @deprecated 기본 1회. 다회는 enhancedSolverRuns + runs 옵션 사용 */
export function recommendedSolverRuns(_slotCount: number): number {
  return SOLVER_DEFAULT_RUN_COUNT;
}

export const DEFAULT_DUTY_TYPES: DutyType[] = [
  { id: "dt_supervise", name: "자습감독", weight: FATIGUE_WEIGHT.selfStudy },
  { id: "dt_assistant", name: "부감독", weight: FATIGUE_WEIGHT.assistant },
  { id: "dt_chief", name: "정감독", weight: FATIGUE_WEIGHT.chief },
  { id: "dt_hall", name: "복도감독", weight: FATIGUE_WEIGHT.hall },
  { id: "dt_special", name: "특별실감독", weight: FATIGUE_WEIGHT.special },
];

export function dutyTypeWeightById(
  dutyTypes: DutyType[],
  dutyTypeId: string,
): number {
  return dutyTypes.find((d) => d.id === dutyTypeId)?.weight ?? DEFAULT_DUTY_WEIGHT_FALLBACK;
}
