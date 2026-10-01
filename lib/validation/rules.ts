import type { Assignment, Exam, ValidationIssue, ValidationSeverity } from "@/lib/types";
import { evaluateAll, type ConstraintContext } from "@/lib/algorithm/constraints";
import { conflictsByExclude } from "@/lib/algorithm/excludeConflicts";
import { FATIGUE_SPREAD_WARNING_MIN } from "@/lib/fatigueWeights";
import { teacherExamBurden } from "@/lib/algorithm/fatigue";
import { nutritionTeacherSchedule } from "@/lib/algorithm/nutritionTeachers";
import { newId } from "@/lib/types";
import {
  checkC2Compliance,
  checkC9ScheduleCompliance,
} from "./priorityRuleChecks";

type RuleFn = (exam: Exam) => ValidationIssue[];

function makeIssue(
  ruleId: string,
  severity: ValidationSeverity,
  message: string,
  target?: ValidationIssue["target"],
): ValidationIssue {
  return { id: newId(), ruleId, severity, message, target };
}

// Schedule sanity — STEP 1
const ruleScheduleFilled: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  for (const gs of exam.gradeSchedule) {
    if (!gs.startDate || !gs.endDate) continue; // 비활성 학년은 skip
    if (gs.endDate < gs.startDate) {
      issues.push(
        makeIssue(
          "schedule.invalid-range",
          "error",
          `${gs.grade}학년 시험 종료일이 시작일보다 빠릅니다`,
        ),
      );
    }
  }
  if (exam.periodTimes.length !== exam.periodCount) {
    issues.push(
      makeIssue(
        "schedule.period-times",
        "error",
        `교시 수(${exam.periodCount})와 교시 시간 행 수(${exam.periodTimes.length})가 다릅니다`,
      ),
    );
  }
  for (const pt of exam.periodTimes) {
    if (!pt.start || !pt.end) {
      issues.push(
        makeIssue("schedule.period-missing", "error", `${pt.period}교시 시간이 누락되었습니다`),
      );
    }
  }
  return issues;
};

// Teachers — duplicate names + homeroom conflicts
const ruleTeacherNames: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  const byName = new Map<string, string[]>();
  for (const t of exam.teachers) {
    const arr = byName.get(t.name) ?? [];
    arr.push(t.id);
    byName.set(t.name, arr);
  }
  byName.forEach((ids, name) => {
    if (ids.length > 1) {
      issues.push(
        makeIssue("teacher.duplicate-name", "warning", `동명이인이 있습니다: ${name} (${ids.length}명)`),
      );
    }
  });
  // Homeroom uniqueness check
  const hr = new Map<string, string[]>();
  for (const t of exam.teachers) {
    if (t.homeroomGrade && t.homeroomClass) {
      const k = `${t.homeroomGrade}-${t.homeroomClass}`;
      const arr = hr.get(k) ?? [];
      arr.push(t.name);
      hr.set(k, arr);
    }
  }
  hr.forEach((names, k) => {
    if (names.length > 1) {
      issues.push(
        makeIssue(
          "teacher.duplicate-homeroom",
          "error",
          `${k} 담임이 중복되었습니다 (${names.join(", ")})`,
        ),
      );
    }
  });
  return issues;
};

// Demand totals — STEP 3 vs STEP 8
const ruleSlotsVsDemands: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  if (exam.dutySlots.length === 0 && exam.dutyDemands.length > 0) {
    issues.push(
      makeIssue(
        "slots.not-generated",
        "warning",
        "감독 슬롯이 생성되지 않았습니다 (STEP 8에서 생성하세요)",
      ),
    );
  }
  return issues;
};

// Supply vs demand
const ruleSupplyDemand: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  // For each (date,period) count required slots and check teacher availability
  const byDP = new Map<string, number>();
  for (const s of exam.dutySlots) {
    const k = `${s.date}|${s.period}`;
    byDP.set(k, (byDP.get(k) ?? 0) + 1);
  }
  byDP.forEach((need, k) => {
    const [date, periodStr] = k.split("|");
    const period = Number(periodStr);
    // Count teachers free for this period (no exclude + no timetable conflict ignoring exam-grade).
    let avail = 0;
    const ctx: ConstraintContext = { exam, assignments: [] };
    for (const t of exam.teachers) {
      const fakeSlot = { id: "_", date, period, roomId: "_", dutyTypeId: "_" } as const;
      const r = evaluateAll(ctx, fakeSlot, t);
      if (r.ok) avail += 1;
    }
    if (avail < need) {
      issues.push(
        makeIssue(
          "supply.insufficient",
          "error",
          `${date} ${period}교시: 필요 ${need}명, 가능 교사 ${avail}명 (부족)`,
          { date, period },
        ),
      );
    }
  });
  return issues;
};

// Assignment-time issues — runs over assignments[]
const ruleAssignmentChecks: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  const ctx: ConstraintContext = { exam, assignments: exam.assignments };
  // For each assignment, re-evaluate against the rest (assignments minus self)
  for (const a of exam.assignments) {
    const slot = exam.dutySlots.find((s) => s.id === a.dutySlotId);
    const teacher = exam.teachers.find((t) => t.id === a.teacherId);
    if (!slot || !teacher) continue;
    const ctxMinusSelf: ConstraintContext = {
      exam,
      assignments: exam.assignments.filter((x) => x.id !== a.id),
    };
    const r = evaluateAll(ctxMinusSelf, slot, teacher);
    for (const reason of r.reasons) {
      const severity = reason.code === "C7b" ? "warning" : "error";
      issues.push(
        makeIssue(
          `assign.${reason.code}`,
          severity,
          `${slot.date} ${slot.period}교시 ${teacher.name}: ${reason.message}`,
          { date: slot.date, period: slot.period, roomId: slot.roomId, teacherId: teacher.id, dutySlotId: slot.id },
        ),
      );
    }
  }
  // Unfilled slots
  for (const slot of exam.dutySlots) {
    const has = exam.assignments.some((a) => a.dutySlotId === slot.id);
    if (!has) {
      issues.push(
        makeIssue(
          "assign.missing",
          "error",
          `${slot.date} ${slot.period}교시 ${roomName(exam, slot.roomId)} 감독 미배정`,
          { date: slot.date, period: slot.period, roomId: slot.roomId, dutySlotId: slot.id },
        ),
      );
    }
  }
  // Fatigue spread (감독 + 시험 기간 수업 부담)
  if (exam.teachers.length > 0) {
    const weights = new Map<string, number>();
    for (const t of exam.teachers) {
      weights.set(t.id, teacherExamBurden(exam, t.id));
    }
    const vals = Array.from(weights.values());
    if (vals.length > 0) {
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      if (max - min >= FATIGUE_SPREAD_WARNING_MIN) {
        issues.push(
          makeIssue(
            "assign.spread",
            "warning",
            `업무강도 편차가 큽니다 (최대 ${max.toFixed(0)} - 최소 ${min.toFixed(0)})`,
          ),
        );
      }
    }
  }
  return issues;
};

function roomName(exam: Exam, roomId: string): string {
  return exam.rooms.find((r) => r.id === roomId)?.name ?? roomId;
}

const ruleNutritionTeachers: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  const nutritionTeachers = exam.teachers.filter((t) => t.roleType === "영양교사");
  if (nutritionTeachers.length === 0) return issues;

  const assistantId = exam.dutyTypes.find((d) => d.name === "부감독")?.id;
  if (!assistantId) {
    issues.push(makeIssue("nutrition.no-duty-type", "error", "부감독 감독종류가 없어 영양교사를 배정할 수 없습니다"));
    return issues;
  }

  const schedule = nutritionTeacherSchedule(exam);
  for (const teacher of nutritionTeachers) {
    const dates = schedule.get(teacher.id) ?? [];
    if (dates.length === 0) {
      issues.push(
        makeIssue(
          "nutrition.no-dates",
          "warning",
          `${teacher.name}: 시험 일정이 없어 영양교사 배정일을 잡을 수 없습니다`,
          { teacherId: teacher.id },
        ),
      );
      continue;
    }
    for (const date of dates) {
      const slots = exam.dutySlots.filter(
        (s) => s.date === date && s.period === 2 && s.dutyTypeId === assistantId,
      );
      if (slots.length === 0) {
        issues.push(
          makeIssue(
            "nutrition.no-slot",
            "warning",
            `${date} 2교시 부감독 슬롯이 없습니다 (${teacher.name} 배정 필요)`,
            { date, period: 2, teacherId: teacher.id },
          ),
        );
      }
    }
  }
  return issues;
};

const ruleExcludeTeachers: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  for (const e of exam.excludes) {
    const teacher = exam.teachers.find((t) => t.id === e.teacherId);
    if (!teacher) {
      issues.push(
        makeIssue(
          "exclude.orphan",
          "warning",
          `제외 조건이 가리키는 교사를 찾을 수 없습니다 (id: ${e.teacherId}). STEP 7에서 제외를 다시 등록해주세요.`,
        ),
      );
    }
  }
  const reported = new Set<string>();
  for (const [id, conflicts] of conflictsByExclude(exam)) {
    const rule = exam.excludes.find((e) => e.id === id);
    const teacher = exam.teachers.find((t) => t.id === rule?.teacherId);
    for (const c of conflicts) {
      if (c.severity !== "warning") continue;
      const pair = [id, c.otherId].sort().join("|");
      if (reported.has(pair)) continue;
      reported.add(pair);
      issues.push(
        makeIssue(
          "exclude.conflict",
          "warning",
          `STEP 7 조건 충돌${teacher ? ` (${teacher.name}${rule?.date ? ` ${rule.date}` : ""})` : ""}: ${c.message}`,
          teacher ? { teacherId: teacher.id } : undefined,
        ),
      );
    }
  }
  return issues;
};

const ruleC2HomeroomFirstDay: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  for (const message of checkC2Compliance(exam, exam.assignments)) {
    issues.push(makeIssue("assign.C2", "warning", message));
  }
  return issues;
};

const ruleC9ScheduleComplete: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  for (const message of checkC9ScheduleCompliance(exam, exam.assignments)) {
    issues.push(makeIssue("assign.C9-schedule", "error", message));
  }
  return issues;
};

const rulePreassignChecks: RuleFn = (exam) => {
  const issues: ValidationIssue[] = [];
  const accumulated: Assignment[] = [];
  for (const p of exam.preassigns) {
    const slot = exam.dutySlots.find((s) => s.id === p.dutySlotId);
    const teacher = exam.teachers.find((t) => t.id === p.teacherId);
    if (!slot || !teacher) continue;
    const ctx: ConstraintContext = { exam, assignments: accumulated };
    const r = evaluateAll(ctx, slot, teacher);
    for (const reason of r.reasons) {
      issues.push(
        makeIssue(
          `preassign.${reason.code}`,
          "error",
          `우선/고정: ${teacher.name} → ${slot.date} ${slot.period}교시 — ${reason.message}`,
          { date: slot.date, period: slot.period, roomId: slot.roomId, teacherId: teacher.id, dutySlotId: slot.id },
        ),
      );
    }
    accumulated.push({
      id: p.id,
      teacherId: p.teacherId,
      dutySlotId: p.dutySlotId,
      fixed: p.priority === "fixed",
      fixedReason: p.reason,
    });
  }
  return issues;
};

export const PREFLIGHT_RULES: RuleFn[] = [
  ruleScheduleFilled,
  ruleTeacherNames,
  ruleExcludeTeachers,
  ruleNutritionTeachers,
  ruleSlotsVsDemands,
  ruleSupplyDemand,
  rulePreassignChecks,
];

export const FULL_RULES: RuleFn[] = [
  ...PREFLIGHT_RULES,
  ruleAssignmentChecks,
  ruleC2HomeroomFirstDay,
  ruleC9ScheduleComplete,
];

export function runPreflight(exam: Exam): ValidationIssue[] {
  return PREFLIGHT_RULES.flatMap((fn) => fn(exam));
}

export function runFullValidation(exam: Exam): ValidationIssue[] {
  return FULL_RULES.flatMap((fn) => fn(exam));
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
