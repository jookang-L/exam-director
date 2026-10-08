// 사용법: npx tsx scripts/make-supervision-sheet.ts <시험.json> [출력.xlsx]
import { readFileSync } from "node:fs";
import type { Exam } from "../lib/types";
import { buildSupervisionSheetWorkbook } from "../lib/io/supervisionSheetExcel";

const [, , jsonPath, outPath] = process.argv;
if (!jsonPath) {
  console.error("사용법: npx tsx scripts/make-supervision-sheet.ts <시험.json> [출력.xlsx]");
  process.exit(1);
}

const exam = JSON.parse(readFileSync(jsonPath, "utf-8")) as Exam;
const { workbook, warnings } = buildSupervisionSheetWorkbook(exam);
const out = outPath ?? `${exam.name || "exam"}_감독시간표.xlsx`;

workbook.xlsx.writeFile(out).then(() => {
  console.log(`저장: ${out}`);
  console.log(`시트: ${workbook.worksheets.map((w) => w.name).join(", ")}`);
  if (warnings.length) {
    console.log(`경고 ${warnings.length}건`);
    for (const w of warnings.slice(0, 20)) console.log(" -", w);
  }
});
