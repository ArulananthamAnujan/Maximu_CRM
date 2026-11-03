/**
 * Excel workbooks built in the browser. Every export the CRM offers goes
 * through here so each file looks the same: a bold, frozen header row with a
 * filter on every column, widths that fit the data, dates stored as real
 * dates and money as numbers, and a Summary sheet saying who exported what,
 * when, and under which filters.
 *
 * ExcelJS is loaded on demand: it is a large library and most sessions never
 * export anything.
 */
export type SheetColumn = {
  key: string;
  header: string;
  /** Hints the cell format; "date" expects ISO or yyyy-mm-dd strings. */
  type?: "text" | "number" | "money" | "date" | "percent";
  width?: number;
};
export type SheetSpec = {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  /** Short lines shown above the table, e.g. the filters that produced it. */
  notes?: string[];
};
export type WorkbookSummary = {
  title: string;
  exportedBy: string;
  filters: [string, string][];
  /** One line per sheet: name and row count. Filled in automatically. */
  generatedAt?: Date;
};

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF102F40" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };

function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base} ${n++}`;
  used.add(candidate.toLowerCase());
  base = candidate;
  return base;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cellValue(value: unknown, type: SheetColumn["type"]): unknown {
  if (value == null || value === "") return null;
  if (type === "date") return asDate(value) ?? String(value);
  if (type === "number" || type === "money" || type === "percent") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** Builds the workbook and returns it as a Blob ready to download. */
export async function buildWorkbook(sheets: SheetSpec[], summary?: WorkbookSummary): Promise<Blob> {
  // The browser bundle exposes ExcelJS as a namespace; Node's ESM loader
  // wraps the CommonJS build under "default". Accept either.
  const loaded = (await import("exceljs")) as { default?: typeof import("exceljs") } & typeof import("exceljs");
  const ExcelJS = loaded.Workbook ? loaded : (loaded.default as typeof import("exceljs"));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maximus CRM";
  workbook.created = summary?.generatedAt ?? new Date();
  const used = new Set<string>();

  if (summary) {
    const sheet = workbook.addWorksheet(sheetName("Summary", used));
    sheet.columns = [{ width: 30 }, { width: 60 }];
    const title = sheet.addRow([summary.title]);
    title.font = { bold: true, size: 14 };
    sheet.addRow(["Exported by", summary.exportedBy]);
    sheet.addRow(["Exported at", summary.generatedAt ?? new Date()]).getCell(2).numFmt = "yyyy-mm-dd hh:mm";
    sheet.addRow([]);
    const filterHeading = sheet.addRow(["Filters applied"]);
    filterHeading.font = { bold: true };
    if (summary.filters.length) for (const [label, value] of summary.filters) sheet.addRow([label, value]);
    else sheet.addRow(["None", "Every record the account may see"]);
    sheet.addRow([]);
    const contents = sheet.addRow(["Sheet", "Rows"]);
    contents.font = { bold: true };
    for (const spec of sheets) sheet.addRow([spec.name, spec.rows.length]);
  }

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(sheetName(spec.name, used));
    const noteRows = spec.notes?.length ? spec.notes.length + 1 : 0;
    for (const note of spec.notes ?? []) sheet.addRow([note]).font = { italic: true, color: { argb: "FF536875" } };
    if (noteRows) sheet.addRow([]);
    const header = sheet.addRow(spec.columns.map((column) => column.header));
    header.font = HEADER_FONT;
    header.fill = HEADER_FILL;
    header.alignment = { vertical: "middle" };
    header.height = 20;
    for (const row of spec.rows) {
      const added = sheet.addRow(spec.columns.map((column) => cellValue(row[column.key], column.type)));
      spec.columns.forEach((column, index) => {
        const cell = added.getCell(index + 1);
        if (column.type === "date") cell.numFmt = "yyyy-mm-dd";
        else if (column.type === "money") cell.numFmt = "#,##0.00";
        else if (column.type === "percent") cell.numFmt = "0.0";
      });
    }
    spec.columns.forEach((column, index) => {
      const longest = Math.max(
        column.header.length,
        ...spec.rows.slice(0, 500).map((row) => String(row[column.key] ?? "").length),
      );
      sheet.getColumn(index + 1).width = column.width ?? Math.min(60, Math.max(10, longest + 2));
    });
    const headerRow = noteRows + 1;
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
    if (spec.columns.length)
      sheet.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow + Math.max(spec.rows.length, 1), column: spec.columns.length },
      };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Column definitions inferred from plain rows, for quick "export selected" tables. */
export function columnsFromRows(rows: Record<string, unknown>[]): SheetColumn[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.map((key) => ({
    key,
    header: key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase()),
    type: rows.every((row) => row[key] == null || row[key] === "" || typeof row[key] === "number") && rows.some((row) => typeof row[key] === "number") ? "number" : "text",
  }));
}

/** A safe file name: letters, digits, dashes, and the date, ending in .xlsx. */
export function workbookFileName(label: string, at: Date = new Date()): string {
  const stem = label.toLowerCase().replace(/\.(csv|json|xlsx)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${stem}-${at.toISOString().slice(0, 10)}.xlsx`;
}
