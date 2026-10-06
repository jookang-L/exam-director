import type { Assignment, Exam } from "@/lib/types";
import { evaluateAll, type ConstraintContext } from "@/lib/algorithm/constraints";
import { runFullValidation } from "./rules";
import {
  checkC2Compliance,
  checkC9ScheduleCompliance,
} from "./priorityRuleChecks";

export type RuleChecklistItem = {
  code: string;
  label: string;
  description: string;
  /** false면 경고(통과 가능) */
  required: boolean;
  passed: boolean;
  failures: string[];
};

export const FINAL_RULE_CATALOG: Array<{
  code: string;
  label: string;
  description: string;
  required: boolean;
}> = [
  { code: "CC", label: "CC", description: "같은 날·같은 교시에 교사 1명 1슬롯", required: true },
  { code: "EX", label: "EX", description: "STEP 7 수동 제외·허용 조건 위반 배정 금지", required: true },
  { code: "C1", label: "C1", description: "보건교사 — 같은 교시 1명만", required: true },
  { code: "C4", label: "C4", description: "강사 — 부감독만 (자동 배정 금지, 수동 수정에서 확인 시 예외 · 하루 최대 3교시, C7b 면제)", required: true },
  { code: "C5", label: "C5", description: "시험 시작 전 학년 정규 수업 교시 배정 불가", required: true },
  { code: "C8", label: "C8", description: "시험 과목 담당 교사 — 해당 교시 모든 감독 불가 (STEP 9 예외)", required: true },
  { code: "C7", label: "C7", description: "하루 최대 3교시", required: true },
  {
    code: "C7b",
    label: "C7b",
    description: "3교시 배정 시 가운데 교시 자습감독 (강사 면제)",
    required: false,
  },
  {
    code: "C9",
    label: "C9",
    description: "영양교사 — 지정 2일·2교시 부감독, 1회/일, 전체 2일",
    required: true,
  },
  {
    code: "C10",
    label: "C10",
    description: "담임 — 본인 반 고사실 배정 불가 (C2 예외)",
    required: true,
  },
  {
    code: "C2",
    label: "C2",
    description: "담임 — 해당 학년 시험 첫날 1교시 본인 반 자습감독 (미통과 시 「넘어가기」로 경고 전환 가능)",
    required: false,
  },
  {
    code: "MISSING",
    label: "미배정",
    description: "모든 감독 슬롯 배정 완료",
    required: true,
  },
];

function ruleCodeFromIssueId(ruleId: string): string | null {
  if (ruleId === "assign.missing") return "MISSING";
  if (ruleId === "assign.C9-schedule") return "C9";
  const m = ruleId.match(/^(?:assign|preassign)\.(.+)$/);
  return m?.[1] ?? null;
}

function collectConstraintViolations(
  exam: Exam,
  assignments: Assignment[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const push = (code: string, message: string) => {
    const arr = map.get(code) ?? [];
    arr.push(message);
    map.set(code, arr);
  };

  for (const a of assignments) {
    const slot = exam.dutySlots.find((s) => s.id === a.dutySlotId);
    const teacher = exam.teachers.find((t) => t.id === a.teacherId);
    if (!slot || !teacher) continue;
    const ctx: ConstraintContext = {
      exam,
      assignments: assignments.filter((x) => x.id !== a.id),
    };
    const r = evaluateAll(ctx, slot, teacher);
    for (const reason of r.reasons) {
      push(reason.code, `${slot.date} ${slot.period}교시 ${teacher.name}: ${reason.message}`);
    }
  }

  return map;
}

function failuresFromValidationIssues(
  exam: Exam,
  assignments: Assignment[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const issues = runFullValidation({ ...exam, assignments });

  for (const issue of issues) {
    const code = ruleCodeFromIssueId(issue.ruleId);
    if (!code || !FINAL_RULE_CATALOG.some((r) => r.code === code)) continue;
    const arr = map.get(code) ?? [];
    arr.push(issue.message);
    map.set(code, arr);
  }

  return map;
}

export function evaluateRuleChecklist(exam: Exam, assignments: Assignment[]): RuleChecklistItem[] {
  const constraintFailures = collectConstraintViolations(exam, assignments);
  const validationFailures = failuresFromValidationIssues(exam, assignments);

  const c2Failures = checkC2Compliance(exam, assignments);
  const c9ScheduleFailures = checkC9ScheduleCompliance(exam, assignments);

  const missingCount = exam.dutySlots.filter(
    (slot) => !assignments.some((a) => a.dutySlotId === slot.id),
  ).length;
  const missingFailures =
    missingCount > 0 ? [`미배정 슬롯 ${missingCount}건`] : [];

  const extraByCode: Record<string, string[]> = {
    C2: c2Failures,
    MISSING: missingFailures,
  };

  return FINAL_RULE_CATALOG.map((rule) => {
    const fromConstraints = constraintFailures.get(rule.code) ?? [];
    const fromValidation = validationFailures.get(rule.code) ?? [];
    const fromExtra = extraByCode[rule.code] ?? [];

    let failures: string[];
    if (rule.code === "C9") {
      failures = [...new Set([...fromConstraints, ...fromValidation, ...c9ScheduleFailures])];
    } else if (rule.code === "C2" || rule.code === "MISSING") {
      failures = [...new Set([...fromValidation, ...fromExtra])];
    } else {
      failures = [...new Set([...fromConstraints, ...fromValidation])];
    }

    return {
      code: rule.code,
      label: rule.label,
      description: rule.description,
      required: rule.required,
      passed: failures.length === 0,
      failures,
    };
  });
}

export function ruleChecklistBlocksApply(
  items: RuleChecklistItem[],
  options?: { c2Acknowledged?: boolean },
): boolean {
  return items.some((item) => {
    if (item.passed) return false;
    if (item.code === "C2") return !options?.c2Acknowledged;
    return item.required;
  });
}

export function c2ChecklistItem(items: RuleChecklistItem[]): RuleChecklistItem | undefined {
  return items.find((item) => item.code === "C2");
}
