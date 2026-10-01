import type { AverageTotalFatigueResult } from "@/lib/algorithm/averageFatigue";

type Props = {
  stats: AverageTotalFatigueResult;
  /** 헤더 배지 등 좁은 공간용 */
  compact?: boolean;
  className?: string;
};

export function FatigueSummaryLine({ stats, compact, className }: Props) {
  if (stats.count === 0) return null;

  const basis = compact
    ? `(${stats.count}명)`
    : `(${stats.count}명 · 강사·영양·평가담당·전체제외 제외)`;

  const highest = stats.highest
    ? `최고 ${stats.highest.total.toFixed(1)}(${stats.highest.teacher.name})`
    : null;
  const lowest = stats.lowest
    ? `최저 ${stats.lowest.total.toFixed(1)}(${stats.lowest.teacher.name})`
    : null;

  if (compact) {
    return (
      <span className={className}>
        평균 {stats.average.toFixed(1)}
        {highest ? ` · ${highest}` : ""}
        {lowest ? ` · ${lowest}` : ""} {basis}
      </span>
    );
  }

  return (
    <p className={className ?? "text-sm font-medium pt-1"}>
      평균 누적도 <span className="font-mono">{stats.average.toFixed(1)}</span>
      {stats.highest ? (
        <>
          {" · "}
          최고 <span className="font-mono">{stats.highest.total.toFixed(1)}</span>
          <span className="text-muted-foreground font-normal">
            {" "}
            ({stats.highest.teacher.name})
          </span>
        </>
      ) : null}
      {stats.lowest ? (
        <>
          {" · "}
          최저 <span className="font-mono">{stats.lowest.total.toFixed(1)}</span>
          <span className="text-muted-foreground font-normal">
            {" "}
            ({stats.lowest.teacher.name})
          </span>
        </>
      ) : null}
      <span className="text-muted-foreground font-normal ml-2">{basis}</span>
    </p>
  );
}
