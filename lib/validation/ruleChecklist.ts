import type { Assignment, Exam } from "@/lib/types";
import { evaluateAll, type ConstraintContext } from "@/lib/algorithm/constraints";
import { runFullValidation } from "./rules";
import { issueAckKey } from "./acknowledgedWarnings";
import {
  checkC2Compliance,
  checkC9ScheduleCompliance,
  checkPreassignCompliance,
} from "./priorityRuleChecks";

/** 점검표의 위반 한 건. key는 「확인」 처리 저장에 쓴다. */
export type RuleFailure = {
  message: string;
  key: string;
};

export type RuleChecklistItem = {
  code: string;
  label: string;
  description: string;
  /** false면 미통과여도 경고로만 표시한다. 어느 쪽이든 「확인」하면 통과로 본다. */
  required: boolean;
  /** 확인 처리와 무관하게 위반이 하나도 없는지 */
  passed: boolean;
  failures: RuleFailure[];
};

export const FINAL_RULE_CATALOG: Array<{
  code: string;
  label: string;
  description: string;
  required: boolean;
}> = [
  { code: "CC", label: "CC", description: "같은 날·같은 교시에 교사 1명 1슬롯", required: true },
  {
    code: "EX",
    label: "EX",
    description: "STEP 7 감독지정/제외 — 등록한 제외·허용 조건을 어긴 배정 금지",
    required: true,
  },
  { code: "C1", label: "C1", description: "보건교사 — 같은 교시 1명만", required: true },
  { code: "C4", label: "C4", description: "강사 — 부감독만 (자동 배정 금지, 수동 수정에서 확인 시 예외 · 하루 최대 3교시, C7b 면제)", required: true },
  { code: "C5", label: "C5", description: "시험 시작 전 학년 정규 수업 교시 배정 불가", required: true },
  { code: "C8", label: "C8", description: "시험 과목 담당 교사 — 해당 교시 모든 감독 불가 (STEP 9 예외)", required: true },
  { code: "C7", label: "C7", description: "하루 최대 3교시", required: true },
  {
    code: "C7b",
    label: "C7b",
    description: "3교시 배정 시 가운데 교시 자습감독 또는 복도감독 (강사 면제)",
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
    description: "담임 — 해당 학년 시험 첫날 1교시 본인 반 자습감독",
    required: true,
  },
  {
    code: "S7",
    label: "STEP 7",
    description: "STEP 7 조건 점검 — 가리키는 교사가 없는 조건, 서로 충돌해 적용되지 않는 조건",
    required: false,
  },
  {
    code: "S9F",
    label: "STEP 9 고정",
    description: "STEP 9 「고정」으로 지정한 교사가 지정한 슬롯에 배정됨",
    required: true,
  },
  {
    code: "S9P",
    label: "STEP 9 우선",
    description: "STEP 9 「우선」으로 지정한 교사가 지정한 슬롯에 배정됨",
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
  if (ruleId.startsWith("exclude.")) return "S7";
  const m = ruleId.match(/^(?:assign|preassign)\.(.+)$/);
  return m?.[1] ?? null;
}

/** 코드별 위반 모음. 같은 메시지는 한 번만 담고, 먼저 담은 키를 유지한다. */
class FailureCollector {
  private readonly byCode = new Map<string, Map<string, string>>();

  add(code: string, message: string, key?: string): void {
    let messages = this.byCode.get(code);
    if (!messages) {
      messages = new Map();
      this.byCode.set(code, messages);
    }
    if (!messages.has(message)) messages.set(message, key ?? `chk|${code}|${message}`);
  }

  failuresOf(code: string): RuleFailure[] {
    return [...(this.byCode.get(code) ?? [])].map(([message, key]) => ({ message, key }));
  }
}

function collectConstraintViolations(
  exam: Exam,
  assignments: Assignment[],
  collector: FailureCollector,
): void {
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
      collector.add(
        reason.code,
        `${slot.date} ${slot.period}교시 ${teacher.name}: ${reason.message}`,
      );
    }
  }
}

function collectValidationIssues(
  exam: Exam,
  assignments: Assignment[],
  collector: FailureCollector,
): void {
  for (const issue of runFullValidation({ ...exam, assignments })) {
    const code = ruleCodeFromIssueId(issue.ruleId);
    if (!code || !FINAL_RULE_CATALOG.some((r) => r.code === code)) continue;
    // STEP 12 「확인」과 같은 키를 써서, 그쪽에서 확인한 항목은 여기서도 확인된 것으로 본다.
    collector.add(code, issue.message, issueAckKey(issue));
  }
}

export function evaluateRuleChecklist(exam: Exam, assignments: Assignment[]): RuleChecklistItem[] {
  const collector = new FailureCollector();

  // 검증 이슈를 먼저 담아야 STEP 12와 같은 확인 키가 우선한다. 제약 재평가는 같은 메시지를 건너뛴다.
  collectValidationIssues(exam, assignments, collector);
  collectConstraintViolations(exam, assignments, collector);

  for (const message of checkC2Compliance(exam, assignments)) collector.add("C2", message);
  for (const message of checkC9ScheduleCompliance(exam, assignments)) collector.add("C9", message);

  const preassign = checkPreassignCompliance(exam, assignments);
  for (const message of preassign.fixed) collector.add("S9F", message);
  for (const message of preassign.preferred) collector.add("S9P", message);

  const missingCount = exam.dutySlots.filter(
    (slot) => !assignments.some((a) => a.dutySlotId === slot.id),
  ).length;
  if (missingCount > 0) collector.add("MISSING", `미배정 슬롯 ${missingCount}건`);

  return FINAL_RULE_CATALOG.map((rule) => {
    const failures = collector.failuresOf(rule.code);
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

export type ChecklistStatus = "passed" | "acknowledged" | "warning" | "failed";

export type ChecklistItemState = {
  item: RuleChecklistItem;
  status: ChecklistStatus;
  /** 아직 확인하지 않은 위반 */
  pending: RuleFailure[];
  /** 확인 처리된 위반 */
  acknowledged: RuleFailure[];
};

/**
 * 위반이 전부 확인 처리되면 필수 규칙이어도 통과로 본다 (acknowledged).
 * 확인하지 않은 위반이 남아 있으면 필수 규칙은 failed, 경고 규칙은 warning.
 */
export function resolveChecklistItem(
  item: RuleChecklistItem,
  acknowledgedKeys: ReadonlySet<string>,
): ChecklistItemState {
  const pending = item.failures.filter((f) => !acknowledgedKeys.has(f.key));
  const acknowledged = item.failures.filter((f) => acknowledgedKeys.has(f.key));
  const status: ChecklistStatus =
    item.failures.length === 0
      ? "passed"
      : pending.length === 0
        ? "acknowledged"
        : item.required
          ? "failed"
          : "warning";
  return { item, status, pending, acknowledged };
}

export type ChecklistSummary = {
  requiredFailed: number;
  warnings: number;
  acknowledged: number;
  /** 필수 규칙이 모두 통과 또는 확인된 상태인지 */
  requiredCleared: boolean;
};

export function summarizeChecklist(
  items: RuleChecklistItem[],
  acknowledgedKeys: ReadonlySet<string>,
): ChecklistSummary {
  let requiredFailed = 0;
  let warnings = 0;
  let acknowledged = 0;
  for (const item of items) {
    const { status } = resolveChecklistItem(item, acknowledgedKeys);
    if (status === "failed") requiredFailed += 1;
    else if (status === "warning") warnings += 1;
    else if (status === "acknowledged") acknowledged += 1;
  }
  return { requiredFailed, warnings, acknowledged, requiredCleared: requiredFailed === 0 };
}
