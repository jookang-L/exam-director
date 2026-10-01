"use client";

import type { Exam } from "@/lib/types";
import { dateWithWeekday } from "@/lib/utils";
import { periodDutyRowsForDate } from "@/lib/grid/periodDutyRows";

export function FullGridPrint({ exam }: { exam: Exam }) {
  const dates = Array.from(new Set(exam.dutySlots.map((s) => s.date))).sort();
  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">{exam.name}</h1>
      <p className="text-sm text-gray-600 mb-4">전체 감독표</p>
      {dates.map((date) => (
        <section key={date} className="mb-6 print-page-break">
          <h2 className="text-lg font-semibold mb-2">
            {dateWithWeekday(date)}
          </h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="border p-1 bg-gray-100">교시</th>
                <th className="border p-1 bg-gray-100">감독</th>
                {exam.rooms.map((r) => (
                  <th key={r.id} className="border p-1 bg-gray-100">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodDutyRowsForDate(exam, date, periods).map((row) => (
                <tr key={`${row.period}-${row.dutyTypeId}`}>
                  {row.isFirstInPeriod ? (
                    <td
                      rowSpan={row.rowSpan}
                      className="border p-1 text-center font-medium bg-gray-50"
                    >
                      {row.period}
                    </td>
                  ) : null}
                  <td className="border p-1 bg-gray-50">{row.dutyTypeName}</td>
                  {exam.rooms.map((r) => {
                    const slots = exam.dutySlots.filter(
                      (s) =>
                        s.date === date &&
                        s.period === row.period &&
                        s.dutyTypeId === row.dutyTypeId &&
                        s.roomId === r.id,
                    );
                    return (
                      <td key={r.id} className="border p-1 align-top">
                        {slots
                          .map((slot) => {
                            const a = exam.assignments.find((x) => x.dutySlotId === slot.id);
                            const t = a ? exam.teachers.find((tt) => tt.id === a.teacherId) : null;
                            return t?.name ?? "(미)";
                          })
                          .join(" · ")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export function DailyPrint({ exam, dates }: { exam: Exam; dates: string[] }) {
  return (
    <div className="p-6">
      {dates.map((date, idx) => (
        <section key={date} className={idx < dates.length - 1 ? "print-page-break mb-10" : "mb-10"}>
          <header className="mb-3">
            <h1 className="text-xl font-bold">{exam.name}</h1>
            <h2 className="text-lg">
              {dateWithWeekday(date)} 일별 감독표
            </h2>
          </header>
          <DayTable exam={exam} date={date} />
        </section>
      ))}
    </div>
  );
}

function DayTable({ exam, date }: { exam: Exam; date: string }) {
  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="border p-1 bg-gray-100">교시</th>
          <th className="border p-1 bg-gray-100">감독</th>
          {exam.rooms.map((r) => (
            <th key={r.id} className="border p-1 bg-gray-100">
              {r.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periodDutyRowsForDate(exam, date, periods).map((row) => (
          <tr key={`${row.period}-${row.dutyTypeId}`}>
            {row.isFirstInPeriod ? (
              <td
                rowSpan={row.rowSpan}
                className="border p-1 text-center font-medium bg-gray-50"
              >
                {row.period}교시
              </td>
            ) : null}
            <td className="border p-1 bg-gray-50">{row.dutyTypeName}</td>
            {exam.rooms.map((r) => {
              const slots = exam.dutySlots.filter(
                (s) =>
                  s.date === date &&
                  s.period === row.period &&
                  s.dutyTypeId === row.dutyTypeId &&
                  s.roomId === r.id,
              );
              return (
                <td key={r.id} className="border p-1 align-top">
                  {slots
                    .map((slot) => {
                      const a = exam.assignments.find((x) => x.dutySlotId === slot.id);
                      const t = a ? exam.teachers.find((tt) => tt.id === a.teacherId) : null;
                      return t?.name ?? "(미)";
                    })
                    .join(" · ")}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeacherPrint({ exam, teacherIds }: { exam: Exam; teacherIds: string[] }) {
  return (
    <div className="p-6">
      {teacherIds.map((tid, idx) => {
        const teacher = exam.teachers.find((t) => t.id === tid);
        if (!teacher) return null;
        const rows = exam.assignments
          .filter((a) => a.teacherId === tid)
          .map((a) => {
            const slot = exam.dutySlots.find((s) => s.id === a.dutySlotId);
            return { a, slot };
          })
          .filter((x): x is { a: typeof x.a; slot: NonNullable<typeof x.slot> } => !!x.slot)
          .sort((a, b) => (a.slot.date + a.slot.period).localeCompare(b.slot.date + b.slot.period));

        let weight = 0;
        for (const { slot } of rows) {
          const dt = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId);
          weight += dt?.weight ?? 1;
        }

        return (
          <section
            key={tid}
            className={idx < teacherIds.length - 1 ? "print-page-break mb-8" : "mb-8"}
          >
            <header className="mb-3">
              <h1 className="text-xl font-bold">{exam.name}</h1>
              <h2 className="text-lg">{teacher.name} 선생님 개인별 감독표</h2>
              <p className="text-xs text-gray-600">
                교과: {teacher.subject} / 역할: {teacher.roleType}
                {teacher.homeroomGrade ? ` / 담임: ${teacher.homeroomGrade}-${teacher.homeroomClass}` : ""}
              </p>
              <p className="text-xs">
                총 감독 {rows.length}회 · 업무강도 {weight.toFixed(1)}
              </p>
            </header>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="border p-1 bg-gray-100 text-left">날짜</th>
                  <th className="border p-1 bg-gray-100 text-left">교시</th>
                  <th className="border p-1 bg-gray-100 text-left">고사실</th>
                  <th className="border p-1 bg-gray-100 text-left">감독 종류</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="border p-2 text-center text-gray-500">
                      배정된 감독이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ a, slot }) => {
                    const dt = exam.dutyTypes.find((d) => d.id === slot.dutyTypeId);
                    const room = exam.rooms.find((r) => r.id === slot.roomId);
                    return (
                      <tr key={a.id}>
                        <td className="border p-1">
                          {dateWithWeekday(slot.date)}
                        </td>
                        <td className="border p-1">{slot.period}교시</td>
                        <td className="border p-1">{room?.name ?? "?"}</td>
                        <td className="border p-1">{dt?.name ?? "?"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
