"use client";

import * as React from "react";
import { useExam, useExamMutators } from "@/lib/store/selectors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepNavButtons } from "@/components/wizard/WizardFrame";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { newId, type DutyDemand } from "@/lib/types";
import {
  createDefaultRooms,
  DEFAULT_ROOM_COUNT,
  DEFAULT_ROOMS_BY_GRADE,
  mergeMissingDefaultRooms,
} from "@/lib/defaultRooms";
import { isClassRoom, isGradeColumnStart, roomHeaderLines } from "@/lib/roomDisplay";
import { eachDate, shortDate, weekdayKo } from "@/lib/utils";

function RoomHeaderCell({ name }: { name: string }) {
  const { line1, line2 } = roomHeaderLines(name);
  if (!line2) {
    return <span className="whitespace-nowrap">{line1}</span>;
  }
  return (
    <span className="block leading-tight whitespace-normal">
      <span className="block">{line1}</span>
      <span className="block">{line2}</span>
    </span>
  );
}

export default function RoomsPage() {
  const exam = useExam();
  const m = useExamMutators();
  const [roomName, setRoomName] = React.useState("");

  const dates = React.useMemo(() => {
    const set = new Set<string>();
    if (!exam) return [];
    for (const g of exam.gradeSchedule) {
      if (g.startDate && g.endDate) {
        for (const d of eachDate(g.startDate, g.endDate)) set.add(d);
      }
    }
    return Array.from(set).sort();
  }, [exam]);

  if (!exam) return null;

  const periods = Array.from({ length: exam.periodCount }, (_, i) => i + 1);

  const addRoom = () => {
    if (!roomName.trim()) return;
    m.upsertRoom({ id: newId(), name: roomName.trim() });
    setRoomName("");
  };

  const applyDefaultRooms = (replace: boolean) => {
    const defaults = createDefaultRooms();
    if (replace) {
      if (
        exam.rooms.length > 0 &&
        (exam.dutyDemands.length > 0 || exam.dutySlots.length > 0) &&
        !confirm(
          "고사실을 기본 목록으로 바꾸면 기존 감독 수요·슬롯의 고사실 연결이 끊길 수 있습니다. 계속할까요?",
        )
      ) {
        return;
      }
      m.replaceRooms(defaults);
      return;
    }
    const merged = mergeMissingDefaultRooms(exam.rooms);
    if (merged !== exam.rooms) m.replaceRooms(merged);
  };

  React.useEffect(() => {
    const merged = mergeMissingDefaultRooms(exam.rooms);
    if (merged !== exam.rooms) {
      m.replaceRooms(merged);
      m.syncDutyDemandsFromSchedule();
    }
  }, [exam.id]); // eslint-disable-line react-hooks/exhaustive-deps -- 시험 로드 시 1회

  const getDemand = (date: string, period: number, roomId: string, dutyTypeId: string): number => {
    const d = exam.dutyDemands.find(
      (x) => x.date === date && x.period === period && x.roomId === roomId && x.dutyTypeId === dutyTypeId,
    );
    return d?.count ?? 0;
  };

  const setDemand = (
    date: string,
    period: number,
    roomId: string,
    dutyTypeId: string,
    count: number,
  ) => {
    const exists = exam.dutyDemands.find(
      (x) => x.date === date && x.period === period && x.roomId === roomId && x.dutyTypeId === dutyTypeId,
    );
    if (count <= 0) {
      if (exists) m.removeDutyDemand(exists.id);
      return;
    }
    const next: DutyDemand = exists
      ? { ...exists, count }
      : { id: newId(), date, period, roomId, dutyTypeId, count };
    m.upsertDutyDemand(next);
  };

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-2xl font-bold">STEP 3 — 고사실 / 감독 수요</h1>
        <p className="text-sm text-muted-foreground">
          기본 고사실 {DEFAULT_ROOM_COUNT}개가 자동으로 들어갑니다. STEP 2 시험표를 바꾸면 정감독·부감독·자습감독
          (1교시, 시험 없는 교시, 부분 시험의 나머지 반 — 1학년 1~13 · 2학년 1~15 · 3학년 1~13)이 자동
          반영됩니다. 복도·특별실 등은 직접 입력하세요.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>고사실 목록</CardTitle>
          <CardDescription>
            이름에 학년-반 (예: &quot;2-18&quot;)이 포함되면 시험표·담임 자동 배정에 사용됩니다.
            1학년 {DEFAULT_ROOMS_BY_GRADE[1]} · 2학년 {DEFAULT_ROOMS_BY_GRADE[2]} · 3학년{" "}
            {DEFAULT_ROOMS_BY_GRADE[3]} (총 {DEFAULT_ROOM_COUNT}개)가 기본값입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {exam.rooms.length === 0 ? (
              <Button variant="secondary" onClick={() => applyDefaultRooms(true)}>
                기본 고사실 적용 ({DEFAULT_ROOM_COUNT}개)
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => applyDefaultRooms(false)}>
                  빠진 기본 고사실만 추가
                </Button>
                <Button variant="outline" onClick={() => applyDefaultRooms(true)}>
                  기본 고사실로 전체 교체
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="예: 1-1 교실, 2-3 교실, 강당 1구역"
              onKeyDown={(e) => {
                if (e.key === "Enter") addRoom();
              }}
            />
            <Button onClick={addRoom}>
              <Plus className="h-4 w-4" /> 추가
            </Button>
          </div>
          {exam.rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 고사실이 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {exam.rooms.map((r) => (
                <li key={r.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                  <span>{r.name}</span>
                  <button
                    onClick={() => m.removeRoom(r.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`${r.name} 삭제`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>감독 수요 매트릭스</CardTitle>
          <CardDescription>
            셀에 필요 인원 수를 입력합니다. 0이면 해당 감독이 필요 없는 것입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="secondary"
            onClick={() => {
              m.syncDutyDemandsFromSchedule();
              toast({
                title: "감독 수요 갱신",
                description: "시험표·시험 기간 기준으로 정감독·부감독·자습감독이 다시 채워졌습니다.",
                variant: "success",
              });
            }}
          >
            <RefreshCw className="h-4 w-4" /> 시험표 기준 감독 수요 다시 채우기
          </Button>
          {dates.length === 0 || exam.rooms.length === 0 || exam.dutyTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              먼저 STEP 1의 시험 기간, 위쪽 고사실 목록, STEP 5의 감독 종류를 설정해주세요.
            </p>
          ) : (
            <div className="space-y-8 w-full">
              {dates.map((date, dateIdx) => (
                <section
                  key={date}
                  className="w-full rounded-lg border-2 border-border/80 bg-muted/20 shadow-sm overflow-hidden"
                >
                  <header
                    className={`px-4 py-2.5 font-semibold border-b-2 border-border ${
                      dateIdx % 2 === 0 ? "bg-muted/70" : "bg-muted/50"
                    }`}
                  >
                    {shortDate(date)} ({weekdayKo(date)})
                  </header>
                  <div className="w-full overflow-x-auto">
                    <table className="min-w-max text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-1 bg-muted">교시</th>
                          <th className="border p-1 bg-muted">감독</th>
                          {exam.rooms.map((r, ri) => {
                            const gradeStart = isGradeColumnStart(
                              r.name,
                              ri > 0 ? exam.rooms[ri - 1].name : null,
                            );
                            return (
                              <th
                                key={r.id}
                                title={r.name}
                                className={`border p-1 bg-muted text-xs font-medium text-center align-bottom ${
                                  isClassRoom(r.name) ? "min-w-[2.75rem]" : "min-w-[4.25rem]"
                                } ${gradeStart ? "border-l-[3px] border-l-foreground/35" : ""}`}
                              >
                                <RoomHeaderCell name={r.name} />
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((period) => {
                          const periodTint = period % 2 === 1 ? "bg-background" : "bg-muted/25";
                          return exam.dutyTypes.map((dt, i) => {
                            const isFirstDuty = i === 0;
                            const isLastDuty = i === exam.dutyTypes.length - 1;
                            return (
                              <tr
                                key={`${date}-${period}-${dt.id}`}
                                className={[
                                  periodTint,
                                  isFirstDuty ? "border-t-[3px] border-t-foreground/30" : "",
                                  isLastDuty ? "border-b-[3px] border-b-foreground/20" : "",
                                ].join(" ")}
                              >
                                {isFirstDuty ? (
                                  <td
                                    rowSpan={exam.dutyTypes.length}
                                    className={`border p-1 align-middle text-center font-medium bg-muted/40 ${periodTint} border-t-[3px] border-t-foreground/30`}
                                  >
                                    {period}교시
                                  </td>
                                ) : null}
                                <td
                                  className={`border p-1 text-xs bg-muted/20 whitespace-nowrap ${
                                    isFirstDuty ? "border-t-[3px] border-t-foreground/30" : ""
                                  }`}
                                >
                                  {dt.name}
                                </td>
                                {exam.rooms.map((r, ri) => {
                                  const gradeStart = isGradeColumnStart(
                                    r.name,
                                    ri > 0 ? exam.rooms[ri - 1].name : null,
                                  );
                                  return (
                                  <td
                                    key={r.id}
                                    className={`border p-0 ${
                                      gradeStart ? "border-l-[3px] border-l-foreground/35" : ""
                                    } ${isFirstDuty ? "border-t-[3px] border-t-foreground/30" : ""} ${
                                      isLastDuty ? "border-b-[3px] border-b-foreground/20" : ""
                                    }`}
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      className={`h-8 text-center bg-transparent outline-none focus:bg-accent ${
                                        isClassRoom(r.name)
                                          ? "w-14"
                                          : "w-full min-w-[4.25rem]"
                                      }`}
                                      value={getDemand(date, period, r.id, dt.id) || ""}
                                      onChange={(e) =>
                                        setDemand(date, period, r.id, dt.id, Number(e.target.value) || 0)
                                      }
                                    />
                                  </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <StepNavButtons currentPath="rooms" />
    </div>
  );
}
