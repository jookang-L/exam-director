export const FIXED_SOLVER_SEEDS = Array.from(
  { length: 8 },
  (_, index) => index * 7919 + 1,
);

export const ENHANCED_SOLVER_MAX_RUNS = 12;

export function fixedSolverSeeds(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index * 7919 + 1);
}

/** 고정 8개에 실행마다 새로운 32-bit seed 4개를 더한다. */
export function buildEnhancedSolverSeeds(random: () => number = Math.random): number[] {
  const seeds = new Set(FIXED_SOLVER_SEEDS);
  for (let index = 0; index < 4; index++) {
    seeds.add(Math.floor(random() * 0x100000000) >>> 0);
  }
  return Array.from(seeds);
}
