import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook, columnsFromRows, workbookFileName } from "../lib/workbook.ts";

test("an export is a real Excel workbook with a summary, typed cells and a filter on every column", async () => {
  const blob = await buildWorkbook([
    {
      name: "Enquiries",
      notes: ["Enquiries opened 2026-01-01 to 2026-03-31."],
      columns: [
        { key: "date", header: "Enquiry date", type: "date" },
        { key: "client", header: "Client" },
        { key: "total", header: "Total", type: "money" },
        { key: "rate", header: "Conversion %", type: "percent" },
      ],
      rows: [
        { date: "2026-02-10", client: "Priya Sharma", total: 2200, rate: 50 },
        { date: "2026-02-11T03:00:00Z", client: "Arun Kumar", total: "1500.5", rate: 0 },
      ],
    },
    { name: "Enquiries", columns: [{ key: "a", header: "A" }], rows: [] },
  ], { title: "Maximus CRM report", exportedBy: "owner@maximus.test", filters: [["Office", "Melbourne"]], generatedAt: new Date("2026-04-01T00:00:00Z") });
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const loaded = await import("exceljs");
  const ExcelJS = loaded.Workbook ? loaded : loaded.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Summary", "Enquiries", "Enquiries 2"], "duplicate sheet names are made unique");
  const summary = workbook.getWorksheet("Summary");
  assert.equal(summary.getCell("A1").value, "Maximus CRM report");
  assert.equal(summary.getCell("B2").value, "owner@maximus.test");
  assert.equal(summary.getCell("A6").value, "Office");
  assert.equal(summary.getCell("B6").value, "Melbourne");
  const sheet = workbook.getWorksheet("Enquiries");
  assert.equal(sheet.getCell("A1").value, "Enquiries opened 2026-01-01 to 2026-03-31.");
  assert.equal(sheet.getCell("A3").value, "Enquiry date", "the header follows the notes");
  assert.equal(sheet.getRow(3).font.bold, true);
  assert.ok(sheet.getCell("A4").value instanceof Date, "dates are stored as dates");
  assert.equal(sheet.getCell("C4").value, 2200);
  assert.equal(sheet.getCell("C5").value, 1500.5, "money arriving as text becomes a number");
  assert.equal(sheet.getCell("C4").numFmt, "#,##0.00");
  assert.equal(sheet.views[0].ySplit, 3, "the header row is frozen");
  assert.ok(sheet.autoFilter, "every column can be filtered");
});

test("quick exports infer their columns and name their files safely", () => {
  const columns = columnsFromRows([{ display_name: "Olivia", openTasks: 2 }, { display_name: "Mark", openTasks: null }]);
  assert.deepEqual(columns.map((c) => [c.header, c.type]), [["Display name", "text"], ["Open Tasks", "number"]]);
  assert.match(workbookFileName("staff-selected.csv", new Date("2026-04-01T10:00:00Z")), /^staff-selected-2026-04-01\.xlsx$/);
  assert.match(workbookFileName("What falls due next"), /^what-falls-due-next-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
