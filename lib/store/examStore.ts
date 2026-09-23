"use client";

import { create } from "zustand";
import { temporal } from "zundo";
import type {
  Exam,
  Teacher,
  ExamSlot,
  Room,
  DutyDemand,
  DutyType,
  TeacherTimetable,
  Exclude as ExcludeT,
  Preassign,
  DutySlot,
  Assignment,
  GradeSchedule,
  PeriodTime,
} from "@/lib/types";
import { newId } from "@/lib/types";
import { saveExam } from "@/lib/storage/db";
import { mergeMissingDefaultRooms } from "@/lib/defaultRooms";
import { debounce } from "@/lib/utils";
import { syncDutyDemandsFromSchedule } from "@/lib/generateDutyDemands";

function applyDutyDemandSync(get: () => State & Actions) {
  const cur = get().exam;
  if (!cur) return;
  const rooms = mergeMissingDefaultRooms(cur.rooms);
  const exam = rooms === cur.rooms ? cur : { ...cur, rooms };
  get().patchExam({
    rooms: exam.rooms,
    dutyDemands: syncDutyDemandsFromSchedule(exam),
  });
}

function withDefaultRooms(exam: Exam): Exam {
  const rooms = mergeMissingDefaultRooms(exam.rooms);
  return rooms === exam.rooms ? exam : { ...exam, rooms };
}

type State = {
  exam: Exam | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
};

type Actions = {
  setExam: (exam: Exam | null) => void;
  patchExam: (patch: Partial<Exam>) => void;

  setName: (name: string) => void;
  setCarryOverRatio: (v: number) => void;
  setPeriodCount: (n: number) => void;
  setPeriodTimes: (pt: PeriodTime[]) => void;
  setGradeSchedule: (gs: GradeSchedule[]) => void;

  upsertTeacher: (t: Teacher) => void;
  removeTeacher: (id: string) => void;
  replaceTeachers: (ts: Teacher[]) => void;

  upsertExamSlot: (s: ExamSlot) => void;
  removeExamSlot: (id: string) => void;
  replaceExamSlots: (ss: ExamSlot[]) => void;

  upsertRoom: (r: Room) => void;
  removeRoom: (id: string) => void;
  replaceRooms: (rs: Room[]) => void;

  upsertDutyDemand: (d: DutyDemand) => void;
  removeDutyDemand: (id: string) => void;
  replaceDutyDemands: (ds: DutyDemand[]) => void;
  syncDutyDemandsFromSchedule: () => void;

  upsertDutyType: (d: DutyType) => void;
  removeDutyType: (id: string) => void;
  replaceDutyTypes: (ds: DutyType[]) => void;

  replaceTimetable: (rows: TeacherTimetable[]) => void;

  upsertExclude: (e: ExcludeT) => void;
  removeExclude: (id: string) => void;
  replaceExcludes: (es: ExcludeT[]) => void;

  upsertPreassign: (p: Preassign) => void;
  removePreassign: (id: string) => void;
  replacePreassigns: (ps: Preassign[]) => void;

  replaceDutySlots: (ss: DutySlot[]) => void;

  replaceAssignments: (as: Assignment[]) => void;
  upsertAssignment: (a: Assignment) => void;
  removeAssignment: (id: string) => void;
  setFixed: (assignmentId: string, fixed: boolean, reason?: string) => void;

  markSaved: () => void;
};

export const useExamStore = create<State & Actions>()(
  temporal(
    (set, get) => ({
      exam: null,
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,

      setExam: (exam) => {
        if (!exam) {
          set({ exam: null, isDirty: false, lastSavedAt: null });
          return;
        }
        const next = withDefaultRooms(exam);
        set({
          exam: next,
          isDirty: next.rooms !== exam.rooms,
          lastSavedAt: exam.updatedAt ?? null,
        });
      },

      patchExam: (patch) => {
        const cur = get().exam;
        if (!cur) return;
        set({ exam: { ...cur, ...patch }, isDirty: true });
      },

      setName: (name) => get().patchExam({ name }),
      setCarryOverRatio: (carryOverRatio) =>
        get().patchExam({ carryOverRatio: Math.max(0, Math.min(1, carryOverRatio)) }),
      setPeriodCount: (periodCount) => get().patchExam({ periodCount }),
      setPeriodTimes: (periodTimes) => get().patchExam({ periodTimes }),
      setGradeSchedule: (gradeSchedule) => {
        get().patchExam({ gradeSchedule });
        applyDutyDemandSync(get);
      },

      upsertTeacher: (t) => upsertById("teachers", t, set, get),
      removeTeacher: (id) => removeById("teachers", id, set, get),
      replaceTeachers: (teachers) => get().patchExam({ teachers }),

      upsertExamSlot: (s) => {
        upsertById("examSlots", s, set, get);
        applyDutyDemandSync(get);
      },
      removeExamSlot: (id) => {
        removeById("examSlots", id, set, get);
        applyDutyDemandSync(get);
      },
      replaceExamSlots: (examSlots) => {
        get().patchExam({ examSlots });
        applyDutyDemandSync(get);
      },

      upsertRoom: (r) => upsertById("rooms", r, set, get),
      removeRoom: (id) => {
        const cur = get().exam;
        if (!cur) return;
        const slotIds = new Set(
          cur.dutySlots.filter((s) => s.roomId === id).map((s) => s.id),
        );
        get().patchExam({
          rooms: cur.rooms.filter((r) => r.id !== id),
          dutyDemands: cur.dutyDemands.filter((d) => d.roomId !== id),
          dutySlots: cur.dutySlots.filter((s) => s.roomId !== id),
          assignments: cur.assignments.filter((a) => !slotIds.has(a.dutySlotId)),
          preassigns: cur.preassigns.filter((p) => !slotIds.has(p.dutySlotId)),
          excludes: cur.excludes.filter((e) => e.roomId !== id),
        });
      },
      replaceRooms: (rooms) => get().patchExam({ rooms }),

      upsertDutyDemand: (d) => upsertById("dutyDemands", d, set, get),
      removeDutyDemand: (id) => removeById("dutyDemands", id, set, get),
      replaceDutyDemands: (dutyDemands) => get().patchExam({ dutyDemands }),
      syncDutyDemandsFromSchedule: () => applyDutyDemandSync(get),

      upsertDutyType: (d) => upsertById("dutyTypes", d, set, get),
      removeDutyType: (id) => {
        const cur = get().exam;
        if (!cur) return;
        const slotIds = new Set(
          cur.dutySlots.filter((s) => s.dutyTypeId === id).map((s) => s.id),
        );
        get().patchExam({
          dutyTypes: cur.dutyTypes.filter((d) => d.id !== id),
          dutyDemands: cur.dutyDemands.filter((d) => d.dutyTypeId !== id),
          dutySlots: cur.dutySlots.filter((s) => s.dutyTypeId !== id),
          assignments: cur.assignments.filter((a) => !slotIds.has(a.dutySlotId)),
          preassigns: cur.preassigns.filter((p) => !slotIds.has(p.dutySlotId)),
        });
      },
      replaceDutyTypes: (dutyTypes) => get().patchExam({ dutyTypes }),

      replaceTimetable: (timetable) => get().patchExam({ timetable }),

      upsertExclude: (e) => upsertById("excludes", e, set, get),
      removeExclude: (id) => removeById("excludes", id, set, get),
      replaceExcludes: (excludes) => get().patchExam({ excludes }),

      upsertPreassign: (p) => upsertById("preassigns", p, set, get),
      removePreassign: (id) => removeById("preassigns", id, set, get),
      replacePreassigns: (preassigns) => get().patchExam({ preassigns }),

      replaceDutySlots: (dutySlots) => get().patchExam({ dutySlots }),

      replaceAssignments: (assignments) => get().patchExam({ assignments }),
      upsertAssignment: (a) => upsertById("assignments", a, set, get),
      removeAssignment: (id) => removeById("assignments", id, set, get),
      setFixed: (assignmentId, fixed, reason) => {
        const cur = get().exam;
        if (!cur) return;
        const next = cur.assignments.map((a) =>
          a.id === assignmentId
            ? { ...a, fixed, fixedReason: fixed ? reason ?? a.fixedReason ?? "manual-lock" : undefined }
            : a,
        );
        get().patchExam({ assignments: next });
      },

      markSaved: () => set({ isDirty: false, lastSavedAt: new Date().toISOString(), isSaving: false }),
    }),
    {
      limit: 50,
      partialize: (state) => ({ exam: state.exam }),
      equality: (a, b) => a.exam === b.exam,
    },
  ),
);

type ArrayKeys = {
  [K in keyof Exam]: Exam[K] extends Array<infer U>
    ? U extends { id: string }
      ? K
      : never
    : never;
}[keyof Exam];

function upsertById<K extends ArrayKeys>(
  field: K,
  item: { id: string },
  set: (partial: Partial<State>) => void,
  get: () => State & Actions,
): void {
  const cur = get().exam;
  if (!cur) return;
  const arr = cur[field] as unknown as { id: string }[];
  const found = arr.findIndex((x) => x.id === item.id);
  const next = found >= 0 ? arr.map((x, i) => (i === found ? item : x)) : [...arr, item];
  set({ exam: { ...cur, [field]: next } as Exam, isDirty: true });
}

function removeById<K extends ArrayKeys>(
  field: K,
  id: string,
  set: (partial: Partial<State>) => void,
  get: () => State & Actions,
): void {
  const cur = get().exam;
  if (!cur) return;
  const arr = cur[field] as unknown as { id: string }[];
  const next = arr.filter((x) => x.id !== id);
  set({ exam: { ...cur, [field]: next } as Exam, isDirty: true });
}

// ----- Autosave wiring -----

let started = false;
let unsubAutosave: (() => void) | null = null;

const debouncedSave = debounce(async (exam: Exam) => {
  useExamStore.setState({ isSaving: true });
  try {
    await saveExam(exam);
    useExamStore.getState().markSaved();
  } catch (err) {
    console.error("Autosave failed", err);
    useExamStore.setState({ isSaving: false });
  }
}, 800);

export function startAutosave() {
  if (started) return;
  started = true;
  unsubAutosave = useExamStore.subscribe((state, prev) => {
    if (state.exam && state.isDirty && state.exam !== prev.exam) {
      debouncedSave(state.exam);
    }
  });
}

export function stopAutosave() {
  if (unsubAutosave) {
    unsubAutosave();
    unsubAutosave = null;
  }
  started = false;
}

// New IDs helper exported for convenience
export { newId };
