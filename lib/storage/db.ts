import { openDB, type IDBPDatabase } from "idb";
import type { Exam, ExamMeta } from "@/lib/types";

const DB_NAME = "seolhwa-exam-db";
const DB_VERSION = 1;
const STORE_EXAMS = "exams";

type DBSchema = {
  exams: { key: string; value: Exam };
};

let dbPromise: Promise<IDBPDatabase<DBSchema>> | null = null;
let useFallback = false;

function getDB(): Promise<IDBPDatabase<DBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_EXAMS)) {
          db.createObjectStore(STORE_EXAMS, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

const LS_PREFIX = "seolhwa-exam:";
const LS_INDEX_KEY = "seolhwa-exam-index";

function lsListIds(): string[] {
  try {
    const raw = localStorage.getItem(LS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function lsAddId(id: string) {
  const ids = lsListIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(LS_INDEX_KEY, JSON.stringify(ids));
  }
}

function lsRemoveId(id: string) {
  const ids = lsListIds().filter((x) => x !== id);
  localStorage.setItem(LS_INDEX_KEY, JSON.stringify(ids));
}

export async function saveExam(exam: Exam): Promise<void> {
  const payload = { ...exam, updatedAt: new Date().toISOString() };
  if (typeof window === "undefined") return;
  if (!useFallback) {
    try {
      const db = await getDB();
      await db.put(STORE_EXAMS, payload);
      return;
    } catch (err) {
      console.warn("IndexedDB save failed, falling back to localStorage", err);
      useFallback = true;
    }
  }
  try {
    localStorage.setItem(LS_PREFIX + exam.id, JSON.stringify(payload));
    lsAddId(exam.id);
  } catch (err) {
    console.error("localStorage save also failed", err);
    throw err;
  }
}

export async function loadExam(id: string): Promise<Exam | undefined> {
  if (typeof window === "undefined") return undefined;
  if (!useFallback) {
    try {
      const db = await getDB();
      const v = await db.get(STORE_EXAMS, id);
      if (v) return v;
    } catch (err) {
      console.warn("IndexedDB load failed, falling back to localStorage", err);
      useFallback = true;
    }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? (JSON.parse(raw) as Exam) : undefined;
  } catch {
    return undefined;
  }
}

export async function deleteExam(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!useFallback) {
    try {
      const db = await getDB();
      await db.delete(STORE_EXAMS, id);
    } catch (err) {
      console.warn("IndexedDB delete failed", err);
      useFallback = true;
    }
  }
  try {
    localStorage.removeItem(LS_PREFIX + id);
    lsRemoveId(id);
  } catch {
    /* noop */
  }
}

export async function listExams(): Promise<ExamMeta[]> {
  if (typeof window === "undefined") return [];
  if (!useFallback) {
    try {
      const db = await getDB();
      const all = await db.getAll(STORE_EXAMS);
      return all
        .map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (err) {
      console.warn("IndexedDB list failed", err);
      useFallback = true;
    }
  }
  const ids = lsListIds();
  const out: ExamMeta[] = [];
  for (const id of ids) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + id);
      if (raw) {
        const parsed = JSON.parse(raw) as Exam;
        out.push({
          id: parsed.id,
          name: parsed.name,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
        });
      }
    } catch {
      /* noop */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function isUsingFallback(): boolean {
  return useFallback;
}
