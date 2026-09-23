import { z } from "zod";

const gradeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const teacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  roleType: z.enum(["정교사", "기간제", "강사", "보건교사", "영양교사"]),
  homeroomGrade: gradeSchema.optional(),
  homeroomClass: z.number().optional(),
  previousFatigueScore: z.number(),
});

export const examSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.number(),
  carryOverRatio: z.number(),
  gradeSchedule: z.array(
    z.object({
      grade: gradeSchema,
      startDate: z.string(),
      endDate: z.string(),
    }),
  ),
  periodCount: z.number(),
  periodTimes: z.array(
    z.object({
      period: z.number(),
      start: z.string(),
      end: z.string(),
    }),
  ),
  examSlots: z.array(z.object({ id: z.string() }).passthrough()),
  rooms: z.array(z.object({ id: z.string(), name: z.string() })),
  dutyDemands: z.array(z.object({ id: z.string() }).passthrough()),
  teachers: z.array(teacherSchema),
  dutyTypes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      weight: z.number(),
    }),
  ),
  timetable: z.array(z.object({ id: z.string() }).passthrough()),
  excludes: z.array(z.object({ id: z.string() }).passthrough()),
  preassigns: z.array(z.object({ id: z.string() }).passthrough()),
  dutySlots: z.array(z.object({ id: z.string() }).passthrough()),
  assignments: z.array(z.object({ id: z.string() }).passthrough()),
});

export type ParsedExam = z.infer<typeof examSchema>;
