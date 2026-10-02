import type { ValidationIssue } from "@/lib/types";

const STORAGE_PREFIX = "exam.acknowledgedWarnings.";

export function issueAckKey(issue: ValidationIssue): string {
  const target = issue.target;
  return [
    issue.ruleId,
    issue.severity,
    issue.message,
    target?.date ?? "",
    target?.period ?? "",
    target?.roomId ?? "",
    target?.teacherId ?? "",
    target?.dutySlotId ?? "",
  ].join("|");
}

export function loadAcknowledgedWarningKeys(examId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(examId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveAcknowledgedWarningKeys(examId: string, keys: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(examId), JSON.stringify([...keys]));
}

export function isAcknowledgedWarning(issue: ValidationIssue, keys: Set<string>): boolean {
  return issue.severity === "warning" && keys.has(issueAckKey(issue));
}

/** 오류·경고 모두 사용자가 확인한 항목인지. 키에 메시지와 대상이 들어 있어 다른 위치의 새 문제는 해당되지 않는다. */
export function isAcknowledgedIssue(issue: ValidationIssue, keys: Set<string>): boolean {
  return keys.has(issueAckKey(issue));
}

function storageKey(examId: string): string {
  return `${STORAGE_PREFIX}${examId}`;
}
