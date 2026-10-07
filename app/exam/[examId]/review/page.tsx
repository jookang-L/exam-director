"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  Download,
  Lock,
  Search,
  Unlock,
  Wand2,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { ConstraintContext } from "@/lib/algorithm/constraints";
import {
  getTeacherPeriodExcludeLabel,
  getTeacherSlotExcludeLabel,
  isTeacherExcludedForPeriod,
  isTeacherExcludedForSlot,
} from "@/lib/algorithm/excludeVisualization";
import {
  classifyManualAssignFit,
  confirmManualC4Override,
  confirmManualC8Override,
  confirmManualC7bOverride,
  evaluateForManualAssign,
  isManualOverrideReason,
  manualAssignReasonMessages,
  manualOverrideReasonFor,
} from "@/lib/algorithm/manualAssignValidation";
import { planSlotSwap, swapConfirmMessage } from "@/lib/algorithm/slotSwap";
import { computeAverageTotalFatigue } from "@/lib/algorithm/averageFatigue";
import { FatigueSummaryLine } from "@/components/FatigueSummaryLine";
import { reassignSubsetAsync } from "@/lib/algorithm/runSolverAsync";
import { runFullValidation } from "@/lib/validation/rules";
import {
  isAcknowledgedIssue,
  issueAckKey,
  loadAcknowledgedWarningKeys,
  saveAcknowledgedWarningKeys,
} from "@/lib/validation/acknowledgedWarnings";
import { newId } from "@/lib/types";
import type { Assignment, DutySlot, Exam, Teacher } from "@/lib/types";
import { cn, dateWithWeekday } from "@/lib/utils";
import {
  buildTeacherSlotLookup,
  buildTeacherClassLookup,
  flattenTeacherGridColumns,
  formatPeriodExamEntry,
  formatTimetableClassRoom,
  formatTimetableClassTitle,
  normalizePeriodGroups,
  periodGroupEdgeClass,
  periodGroupWidthRem,
  periodHeaderBgClass,
  teacherDutyCounts,
  teacherFatigueBreakdown,
  teacherGridPeriodGroupsForDate,
  TEACHER_GRID_CLASS_SHADE_CLASS,
  TEACHER_GRID_CLASS_TEXT_CLASS,
  TEACHER_GRID_COUNT_COL_CLASS,
  TEACHER_GRID_COUNT_COL_REM,
  TEACHER_GRID_DUTY_COUNT_COLUMNS,
  TEACHER_GRID_EXCLUDE_SHADE_CLASS,
  TEACHER_GRID_EXCLUDE_TEXT_CLASS,
  TEACHER_GRID_DUTY_COL_CLASS,
  TEACHER_GRID_DUTY_COL_REM,
  TEACHER_GRID_FATIGUE_COL_CLASS,
  TEACHER_GRID_FATIGUE_COLUMNS,
  TEACHER_GRID_FATIGUE_COL_REM,
  TEACHER_GRID_FIXED_COL_COUNT,
  TEACHER_GRID_NAME_COL_CLASS,
  TEACHER_GRID_NAME_COL_REM,
  TEACHER_GRID_SCROLL_CLASS,
  type PeriodExamEntry,
  type TeacherCellData,
  type TeacherGridColumn,
} from "@/lib/grid/teacherDayGrid";
import { GRADE_CHIP_CLASS } from "@/lib/gradeColors";
import { exportTeacherGridWorkbook } from "@/lib/io/teacherGridExcel";
import { toast } from "@/components/ui/use-toast";

function normalizeTeacherSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

/** 쉼표·세미콜론·줄바꿈으로 구분한 여러 검색어 (예: "김철수, 이영희"). 공백은 구분자가 아니다. */
function parseTeacherSearchTerms(value: string): string[] {
  return value
    .split(/[,，、;；\n]+/)
    .map(normalizeTeacherSearch)
    .filter((term) => term.length > 0);
}

function teacherSearchText(teacher: Teacher): string {
  return normalizeTeacherSearch(
    [
      teacher.name,
      teacher.subject,
      teacher.roleType,
      teacher.homeroomGrade ? `${teacher.homeroomGrade}학년` : "",
      teacher.homeroomClass ? `${teacher.homeroomClass}반` : "",
      teacher.homeroomGrade && teacher.homeroomClass
        ? `${teacher.homeroomGrade}-${teacher.homeroomClass}`
        : "",
    ].join(" "),
  );
}

export default function ReviewPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [reassigning, setReassigning] = React.useState(false);
  const [showAllTeachers, setShowAllTeachers] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [teacherQuery, setTeacherQuery] = React.useState("");
  const [lockedPeriods, setLockedPeriods] = React.useState<Set<number>>(() => new Set());
  const [limitToDayTeachers, setLimitToDayTeachers] = React.useState(false);
  const [acknowledgedIssueKeys, setAcknowledgedIssueKeys] = React.useState<Set<string>>(
    () => new Set(),
  );

  const dates = React.useMemo(
    () => (exam ? Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort() : []),
    [exam],
  );

  React.useEffect(() => {
    if (!exam) return;
    setAcknowledgedIssueKeys(loadAcknowledgedWarningKeys(exam.id));
  }, [exam?.id]);

  React.useEffect(() => {
    if (!selectedDay && dates.length > 0) setSelectedDay(dates[0]);
  }, [dates, selectedDay]);

  const issues = React.useMemo(() => (exam ? runFullValidation(exam) : []), [exam]);
  const averageFatigue = React.useMemo(
    () => (exam ? computeAverageTotalFatigue(exam) : null),
    [exam],
  );
  const issuesBySlot = React.useMemo(() => {
    const map = new Map<string, typeof issues>();
    for (const i of issues) {
      const k = i.target?.dutySlotId;
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(i);
      map.set(k, arr);
    }
    return map;
  }, [issues]);

  if (!exam) return null;

  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);

  const toggleLockedPeriod = (period: number) => {
    setLockedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  };

  const handleReassignDay = () => {
    if (!selectedDay || reassigning) return;
    const daySlots = exam.dutySlots.filter((s) => s.date === selectedDay);
    const daySlotIds = new Set(daySlots.map((s) => s.id));
    const slotIds = daySlots
      .filter((s) => !lockedPeriods.has(s.period))
      .map((s) => s.id);
    const allowedTeacherIds = limitToDayTeachers
      ? Array.from(
          new Set(
            exam.assignments
              .filter((a) => daySlotIds.has(a.dutySlotId))
              .map((a) => a.teacherId),
          ),
        )
      : undefined;

    if (slotIds.length === 0) {
      toast({
        title: "재배정할 교시가 없습니다",
        description: "고정하지 않을 교시를 하나 이상 남겨주세요.",
        variant: "destructive",
      });
      return;
    }
    if (limitToDayTeachers && allowedTeacherIds?.length === 0) {
      toast({
        title: "감독 고정 후보가 없습니다",
        description: "선택한 날짜에 이미 배정된 감독이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setReassigning(true);
    void reassignSubsetAsync(exam, slotIds, { allowedTeacherIds })
      .then((next) => {
        m.replaceAssignments(next);
        toast({ title: `${dateWithWeekday(selectedDay)} 재배정 완료`, variant: "success" });
      })
      .catch((err) => {
        toast({
          title: "재배정 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      })
      .finally(() => setReassigning(false));
  };

  const handleExportExcel = () => {
    if (exporting) return;
    setExporting(true);
    void exportTeacherGridWorkbook(exam)
      .then(() => {
        toast({ title: "교사별 감독표 엑셀을 다운로드했습니다.", variant: "success" });
      })
      .catch((err) => {
        toast({
          title: "엑셀 내보내기 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      })
      .finally(() => setExporting(false));
  };

  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");
  const acknowledgedErrors = errorIssues.filter((i) => isAcknowledgedIssue(i, acknowledgedIssueKeys));
  const acknowledgedWarnings = warningIssues.filter((i) =>
    isAcknowledgedIssue(i, acknowledgedIssueKeys),
  );
  const acknowledgedCount = acknowledgedErrors.length + acknowledgedWarnings.length;
  const activeErrorCount = errorIssues.length - acknowledgedErrors.length;
  const activeWarningCount = warningIssues.length - acknowledgedWarnings.length;

  const acknowledgeIssue = (key: string) => {
    setAcknowledgedIssueKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      if (exam) saveAcknowledgedWarningKeys(exam.id, next);
      return next;
    });
  };

  const acknowledgeErrorIssue = (issue: (typeof issues)[number]) => {
    const ok = window.confirm(
      [
        "규칙 오류를 확인 처리합니다.",
        "",
        `· ${issue.message}`,
        "",
        "의도한 예외(예: STEP 7 제외 조건이 우선인 경우)일 때만 확인하세요.",
        "확인하면 이 오류는 이상없음으로 표시되고, STEP 13 추천 계산에서도 제외됩니다.",
      ].join("\n"),
    );
    if (ok) acknowledgeIssue(issueAckKey(issue));
  };

  const slotHandlers = {
    onAssign: (slotId: string, teacherId: string) => {
      const existing = exam.assignments.find((a) => a.dutySlotId === slotId);
      const slot = exam.dutySlots.find((item) => item.id === slotId);
      const teacher = exam.teachers.find((item) => item.id === teacherId);
      if (!slot || !teacher) return;
      if (existing?.fixed) return;

      // 이 슬롯에 남아 있는 이전 수동 예외는 평가에서 빼야, 같은 교사를 다시 선택해도 예외 여부를 다시 확인한다.
      const generatedOverride = exam.preassigns.find(
        (p) => p.dutySlotId === slotId && isManualOverrideReason(p.reason),
      );
      const evaluation = evaluateForManualAssign(
        {
          exam: generatedOverride
            ? { ...exam, preassigns: exam.preassigns.filter((p) => p.id !== generatedOverride.id) }
            : exam,
          assignments: exam.assignments.filter((a) => a.dutySlotId !== slotId),
        },
        slot,
        teacher,
      );
      if (!evaluation.allowed) {
        toast({
          title: "배정할 수 없습니다",
          description: evaluation.blocking.map((reason) => reason.message).join(" · "),
          variant: "destructive",
        });
        return;
      }
      if (evaluation.needsC4Confirm && !confirmManualC4Override(evaluation.c4)) {
        return;
      }
      if (evaluation.needsC7bConfirm && !confirmManualC7bOverride(evaluation.c7b)) {
        return;
      }
      if (evaluation.needsC8Confirm && !confirmManualC8Override(evaluation.c8)) {
        return;
      }

      const overrideReason = manualOverrideReasonFor(evaluation);
      if (overrideReason) {
        m.upsertPreassign({
          id: generatedOverride?.id ?? newId(),
          teacherId,
          dutySlotId: slotId,
          priority: "preferred",
          reason: overrideReason,
        });
      } else if (generatedOverride) {
        m.removePreassign(generatedOverride.id);
      }

      m.upsertAssignment(
        existing
          ? { ...existing, teacherId }
          : {
              id: newId(),
              dutySlotId: slotId,
              teacherId,
              fixed: false,
            },
      );
    },
    onClear: (slotId: string) => {
      const existing = exam.assignments.find((a) => a.dutySlotId === slotId);
      if (existing && !existing.fixed) m.removeAssignment(existing.id);
      const generatedOverride = exam.preassigns.find(
        (p) => p.dutySlotId === slotId && isManualOverrideReason(p.reason),
      );
      if (generatedOverride) m.removePreassign(generatedOverride.id);
    },
    onToggleFixed: (slotId: string) => {
      const existing = exam.assignments.find((a) => a.dutySlotId === slotId);
      if (!existing) return;
      m.setFixed(existing.id, !existing.fixed);
    },
    /** 두 칸의 교사를 서로 맞바꾼다. 교체했으면 true, 막히거나 취소했으면 false. */
    onSwap: (slotIdA: string, slotIdB: string): boolean => {
      const plan = planSlotSwap(exam, slotIdA, slotIdB);
      if (!plan.ok) {
        toast({ title: "바꿀 수 없습니다", description: plan.message, variant: "destructive" });
        return false;
      }
      if (plan.exceptionMessages.length > 0 && !window.confirm(swapConfirmMessage(plan.exceptionMessages))) {
        return false;
      }
      m.patchExam({ assignments: plan.assignments, preassigns: plan.preassigns });
      const [a, b] = plan.sides;
      toast({
        title: `${a.teacher.name} ⇄ ${b.teacher.name} 교체 완료`,
        description:
          plan.exceptionMessages.length > 0 ? "확인한 예외가 반영되었습니다." : undefined,
        variant: "success",
      });
      return true;
    },
  };

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">STEP 12 — 수동 수정 / 실시간 검증</h1>
          <p className="text-sm text-muted-foreground">
            행=교사, 열=교시(정·부·자습). 셀에는 고사실이 표시됩니다. 클릭하여 수정합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {averageFatigue && averageFatigue.count > 0 ? (
            <Badge variant="outline" className="font-normal">
              <FatigueSummaryLine stats={averageFatigue} compact />
            </Badge>
          ) : null}
          <Badge variant={activeErrorCount > 0 ? "destructive" : "outline"}>오류 {activeErrorCount}</Badge>
          <Badge variant="warning">경고 {activeWarningCount}</Badge>
          {acknowledgedCount > 0 ? (
            <Badge variant="outline" className="font-normal">
              확인됨 {acknowledgedCount}
            </Badge>
          ) : null}
        </div>
      </header>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-1">
            {dates.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === selectedDay ? "default" : "outline"}
                onClick={() => setSelectedDay(d)}
              >
                {dateWithWeekday(d)}
              </Button>
            ))}
            <div className="flex-1" />
            <div className="relative w-full min-w-[12rem] sm:w-72">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={teacherQuery}
                onChange={(e) => setTeacherQuery(e.target.value)}
                placeholder="교사 검색 (쉼표로 여러 명: 김철수, 이영희)"
                title="쉼표(,)로 구분하면 여러 교사를 한꺼번에 검색합니다."
                className="h-9 pl-8 pr-8"
              />
              {teacherQuery ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setTeacherQuery("")}
                  title="검색 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllTeachers((v) => !v)}
            >
              {showAllTeachers ? "배정 교사만" : "전체 교사"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={exporting}
              title="전체 교사 · 누적도 내림차순 · 모든 날짜"
              className="border-2 border-emerald-700 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700 hover:text-white"
            >
              <Download className="h-4 w-4" /> {exporting ? "내보내는 중…" : "엑셀 다운로드"}
            </Button>
            <div className="flex flex-wrap items-center gap-1">
              {periods.map((period) => {
                const locked = lockedPeriods.has(period);
                return (
                  <Button
                    key={period}
                    variant={locked ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => toggleLockedPeriod(period)}
                    disabled={reassigning}
                    title={`${period}교시에 이미 배정된 감독은 유지합니다`}
                  >
                    <Lock className="h-4 w-4" />
                    {period}교시 고정
                  </Button>
                );
              })}
              <Button
                variant={limitToDayTeachers ? "secondary" : "outline"}
                size="sm"
                onClick={() => setLimitToDayTeachers((v) => !v)}
                disabled={reassigning}
                title="선택한 날짜에 이미 감독이 있던 교사만 재배정 후보로 사용합니다"
              >
                <Lock className="h-4 w-4" />
                감독 고정
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleReassignDay} disabled={reassigning}>
              <Wand2 className="h-4 w-4" /> {reassigning ? "재배정 중…" : "이 날 재배정"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedDay ? (
        <TeacherDayGrid
          exam={exam}
          date={selectedDay}
          periods={periods}
          showAllTeachers={showAllTeachers}
          teacherQuery={teacherQuery}
          issuesBySlot={issuesBySlot}
          {...slotHandlers}
        />
      ) : null}

      {issues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              전체 검증 결과 ({issues.length}
              {acknowledgedCount > 0 ? ` · 확인됨 ${acknowledgedCount}` : ""})
            </CardTitle>
            <CardDescription>
              오류와 경고를 위치별로 확인합니다. 확인한 항목은 이상없음으로 표시됩니다. 오류는 규칙 위반이므로
              의도한 예외일 때만 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm max-h-72 overflow-y-auto">
              {issues.map((i) => {
                const ackKey = issueAckKey(i);
                const acknowledged = isAcknowledgedIssue(i, acknowledgedIssueKeys);
                return (
                  <li
                    key={ackKey}
                    className={cn(
                      "flex gap-2 items-start py-1 border-b",
                      i.severity === "error" && !acknowledged && "text-destructive",
                      i.severity === "warning" && !acknowledged && "text-amber-700",
                      acknowledged && "text-emerald-700",
                    )}
                  >
                    <Badge
                      variant={
                        acknowledged ? "outline" : i.severity === "error" ? "destructive" : "warning"
                      }
                      className="shrink-0"
                    >
                      {acknowledged ? "이상없음" : i.severity === "error" ? "오류" : "경고"}
                    </Badge>
                    <span className="flex-1">
                      {acknowledged ? `확인 완료: ${i.message}` : i.message}
                    </span>
                    {!acknowledged ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() =>
                          i.severity === "error" ? acknowledgeErrorIssue(i) : acknowledgeIssue(ackKey)
                        }
                        title={
                          i.severity === "error"
                            ? "이 오류를 확인하고 이상없음으로 표시"
                            : "이 경고를 이상없음으로 표시"
                        }
                      >
                        <Check className="h-3.5 w-3.5" /> 확인
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <StepNavButtons currentPath="review" />
    </div>
  );
}

function TeacherDayGrid({
  exam,
  date,
  periods,
  showAllTeachers,
  teacherQuery,
  issuesBySlot,
  onAssign,
  onClear,
  onToggleFixed,
  onSwap,
}: {
  exam: Exam;
  date: string;
  periods: number[];
  showAllTeachers: boolean;
  teacherQuery: string;
  issuesBySlot: Map<string, ReturnType<typeof runFullValidation>>;
  onAssign: (slotId: string, teacherId: string) => void;
  onClear: (slotId: string) => void;
  onToggleFixed: (slotId: string) => void;
  onSwap: (slotIdA: string, slotIdB: string) => boolean;
}) {
  type SortKey = "name" | "previous" | "current" | "total";
  const [sortKey, setSortKey] = React.useState<SortKey>("previous");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [swapMode, setSwapMode] = React.useState(false);
  const [swapPicks, setSwapPicks] = React.useState<string[]>([]);

  // 바꾸기 모드에서 고른 칸. 날짜를 바꾸거나 배정이 사라지면(실행 취소 등) 선택에서 뺀다.
  const validSwapPicks = React.useMemo(
    () =>
      swapPicks.filter((slotId) =>
        exam.assignments.some((a) => a.dutySlotId === slotId),
      ),
    [swapPicks, exam.assignments],
  );

  const cancelSwap = React.useCallback(() => {
    setSwapMode(false);
    setSwapPicks([]);
  }, []);

  React.useEffect(() => {
    setSwapPicks([]);
  }, [date]);

  React.useEffect(() => {
    if (!swapMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelSwap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [swapMode, cancelSwap]);

  const toggleSwapPick = (slotId: string) => {
    setSwapPicks((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId].slice(-2),
    );
  };

  const runSwap = () => {
    if (validSwapPicks.length !== 2) return;
    if (onSwap(validSwapPicks[0]!, validSwapPicks[1]!)) cancelSwap();
  };

  const describeSwapPick = (slotId: string): string => {
    const slot = exam.dutySlots.find((s) => s.id === slotId);
    const assignment = exam.assignments.find((a) => a.dutySlotId === slotId);
    const teacher = exam.teachers.find((t) => t.id === assignment?.teacherId);
    const duty = exam.dutyTypes.find((d) => d.id === slot?.dutyTypeId)?.name ?? "";
    return `${teacher?.name ?? "?"} ${slot?.period ?? "?"}교시 ${duty}`;
  };

  const swapHint =
    validSwapPicks.length === 0
      ? "바꿀 칸 2개를 클릭하세요."
      : validSwapPicks.length === 1
        ? `① ${describeSwapPick(validSwapPicks[0]!)} — 하나 더 클릭하세요.`
        : `① ${describeSwapPick(validSwapPicks[0]!)} ⇄ ② ${describeSwapPick(validSwapPicks[1]!)}`;

  const rawPeriodGroups = React.useMemo(
    () => teacherGridPeriodGroupsForDate(exam, date, periods),
    [exam, date, periods],
  );
  const { groups: periodGroups, colsPerPeriod } = React.useMemo(
    () => normalizePeriodGroups(rawPeriodGroups),
    [rawPeriodGroups],
  );
  const columns = React.useMemo(() => flattenTeacherGridColumns(periodGroups), [periodGroups]);
  const lookup = React.useMemo(() => buildTeacherSlotLookup(exam, date), [exam, date]);
  const periodGroupWidth = periodGroupWidthRem(colsPerPeriod);

  const fatigueByTeacher = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof teacherFatigueBreakdown>>();
    for (const t of exam.teachers) map.set(t.id, teacherFatigueBreakdown(exam, t));
    return map;
  }, [exam]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "name" ? true : false);
    }
  };

  const searchTerms = React.useMemo(() => parseTeacherSearchTerms(teacherQuery), [teacherQuery]);

  const searchPool = React.useMemo(() => {
    const assignedIds = new Set(lookup.keys());
    return showAllTeachers
      ? [...exam.teachers]
      : exam.teachers.filter((t) => assignedIds.has(t.id));
  }, [exam.teachers, lookup, showAllTeachers]);

  const unmatchedTerms = React.useMemo(() => {
    if (searchTerms.length < 2) return [];
    const texts = searchPool.map(teacherSearchText);
    return searchTerms.filter((term) => !texts.some((text) => text.includes(term)));
  }, [searchPool, searchTerms]);

  const teachers = React.useMemo(() => {
    return searchPool
      .filter((teacher) => {
        if (searchTerms.length === 0) return true;
        const text = teacherSearchText(teacher);
        return searchTerms.some((term) => text.includes(term));
      })
      .sort((a, b) => {
        if (sortKey !== "name") {
          const diff =
            (fatigueByTeacher.get(a.id)?.[sortKey] ?? 0) -
            (fatigueByTeacher.get(b.id)?.[sortKey] ?? 0);
          return sortAsc ? diff : -diff;
        }
        const diff = a.name.localeCompare(b.name, "ko");
        return sortAsc ? diff : -diff;
      });
  }, [searchPool, searchTerms, sortKey, sortAsc, fatigueByTeacher]);

  const classLookup = React.useMemo(
    () =>
      buildTeacherClassLookup(
        exam,
        date,
        periodGroups.map((g) => g.period),
        teachers,
      ),
    [exam, date, periodGroups, teachers],
  );

  const colCount = columns.length;
  const stickyFatigueLeft = (index: number) =>
    `${TEACHER_GRID_NAME_COL_REM + TEACHER_GRID_FATIGUE_COL_REM * index}rem`;
  const stickyCountLeft = (index: number) =>
    `${
      TEACHER_GRID_NAME_COL_REM +
      TEACHER_GRID_FATIGUE_COL_REM * TEACHER_GRID_FATIGUE_COLUMNS.length +
      TEACHER_GRID_COUNT_COL_REM * index
    }rem`;
  const hasTeacherQuery = searchTerms.length > 0;

  return (
    <Card>
      <CardHeader className="gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0 space-y-1.5">
        <CardTitle>
          {dateWithWeekday(date)} — 교사별 감독표
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {showAllTeachers
              ? "전체 교사 · 빈 칸은 해당 교시·감독에 배정 없음"
              : `이 날 배정된 교사 ${teachers.length}명`}
            {hasTeacherQuery ? ` · 검색 결과 ${teachers.length}명` : ""}
          </span>
          {unmatchedTerms.length > 0 ? (
            <span className="text-[11px] font-medium text-amber-700">
              일치하는 교사 없음: {unmatchedTerms.join(", ")}
            </span>
          ) : null}
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn("inline-block h-3 w-3 rounded border border-yellow-500", TEACHER_GRID_CLASS_SHADE_CLASS)} />
            노랑 = 정규 수업
            <span className="mx-1 opacity-30">·</span>
            <span
              className={cn(
                "inline-block h-3 w-3 rounded border border-red-300",
                TEACHER_GRID_EXCLUDE_SHADE_CLASS,
              )}
            />
            빨강 = STEP 7 제외
            <span className="mx-1 opacity-30">·</span>
            <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-200/90" />
            / <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-200/90" />
            누적 깜빡임 = 반영
          </span>
        </CardDescription>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:max-w-[55%]">
          {swapMode ? (
            <p
              className="min-w-0 truncate text-[11px] text-muted-foreground"
              title={swapHint}
            >
              {swapHint}
            </p>
          ) : null}
          {swapMode ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={cancelSwap}
              title="바꾸기 취소 (Esc)"
            >
              취소
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={swapMode ? runSwap : () => setSwapMode(true)}
            disabled={swapMode && validSwapPicks.length !== 2}
            title={
              swapMode
                ? "선택한 두 칸의 교사를 서로 바꿉니다"
                : "두 칸을 골라 교사를 서로 바꿉니다"
            }
            className={cn(
              "shrink-0 border-2 border-red-500 font-semibold",
              swapMode
                ? "bg-red-600 text-white hover:bg-red-700 hover:text-white disabled:bg-red-600/40 disabled:text-white disabled:opacity-100"
                : "text-red-600 hover:bg-red-50 hover:text-red-700",
            )}
          >
            <ArrowLeftRight className="h-4 w-4" /> 바꾸기
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        {colCount === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">이 날짜에 감독 슬롯이 없습니다.</p>
        ) : (
          <div className={cn("border-t", TEACHER_GRID_SCROLL_CLASS)}>
            <table className="w-max min-w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: `${TEACHER_GRID_NAME_COL_REM}rem` }} />
                {TEACHER_GRID_FATIGUE_COLUMNS.map((col) => (
                  <col key={col.key} style={{ width: `${TEACHER_GRID_FATIGUE_COL_REM}rem` }} />
                ))}
                {TEACHER_GRID_DUTY_COUNT_COLUMNS.map((col) => (
                  <col key={col.key} style={{ width: `${TEACHER_GRID_COUNT_COL_REM}rem` }} />
                ))}
                {columns.map((col) => (
                  <col key={col.key} style={{ width: `${TEACHER_GRID_DUTY_COL_REM}rem` }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr>
                  <SortHeaderCell
                    rowSpan={4}
                    label="교사"
                    active={sortKey === "name"}
                    asc={sortAsc}
                    onClick={() => toggleSort("name")}
                    className={cn("sticky left-0 z-30", TEACHER_GRID_NAME_COL_CLASS)}
                  />
                  {TEACHER_GRID_FATIGUE_COLUMNS.map((col, index) => (
                    <SortHeaderCell
                      key={col.key}
                      rowSpan={4}
                      label={col.label}
                      active={sortKey === col.key}
                      asc={sortAsc}
                      onClick={() => toggleSort(col.key)}
                      className={cn("sticky z-30", TEACHER_GRID_FATIGUE_COL_CLASS)}
                      style={{ left: stickyFatigueLeft(index) }}
                      title={col.title}
                    />
                  ))}
                  {TEACHER_GRID_DUTY_COUNT_COLUMNS.map((col, index) => (
                    <th
                      key={col.key}
                      rowSpan={4}
                      className={cn(
                        "sticky z-30 border bg-muted px-0.5 py-1 text-center text-[10px] font-semibold",
                        TEACHER_GRID_COUNT_COL_CLASS,
                      )}
                      style={{ left: stickyCountLeft(index) }}
                      title={`${col.dutyName} 횟수`}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th
                    colSpan={colCount}
                    className="border bg-muted p-1 text-center font-semibold"
                  >
                    {dateWithWeekday(date)}
                  </th>
                </tr>
                <tr>
                  {periodGroups.map((g, idx) => (
                    <th
                      key={g.period}
                      colSpan={g.columns.length}
                      style={{ width: `${periodGroupWidth}rem`, minWidth: `${periodGroupWidth}rem` }}
                      className={cn(
                        "border p-1.5 text-center font-semibold",
                        periodHeaderBgClass(idx),
                        idx > 0 && periodGroupEdgeClass(true),
                      )}
                    >
                      {g.period}교시
                    </th>
                  ))}
                </tr>
                <tr>
                  {periodGroups.map((g, idx) => (
                    <th
                      key={`exam-${g.period}`}
                      colSpan={g.columns.length}
                      style={{ width: `${periodGroupWidth}rem`, minWidth: `${periodGroupWidth}rem` }}
                      className={cn(
                        "border p-1 text-center font-normal align-middle min-h-[2rem]",
                        periodHeaderBgClass(idx),
                        idx > 0 && periodGroupEdgeClass(true),
                      )}
                    >
                      <PeriodExamChips entries={g.examEntries} />
                    </th>
                  ))}
                </tr>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "border bg-muted/60 p-1 text-center font-normal",
                        TEACHER_GRID_DUTY_COL_CLASS,
                        col.isFirstInPeriod && periodGroupEdgeClass(true),
                        col.isPadding && "bg-muted/30",
                        !col.hasSlots && !col.isPadding && "text-muted-foreground/50",
                      )}
                      title={col.dutyTypeName || undefined}
                    >
                      {col.isPadding ? "" : col.shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount + TEACHER_GRID_FIXED_COL_COUNT}
                      className="border p-4 text-center text-muted-foreground"
                    >
                      {hasTeacherQuery
                        ? "검색 조건에 맞는 교사가 없습니다."
                        : "배정된 교사가 없습니다. 「전체 교사」를 켜거나 자동 배정을 실행하세요."}
                    </td>
                  </tr>
                ) : (
                  teachers.map((teacher) => {
                    const fatigue =
                      fatigueByTeacher.get(teacher.id) ?? teacherFatigueBreakdown(exam, teacher);
                    const counts = teacherDutyCounts(exam, teacher.id);
                    return (
                    <tr key={teacher.id} className="hover:bg-muted/20">
                      <td
                        className={cn(
                          "sticky left-0 z-10 border bg-background px-1 py-0.5 text-center font-medium",
                          TEACHER_GRID_NAME_COL_CLASS,
                        )}
                        title={`${teacher.name} (${teacher.subject})`}
                      >
                        <span className="block truncate text-center text-[11px] leading-tight">{teacher.name}</span>
                      </td>
                      {TEACHER_GRID_FATIGUE_COLUMNS.map((col, index) => (
                        <FatigueCell
                          key={col.key}
                          value={fatigue[col.key]}
                          label={col.title}
                          stickyLeft={stickyFatigueLeft(index)}
                        />
                      ))}
                      {TEACHER_GRID_DUTY_COUNT_COLUMNS.map((col, index) => (
                        <DutyCountCell
                          key={col.key}
                          count={counts[col.key]}
                          label={col.dutyName}
                          stickyLeft={stickyCountLeft(index)}
                        />
                      ))}
                      {periodGroups.map((g, periodIdx) => {
                        const periodExcluded = isTeacherExcludedForPeriod(
                          exam,
                          teacher.id,
                          date,
                          g.period,
                        );
                        const periodExcludeTitle = periodExcluded
                          ? getTeacherPeriodExcludeLabel(exam, teacher.id, date, g.period)
                          : null;
                        const classRow = classLookup.get(teacher.id)?.get(g.period);
                        const hasAssignment = g.columns.some(
                          (col) =>
                            col.hasSlots &&
                            !col.isPadding &&
                            lookup.get(teacher.id)?.has(col.key),
                        );
                        if (classRow && !hasAssignment && !periodExcluded) {
                          const groupWidth = periodGroupWidthRem(g.columns.length);
                          return (
                            <td
                              key={`class-${g.period}`}
                              colSpan={g.columns.length}
                              style={{
                                width: `${groupWidth}rem`,
                                minWidth: `${groupWidth}rem`,
                              }}
                              className={cn(
                                "border align-middle p-0 text-center",
                                TEACHER_GRID_CLASS_SHADE_CLASS,
                                periodIdx > 0 && periodGroupEdgeClass(true),
                              )}
                              title={formatTimetableClassTitle(classRow)}
                            >
                              <span className={cn("flex min-h-[1.75rem] items-center justify-center px-1 py-0.5 text-[10px]", TEACHER_GRID_CLASS_TEXT_CLASS)}>
                                {formatTimetableClassRoom(classRow)}
                              </span>
                            </td>
                          );
                        }
                        if (periodExcluded && !hasAssignment) {
                          const groupWidth = periodGroupWidthRem(g.columns.length);
                          return (
                            <td
                              key={`exclude-${g.period}`}
                              colSpan={g.columns.length}
                              style={{
                                width: `${groupWidth}rem`,
                                minWidth: `${groupWidth}rem`,
                              }}
                              className={cn(
                                "border align-middle p-0 text-center",
                                TEACHER_GRID_EXCLUDE_SHADE_CLASS,
                                periodIdx > 0 && periodGroupEdgeClass(true),
                              )}
                              title={periodExcludeTitle ?? undefined}
                            >
                              <span
                                className={cn(
                                  "flex min-h-[1.75rem] items-center justify-center px-1 py-0.5 text-[10px] font-medium",
                                  TEACHER_GRID_EXCLUDE_TEXT_CLASS,
                                )}
                              >
                                제외
                              </span>
                            </td>
                          );
                        }
                        return g.columns.map((col) => (
                          <TeacherGridCell
                            key={col.key}
                            exam={exam}
                            teacher={teacher}
                            column={col}
                            date={date}
                            cell={lookup.get(teacher.id)?.get(col.key)}
                            periodExcluded={periodExcluded}
                            periodExcludeTitle={periodExcludeTitle}
                            issuesBySlot={issuesBySlot}
                            onAssign={onAssign}
                            onClear={onClear}
                            onToggleFixed={onToggleFixed}
                            swapMode={swapMode}
                            swapPicks={validSwapPicks}
                            onToggleSwap={toggleSwapPick}
                          />
                        ));
                      })}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FatigueCell({
  value,
  label,
  stickyLeft,
}: {
  value: number;
  label: string;
  stickyLeft: string;
}) {
  const prev = React.useRef(value);
  const mounted = React.useRef(false);
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prev.current = value;
      return;
    }
    if (prev.current === value) return;
    const dir = value > prev.current ? "up" : "down";
    prev.current = value;
    setFlash(dir);
    const id = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <td
      className={cn(
        "sticky z-10 border px-0.5 py-0.5 text-center font-mono text-[10px] transition-colors duration-700",
        TEACHER_GRID_FATIGUE_COL_CLASS,
        flash === "up" &&
          "bg-amber-200/90 text-amber-950 font-semibold ring-1 ring-inset ring-amber-400/70",
        flash === "down" &&
          "bg-emerald-200/90 text-emerald-950 font-semibold ring-1 ring-inset ring-emerald-400/70",
        !flash && "bg-background text-muted-foreground",
      )}
      style={{ left: stickyLeft }}
      title={
        flash === "up"
          ? `${label} 증가 반영됨`
          : flash === "down"
            ? `${label} 감소 반영됨`
            : label
      }
    >
      {value.toFixed(0)}
    </td>
  );
}

function SortHeaderCell({
  label,
  active,
  asc,
  onClick,
  className,
  style,
  rowSpan,
  title,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  rowSpan?: number;
  title?: string;
}) {
  return (
    <th
      rowSpan={rowSpan}
      style={style}
      className={cn("border bg-muted align-middle p-0", className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium hover:bg-muted/80 transition-colors",
          active && "text-primary",
        )}
        title={active ? `${title ?? label} ${asc ? "오름차순" : "내림차순"}` : `${title ?? label} 정렬`}
      >
        <span>{label}</span>
        {active ? (
          asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : null}
      </button>
    </th>
  );
}

function DutyCountCell({
  count,
  label,
  stickyLeft,
}: {
  count: number;
  label: string;
  stickyLeft: string;
}) {
  const prev = React.useRef(count);
  const mounted = React.useRef(false);
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prev.current = count;
      return;
    }
    if (prev.current === count) return;
    prev.current = count;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(id);
  }, [count]);

  return (
    <td
      className={cn(
        "sticky z-10 border px-0.5 py-0.5 text-center font-mono text-[10px] transition-colors duration-500",
        TEACHER_GRID_COUNT_COL_CLASS,
        flash
          ? "bg-sky-200/90 text-sky-950 font-semibold ring-1 ring-inset ring-sky-400/70"
          : "bg-background text-muted-foreground",
      )}
      style={{ left: stickyLeft }}
      title={`${label} 횟수`}
    >
      {count}
    </td>
  );
}

function PeriodExamChips({ entries }: { entries: PeriodExamEntry[] }) {
  if (entries.length === 0) {
    return <span className="text-[10px] text-muted-foreground">시험 없음</span>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 px-0.5">
      {entries.map((entry) => (
        <span
          key={`${entry.grade}-${entry.subject}`}
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] leading-tight whitespace-nowrap",
            GRADE_CHIP_CLASS[entry.grade],
          )}
          title={formatPeriodExamEntry(entry)}
        >
          <span className="font-semibold">{entry.grade}학년</span>
          <span className="mx-0.5 opacity-40">·</span>
          <span>{entry.subject}</span>
          {entry.classesLabel ? (
            <span className="ml-1 opacity-75">({entry.classesLabel})</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function TeacherGridCell({
  exam,
  teacher,
  column,
  date,
  cell,
  periodExcluded,
  periodExcludeTitle,
  issuesBySlot,
  onAssign,
  onClear,
  onToggleFixed,
  swapMode,
  swapPicks,
  onToggleSwap,
}: {
  exam: Exam;
  teacher: Teacher;
  column: TeacherGridColumn;
  date: string;
  cell?: TeacherCellData;
  periodExcluded: boolean;
  periodExcludeTitle: string | null;
  issuesBySlot: Map<string, ReturnType<typeof runFullValidation>>;
  onAssign: (slotId: string, teacherId: string) => void;
  onClear: (slotId: string) => void;
  onToggleFixed: (slotId: string) => void;
  /** 바꾸기 모드: 클릭이 편집 팝오버 대신 교체할 칸 선택이 된다 */
  swapMode: boolean;
  swapPicks: string[];
  onToggleSwap: (slotId: string) => void;
}) {
  const slotExcluded = cell ? isTeacherExcludedForSlot(exam, teacher, cell.slot) : false;
  const columnExcluded = !cell && periodExcluded;
  const excluded = slotExcluded || columnExcluded;
  const excludeTitle = cell
    ? getTeacherSlotExcludeLabel(exam, teacher, cell.slot)
    : periodExcludeTitle;

  const cellClass = cn(
    "border align-middle",
    TEACHER_GRID_DUTY_COL_CLASS,
    column.isFirstInPeriod && periodGroupEdgeClass(true),
    excluded && TEACHER_GRID_EXCLUDE_SHADE_CLASS,
  );

  if (!column.hasSlots || column.isPadding) {
    return <td className={cn(cellClass, "bg-muted/20")} />;
  }

  if (cell) {
    const issues = issuesBySlot.get(cell.slot.id) ?? [];
    const hasError = issues.some((i) => i.severity === "error");
    const hasWarning = issues.some((i) => i.severity === "warning");
    const issueTitle = issues.map((i) => i.message).join("\n");
    if (swapMode) {
      const pickOrder = swapPicks.indexOf(cell.slot.id) + 1;
      const locked = cell.assignment.fixed;
      return (
        <td className={cn(cellClass, "p-0")}>
          <button
            type="button"
            onClick={() => onToggleSwap(cell.slot.id)}
            disabled={locked}
            aria-pressed={pickOrder > 0}
            className={cn(
              "relative w-full min-h-[1.75rem] px-1 py-0.5 text-center transition-colors flex items-center justify-center gap-0.5",
              pickOrder > 0
                ? "bg-red-100 font-semibold text-red-900 ring-2 ring-inset ring-red-500"
                : !locked && "hover:bg-red-50",
              locked && "cursor-not-allowed opacity-50",
            )}
            title={
              locked
                ? "고정된 배정은 바꿀 수 없습니다"
                : `${teacher.name} · ${cell.roomName} — 클릭하여 바꿀 칸으로 선택`
            }
          >
            {pickOrder > 0 ? (
              <span className="absolute left-0 top-0 rounded-br bg-red-600 px-1 text-[9px] leading-tight text-white">
                {pickOrder}
              </span>
            ) : null}
            <span className="truncate">{cell.roomName}</span>
            {locked ? <Lock className="h-2.5 w-2.5 shrink-0 text-emerald-600" /> : null}
          </button>
        </td>
      );
    }
    return (
      <td className={cn(cellClass, "p-0")}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "w-full min-h-[1.75rem] px-1 py-0.5 text-center hover:bg-accent transition-colors flex items-center justify-center gap-0.5",
                excluded && cn(TEACHER_GRID_EXCLUDE_SHADE_CLASS, TEACHER_GRID_EXCLUDE_TEXT_CLASS, "font-medium"),
                !excluded && hasError && "bg-destructive/10 text-destructive font-medium",
                !excluded && !hasError && hasWarning && "bg-amber-50 text-amber-800",
                cell.assignment.fixed && "ring-1 ring-inset ring-emerald-500/40",
              )}
              title={excludeTitle ?? issueTitle ?? cell.roomName}
            >
              <span className="truncate">{cell.roomName}</span>
              {cell.assignment.fixed ? <Lock className="h-2.5 w-2.5 text-emerald-600 shrink-0" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <SlotEditor
              slot={cell.slot}
              exam={exam}
              assignment={cell.assignment}
              issues={issues}
              onAssign={(teacherId) => onAssign(cell.slot.id, teacherId)}
              onClear={() => onClear(cell.slot.id)}
              onToggleFixed={() => onToggleFixed(cell.slot.id)}
            />
          </PopoverContent>
        </Popover>
      </td>
    );
  }

  if (swapMode) {
    // 바꾸기 모드에서는 배정된 칸만 고를 수 있다. 빈 칸은 보기만 한다.
    return (
      <td className={cn(cellClass, "p-0", !excluded && "bg-muted/5")}>
        <div
          className={cn(
            "flex min-h-[1.75rem] w-full items-center justify-center px-1 py-0.5 text-center",
            excluded
              ? cn(TEACHER_GRID_EXCLUDE_TEXT_CLASS, "font-medium")
              : "text-muted-foreground/30",
          )}
          title={excludeTitle ?? undefined}
        >
          {excluded ? "제외" : "·"}
        </div>
      </td>
    );
  }

  return (
    <td className={cn(cellClass, "p-0", !excluded && "bg-muted/5")}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full min-h-[1.75rem] px-1 py-0.5 text-center transition-colors",
              excluded
                ? cn(TEACHER_GRID_EXCLUDE_TEXT_CLASS, "font-medium hover:bg-red-200/80")
                : "text-muted-foreground/40 hover:bg-accent hover:text-foreground",
            )}
            title={excludeTitle ?? `${column.period}교시 ${column.dutyTypeName} 배정 추가`}
          >
            {excluded ? "제외" : "·"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <EmptyTeacherCellEditor
            exam={exam}
            teacher={teacher}
            date={date}
            period={column.period}
            dutyTypeId={column.dutyTypeId}
            dutyTypeName={column.dutyTypeName}
            onAssign={(slotId) => onAssign(slotId, teacher.id)}
          />
        </PopoverContent>
      </Popover>
    </td>
  );
}

function EmptyTeacherCellEditor({
  exam,
  teacher,
  date,
  period,
  dutyTypeId,
  dutyTypeName,
  onAssign,
}: {
  exam: Exam;
  teacher: Teacher;
  date: string;
  period: number;
  dutyTypeId: string;
  dutyTypeName: string;
  onAssign: (slotId: string) => void;
}) {
  const candidates = React.useMemo(() => {
    const assignedSlotIds = new Set(exam.assignments.map((a) => a.dutySlotId));
    const ctx: ConstraintContext = { exam, assignments: exam.assignments };
    const slots = exam.dutySlots.filter(
      (s) =>
        s.date === date &&
        s.period === period &&
        s.dutyTypeId === dutyTypeId &&
        !assignedSlotIds.has(s.id),
    );
    const roomById = new Map(exam.rooms.map((r) => [r.id, r.name]));
    return slots
      .map((slot) => {
        const fit = classifyManualAssignFit(ctx, slot, teacher);
        const evaluation = evaluateForManualAssign(ctx, slot, teacher);
        return {
          slot,
          roomName: roomById.get(slot.roomId) ?? slot.roomId,
          fit,
          reasons: manualAssignReasonMessages(evaluation),
        };
      })
      .sort((a, b) => {
        const rank = (fit: typeof a.fit) => (fit === "ok" ? 0 : fit === "warning" ? 1 : 2);
        const diff = rank(a.fit) - rank(b.fit);
        if (diff !== 0) return diff;
        return a.roomName.localeCompare(b.roomName, "ko");
      });
  }, [exam, teacher, date, period, dutyTypeId]);

  return (
    <div className="space-y-2">
      <header className="text-xs">
        <div className="font-semibold">
          {teacher.name} → {dateWithWeekday(date)} {period}교시 · {dutyTypeName}
        </div>
        <div className="text-muted-foreground">배정할 고사실을 선택하세요.</div>
      </header>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">미배정 슬롯이 없습니다.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto space-y-0.5">
          {candidates.map(({ slot, roomName, fit, reasons }) => (
            <li key={slot.id}>
              <button
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded hover:bg-accent text-xs flex items-center gap-2",
                  fit === "blocked" && "opacity-80",
                )}
                onClick={() => onAssign(slot.id)}
                disabled={fit === "blocked"}
              >
                <span
                  className={cn(
                    "shrink-0 w-1.5 h-1.5 rounded-full",
                    fit === "ok" && "bg-emerald-500",
                    fit === "warning" && "bg-amber-500",
                    fit === "blocked" && "bg-destructive",
                  )}
                />
                <span className="font-medium">{roomName}</span>
                {fit !== "ok" && reasons.length > 0 ? (
                  <span
                    className={cn(
                      "text-[10px] truncate",
                      fit === "warning" ? "text-amber-700" : "text-destructive",
                    )}
                  >
                    {reasons[0]}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotEditor({
  slot,
  exam,
  assignment,
  issues,
  onAssign,
  onClear,
  onToggleFixed,
}: {
  slot: DutySlot;
  exam: Exam;
  assignment?: Assignment;
  issues: ReturnType<typeof runFullValidation>;
  onAssign: (teacherId: string) => void;
  onClear: () => void;
  onToggleFixed: () => void;
}) {
  const [filter, setFilter] = React.useState("");

  const room = exam.rooms.find((r) => r.id === slot.roomId)?.name ?? slot.roomId;
  const dt = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId)?.name ?? slot.dutyTypeId;

  const teacherList = React.useMemo(() => {
    const ctx: ConstraintContext = {
      exam,
      assignments: exam.assignments.filter((a) => a.dutySlotId !== slot.id),
    };
    const result: Array<{
      teacher: Teacher;
      fit: ReturnType<typeof classifyManualAssignFit>;
      reasons: string[];
      total: number;
    }> = [];
    for (const t of exam.teachers) {
      if (filter && !t.name.includes(filter) && !t.subject.includes(filter)) continue;
      const evaluation = evaluateForManualAssign(ctx, slot, t);
      const total = teacherFatigueBreakdown(exam, t).total;
      result.push({
        teacher: t,
        fit: classifyManualAssignFit(ctx, slot, t),
        reasons: manualAssignReasonMessages(evaluation),
        total,
      });
    }
    result.sort((a, b) => {
      const rank = (fit: typeof a.fit) => (fit === "ok" ? 0 : fit === "warning" ? 1 : 2);
      const diff = rank(a.fit) - rank(b.fit);
      if (diff !== 0) return diff;
      return a.total - b.total;
    });
    return result;
  }, [filter, exam, slot]);

  return (
    <div className="space-y-3">
      <header className="text-xs">
        <div className="font-semibold">
          {dateWithWeekday(slot.date)} {slot.period}교시 · {room}
        </div>
        <div className="text-muted-foreground">{dt}</div>
      </header>

      {issues.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
          {issues.map((i) => (
            <div key={i.id} className="text-destructive">
              · {i.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          placeholder="교사 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 text-xs"
        />
        {assignment ? (
          <>
            <Button size="sm" variant="ghost" onClick={onClear} title="배정 해제">
              해제
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleFixed}
              title={assignment.fixed ? "고정 해제" : "고정"}
            >
              {assignment.fixed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
          </>
        ) : null}
      </div>

      <div className="max-h-72 overflow-y-auto -mx-4 px-4">
        <ul className="space-y-1">
          {teacherList.slice(0, 50).map(({ teacher, fit, reasons, total }) => {
            const isCurrent = assignment?.teacherId === teacher.id;
            const selectable = isCurrent || fit === "ok" || fit === "warning";
            return (
              <li key={teacher.id}>
                <button
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded hover:bg-accent text-xs flex items-start gap-2",
                    isCurrent && "bg-primary/10",
                  )}
                  onClick={() => onAssign(teacher.id)}
                  disabled={(assignment?.fixed && !isCurrent) || !selectable}
                >
                  <span
                    className={cn(
                      "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
                      fit === "ok" && "bg-emerald-500",
                      fit === "warning" && "bg-amber-500",
                      fit === "blocked" && "bg-destructive",
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{teacher.name}</span>
                      <span className="text-muted-foreground">({teacher.subject})</span>
                      <span className="ml-auto font-mono text-[10px]">{total.toFixed(1)}</span>
                    </div>
                    {fit !== "ok" && reasons.length > 0 ? (
                      <div
                        className={cn(
                          "text-[10px]",
                          fit === "warning" ? "text-amber-700" : "text-destructive",
                        )}
                      >
                        {reasons.join(" · ")}
                      </div>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
