import type {
  AverageTotalFatigueResult,
  CurrentExamFatigueResult,
  FatigueTeacherExtreme,
} from "@/lib/algorithm/averageFatigue";

type Props = {
  total: AverageTotalFatigueResult;
  current: CurrentExamFatigueResult;
};

export function FinalFatigueSummary({ total, current }: Props) {
  return (
    <div className="space-y-5">
      <FatigueGroup
        title="최종 총 곤란도"
        formula="이전 곤란도 × 이월율 + 이번 시험 곤란도"
        count={total.count}
        average={total.average}
        highest={total.highest}
        lowest={total.lowest}
        basis={`${total.count}명 · 강사·영양·평가담당·전체제외·이전 곤란도 0 제외`}
        emptyMessage="이전 곤란도가 입력된 교사가 없어 집계할 수 없습니다."
      />
      <FatigueGroup
        title="이번 시험 곤란도"
        formula="이번 시험 감독 곤란도 + 시험 기간 수업 부담"
        count={current.count}
        average={current.average}
        highest={current.highest}
        lowest={current.lowest}
        basis={`${current.count}명 · 강사·영양·평가담당·전체제외 제외 (이전 곤란도 0인 교사는 포함)`}
        emptyMessage="집계할 교사가 없습니다."
      />
    </div>
  );
}

function FatigueGroup({
  title,
  formula,
  count,
  average,
  highest,
  lowest,
  basis,
  emptyMessage,
}: {
  title: string;
  formula: string;
  count: number;
  average: number;
  highest: FatigueTeacherExtreme | null;
  lowest: FatigueTeacherExtreme | null;
  basis: string;
  emptyMessage: string;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{formula}</span>
      </div>
      {count === 0 ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-3">
            <Stat label="평균" value={average} />
            <Stat label="최고" value={highest?.total} teacherName={highest?.teacher.name} />
            <Stat label="최저" value={lowest?.total} teacherName={lowest?.teacher.name} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{basis}</p>
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  teacherName,
}: {
  label: string;
  value: number | undefined;
  teacherName?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {value == null ? (
        <div className="text-muted-foreground">—</div>
      ) : (
        <>
          <div className="font-mono text-lg font-semibold">{value.toFixed(1)}</div>
          {teacherName ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">{teacherName}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
