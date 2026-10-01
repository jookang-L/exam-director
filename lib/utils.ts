import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shortDate(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const m = date.getMonth() + 1;
  const day = date.getDate();
  return `${m}/${day}`;
}

export function weekdayKo(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

/** 화면·출력용. 예: 5/12(화요일) */
export function dateWithWeekday(d: string): string {
  const day = shortDate(d);
  const wd = weekdayKo(d);
  if (!wd) return day;
  return `${day}(${wd}요일)`;
}

export function eachDate(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function parseClassesInput(s: string): number[] {
  if (!s) return [];
  const result = new Set<number>();
  for (const token of s.split(/[,\s]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) result.add(i);
    } else if (/^\d+$/.test(token)) {
      result.add(Number(token));
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export function formatClasses(classes: number[]): string {
  if (classes.length === 0) return "";
  const sorted = [...classes].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] !== prev + 1) {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      if (i < sorted.length) {
        start = sorted[i];
        prev = sorted[i];
      }
    } else {
      prev = sorted[i];
    }
  }
  return ranges.join(", ");
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uniqBy<T, K>(arr: T[], key: (t: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
