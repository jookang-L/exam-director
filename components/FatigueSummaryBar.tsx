import type { AverageTotalFatigueResult } from "@/lib/algorithm/averageFatigue";

export function FatigueSummaryBar({ stats }: { stats: AverageTotalFatigueResult }) {
  if (stats.count === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <div>
        <div className="text-xs text-muted-foreground mb-1">평균 누적도</div>
        <div className="font-mono text-lg font-semibold">{stats.average.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {stats.count}명 · 강사·영양·평가담당·전체제외 제외
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">최고</div>
        {stats.highest ? (
          <>
            <div className="font-mono text-lg font-semibold">{stats.highest.total.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">{stats.highest.teacher.name}</div>
          </>
        ) : (
          <div className="text-muted-foreground">—</div>
        )}
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">최저</div>
        {stats.lowest ? (
          <>
            <div className="font-mono text-lg font-semibold">{stats.lowest.total.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">{stats.lowest.teacher.name}</div>
          </>
        ) : (
          <div className="text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}
