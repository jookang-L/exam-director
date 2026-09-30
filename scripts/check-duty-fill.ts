import assert from "node:assert/strict";
import { createEmptyExam } from "../lib/types";
import { syncDutyDemandsFromSchedule } from "../lib/generateDutyDemands";
import { classNumberToRoomId } from "../lib/roomClassMap";

function examBase() {
  const exam = createEmptyExam("fill-check");
  exam.gradeSchedule = [
    { grade: 1, startDate: "2026-05-25", endDate: "2026-05-26" },
    { grade: 2, startDate: "2026-05-25", endDate: "2026-05-26" },
    { grade: 3, startDate: "2026-05-25", endDate: "2026-05-26" },
  ];
  exam.periodCount = 4;
  return exam;
}

function count(
  exam: ReturnType<typeof examBase>,
  date: string,
  period: number,
  roomId: string,
  dutyName: string,
) {
  const dutyTypeId = exam.dutyTypes.find((d) => d.name === dutyName)?.id;
  return exam.dutyDemands.find(
    (d) => d.date === date && d.period === period && d.roomId === roomId && d.dutyTypeId === dutyTypeId,
  )?.count ?? 0;
}

const date = "2026-05-25";

// 복도감독 X: 시험 반 정·부, 나머지 자습, 4교시 자습 없음, 복도 없음
{
  const exam = examBase();
  exam.dutyDemandFillMode = "noHall";
  exam.examSlots = [
    {
      id: "s1",
      date,
      period: 2,
      grade: 2,
      subject: "수학",
      classes: [1, 2],
    },
    {
      id: "s2",
      date,
      period: 4,
      grade: 2,
      subject: "영어",
      classes: [3],
    },
  ];
  exam.dutyDemands = syncDutyDemandsFromSchedule(exam);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "정감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "부감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "자습감독"), 0);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 3), "자습감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 2), "복도감독"), 0);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 3), "정감독"), 1);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 3), "부감독"), 1);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 1), "자습감독"), 0);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 4), "자습감독"), 0);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 1), "자습감독"), 1);
  assert.equal(count(exam, date, 3, classNumberToRoomId(2, 5), "자습감독"), 1);
}

// 복도감독 O: 1교시 일반반은 자습만, 특별실 시험은 정·부
{
  const exam = examBase();
  exam.dutyDemandFillMode = "withHall";
  exam.examSlots = [
    {
      id: "s1",
      date,
      period: 1,
      grade: 2,
      subject: "국어",
      classes: [1, 16],
    },
  ];
  exam.dutyDemands = syncDutyDemandsFromSchedule(exam);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 1), "정감독"), 0);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 1), "부감독"), 0);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 1), "자습감독"), 1);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 8), "자습감독"), 1);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 16), "정감독"), 1);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 16), "부감독"), 1);
  assert.equal(count(exam, date, 1, classNumberToRoomId(2, 2), "복도감독"), 0);
}

// 복도감독 O: 특별실만인 교시는 지정 교실 복도 1·자습 0. 1학년 3교시는 시험과 무관하게 복도.
{
  const exam = examBase();
  exam.dutyDemandFillMode = "withHall";
  exam.examSlots = [
    {
      id: "s1",
      date,
      period: 2,
      grade: 2,
      subject: "음악",
      classes: [16, 17],
    },
    {
      id: "s2",
      date,
      period: 2,
      grade: 3,
      subject: "음악",
      classes: [1, 14],
    },
    {
      id: "s3",
      date,
      period: 3,
      grade: 1,
      subject: "국어",
      classes: [1],
    },
    {
      id: "s4",
      date,
      period: 3,
      grade: 3,
      subject: "미술",
      classes: [14, 15],
    },
    {
      id: "s5",
      date,
      period: 4,
      grade: 2,
      subject: "음악",
      classes: [16],
    },
  ];
  exam.dutyDemands.push({
    id: "manual-hall",
    date,
    period: 2,
    roomId: "rH",
    dutyTypeId: exam.dutyTypes.find((d) => d.name === "복도감독")!.id,
    count: 2,
  });
  exam.dutyDemands = syncDutyDemandsFromSchedule(exam);

  for (const cls of [2, 4, 6, 9, 11]) {
    assert.equal(count(exam, date, 2, classNumberToRoomId(2, cls), "복도감독"), 1, `g2 hall ${cls}`);
    assert.equal(count(exam, date, 2, classNumberToRoomId(2, cls), "자습감독"), 0, `g2 self ${cls}`);
  }
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "복도감독"), 0);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "자습감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 16), "정감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 3), "복도감독"), 0);

  assert.equal(count(exam, date, 2, classNumberToRoomId(3, 3), "복도감독"), 0);
  for (const cls of [3, 6, 8, 10, 12]) {
    assert.equal(count(exam, date, 3, classNumberToRoomId(3, cls), "복도감독"), 1, `g3 hall ${cls}`);
    assert.equal(count(exam, date, 3, classNumberToRoomId(3, cls), "자습감독"), 0, `g3 self ${cls}`);
  }
  assert.equal(count(exam, date, 3, classNumberToRoomId(3, 1), "자습감독"), 1);
  assert.equal(count(exam, date, 3, classNumberToRoomId(3, 2), "자습감독"), 1);
  assert.equal(count(exam, date, 2, classNumberToRoomId(1, 2), "복도감독"), 0);
  for (const day of ["2026-05-25", "2026-05-26"]) {
    for (const cls of [2, 5, 7, 11, 13]) {
      assert.equal(count(exam, day, 3, classNumberToRoomId(1, cls), "복도감독"), 1, `g1 ${day} ${cls}`);
      assert.equal(count(exam, day, 3, classNumberToRoomId(1, cls), "자습감독"), 0, `g1 self ${day} ${cls}`);
    }
  }
  assert.equal(count(exam, date, 3, classNumberToRoomId(1, 1), "정감독"), 1);
  assert.equal(count(exam, date, 3, classNumberToRoomId(1, 1), "복도감독"), 0);
  assert.equal(count(exam, date, 3, classNumberToRoomId(1, 3), "자습감독"), 1);

  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 16), "정감독"), 1);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 2), "복도감독"), 0);
  assert.equal(count(exam, date, 4, classNumberToRoomId(2, 1), "자습감독"), 0);
  assert.equal(count(exam, date, 2, "rH", "복도감독"), 2);

  exam.dutyDemandFillMode = "noHall";
  exam.dutyDemands = syncDutyDemandsFromSchedule(exam);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 2), "복도감독"), 0);
  assert.equal(count(exam, date, 2, "rH", "복도감독"), 2);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 1), "정감독"), 0);
  assert.equal(count(exam, date, 2, classNumberToRoomId(2, 16), "정감독"), 1);
}

console.log("duty fill checks ok");
