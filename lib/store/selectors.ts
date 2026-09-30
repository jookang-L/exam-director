"use client";

import { useExamStore } from "./examStore";
import type { Exam } from "@/lib/types";

export function useExam(): Exam | null {
  return useExamStore((s) => s.exam);
}

// Store actions are stable references (created once with the store), so consumers
// only need to grab them — not subscribe to them. Returning a fresh object literal
// from a Zustand selector with default `Object.is` equality causes an infinite
// re-render loop (since two object literals are never Object.is-equal). Instead we
// expose the stable actions through `getState()`, which the React rules-of-hooks
// allow because this function does NOT call any hooks.
export function useExamMutators() {
  const s = useExamStore.getState();
  return {
    patchExam: s.patchExam,
    setName: s.setName,
    setCarryOverRatio: s.setCarryOverRatio,
    setPeriodCount: s.setPeriodCount,
    setPeriodTimes: s.setPeriodTimes,
    setGradeSchedule: s.setGradeSchedule,

    upsertTeacher: s.upsertTeacher,
    removeTeacher: s.removeTeacher,
    replaceTeachers: s.replaceTeachers,

    upsertExamSlot: s.upsertExamSlot,
    removeExamSlot: s.removeExamSlot,
    replaceExamSlots: s.replaceExamSlots,

    upsertRoom: s.upsertRoom,
    removeRoom: s.removeRoom,
    replaceRooms: s.replaceRooms,

    upsertDutyDemand: s.upsertDutyDemand,
    removeDutyDemand: s.removeDutyDemand,
    replaceDutyDemands: s.replaceDutyDemands,
    syncDutyDemandsFromSchedule: s.syncDutyDemandsFromSchedule,
    setDutyDemandFillMode: s.setDutyDemandFillMode,

    upsertDutyType: s.upsertDutyType,
    removeDutyType: s.removeDutyType,
    replaceDutyTypes: s.replaceDutyTypes,

    replaceTimetable: s.replaceTimetable,

    upsertExclude: s.upsertExclude,
    removeExclude: s.removeExclude,
    replaceExcludes: s.replaceExcludes,

    upsertPreassign: s.upsertPreassign,
    removePreassign: s.removePreassign,
    replacePreassigns: s.replacePreassigns,

    replaceDutySlots: s.replaceDutySlots,

    replaceAssignments: s.replaceAssignments,
    upsertAssignment: s.upsertAssignment,
    removeAssignment: s.removeAssignment,
    setFixed: s.setFixed,
  };
}
