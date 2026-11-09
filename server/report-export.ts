/**
 * The datasets behind the report builder: every record an agency analyses,
 * filtered by the date range and business filters a manager chooses, with
 * names resolved so the rows read as a person would write them. The browser
 * turns these into an Excel workbook (lib/workbook.ts).
 *
 * Row-level security scopes every read, so a case officer's export covers
 * their branch and an owner's covers the organisation; the finance sheet is
 * management data and is left out for case officers.
 */
import { supabaseRequest } from "@/server/supabase";

type Row = Record<string, unknown>;
export type ExportFilters = {
  from: string | null;
  to: string | null;
  branchId: string | null;
  stream: "study_abroad" | "direct_visa" | null;
  ownerId: string | null;
  stage: string | null;
  source: string | null;
  status: string | null;
  datasets: string[];
};
export type ExportColumn = { key: string; header: string; type?: "text" | "number" | "money" | "date" | "percent" };
export type ExportSheet = { name: string; columns: ExportColumn[]; rows: Row[]; notes?: string[] };

export const EXPORT_DATASETS = ["enquiries", "cases", "applications", "visas", "finance", "staff", "patterns"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseExportFilters(params: URLSearchParams): ExportFilters {
  const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null);
  const id = (value: string | null) => (value && UUID.test(value) ? value : null);
  const text = (value: string | null, max = 80) => (value && value.trim() ? value.trim().slice(0, max) : null);
  const streamParam = params.get("stream");
  const requested = (params.get("datasets") ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  return {
    from: day(params.get("from")),
    to: day(params.get("to")),
    branchId: id(params.get("branchId")),
    stream: streamParam === "study_abroad" || streamParam === "direct_visa" ? streamParam : null,
    ownerId: id(params.get("ownerId")),
    stage: text(params.get("stage"), 40),
    source: text(params.get("source")),
    status: text(params.get("status")),
    datasets: requested.length ? requested.filter((d) => (EXPORT_DATASETS as readonly string[]).includes(d)) : [...EXPORT_DATASETS],
  };
}

const str = (value: unknown) => (value == null ? "" : String(value));
const dayOf = (value: unknown) => (typeof value === "string" && value ? value.slice(0, 10) : "");
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const daysBetween = (from: unknown, to: unknown): number | null => {
  const a = typeof from === "string" ? Date.parse(from) : NaN;
  const b = typeof to === "string" ? Date.parse(to) : NaN;
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86_400_000);
};
const monthOf = (value: unknown) => (typeof value === "string" && value.length >= 7 ? value.slice(0, 7) : "unknown");
function inRange(value: unknown, from: string | null, to: string | null): boolean {
  const day = dayOf(value);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
const humanStage = (stage: unknown, direct: boolean) =>
  ({ enquiry: "Enquiry", student: direct ? "Client" : "Student", application: "Application", visa: "Visa", deferred: "Deferred", completed: "Completed" } as Record<string, string>)[str(stage)] ?? str(stage);
const humanStream = (stream: unknown) => (stream === "direct_visa" ? "Direct Visa" : stream === "study_abroad" ? "Study Abroad" : str(stream));

async function rest(query: string, token: string): Promise<Row[]> {
  const [table, search = ""] = query.split("?");
  const params = new URLSearchParams(search);
  params.set("limit", "500");
  params.set("order", "id.asc");
  const rows: Row[] = [];
  while (rows.length < 100_000) {
    params.set("offset", String(rows.length));
    const page = await supabaseRequest<Row[]>(`/rest/v1/${table}?${params}`, { method: "GET" }, token);
    if (!page.length) return rows;
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw new Error(`Export dataset ${table} exceeded its supported size.`);
}
async function byIds(table: string, select: string, column: string, ids: string[], token: string): Promise<Row[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: Row[] = [];
  for (let i = 0; i < unique.length; i += 150)
    rows.push(...(await rest(`${table}?select=${select}&${column}=in.(${unique.slice(i, i + 150).join(",")})`, token)));
  return rows;
}
function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const label = key(row) || "Not recorded";
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return groups;
}
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export async function buildReportExport(token: string, filters: ExportFilters, options: { includeFinance: boolean }): Promise<{ sheets: ExportSheet[]; filtersApplied: [string, string][] }> {
  const caseQuery = new URLSearchParams({ select: "id,client_id,branch_id,case_number,service_type,matter_type,owner_id,health,priority,progress,target,next_action,due_at,lifecycle_stage,visa_expiry_on,opened_at,stage_entered_at,closed_at,outcome,custom_fields" });
  if (filters.from) caseQuery.append("opened_at", `gte.${filters.from}`);
  if (filters.to) caseQuery.append("opened_at", `lt.${nextDay(filters.to)}`);
  if (filters.branchId) caseQuery.set("branch_id", `eq.${filters.branchId}`);
  if (filters.stream) caseQuery.set("service_type", `eq.${filters.stream}`);
  if (filters.ownerId) caseQuery.set("owner_id", `eq.${filters.ownerId}`);
  if (filters.stage) caseQuery.set("lifecycle_stage", `eq.${filters.stage}`);

  const [cases, profiles, branches] = await Promise.all([
    rest(`cases?${caseQuery}`, token),
    rest("profiles?select=id,display_name,branch_id,level,active,department", token),
    rest("branches?select=id,name,code", token),
  ]);
  const caseIds = cases.map((row) => str(row.id));
  const clientIds = cases.map((row) => str(row.client_id));
  const [clients, enquiries, applications, visas, tasks, notes, invoices] = await Promise.all([
    byIds("clients", "id,first_name,last_name,email,mobile,nationality,source,created_at", "id", clientIds, token),
    byIds("enquiries", "id,client_id,case_id,source,campaign,status,score,next_follow_up_at,lost_reason,created_at,converted_at,assigned_to", "case_id", caseIds, token),
    byIds("education_applications", "id,case_id,institution,course,campus,intake,application_reference,status,submitted_at,offer_received_at,coe_received_at,deadline_at,archived_at", "case_id", caseIds, token),
    byIds("visa_matters", "id,case_id,destination_country,visa_subclass,visa_stream,lodgement_reference,status,outcome,lodged_at,decision_at,current_visa_expiry,information_due_at,information_provided_at", "case_id", caseIds, token),
    rest("tasks?select=id,case_id,status,due_at,assigned_to,completed_at,created_at", token),
    byIds("case_notes", "id,case_id,author_id,created_at", "case_id", caseIds, token),
    options.includeFinance ? byIds("invoices", "id,client_id,case_id,invoice_number,invoice_type,currency,subtotal,tax,total,paid,state,issued_on,due_on,created_by", "case_id", caseIds, token) : Promise.resolve([] as Row[]),
  ]);

  const name = new Map(profiles.map((row) => [str(row.id), str(row.display_name)]));
  const branch = new Map(branches.map((row) => [str(row.id), str(row.name)]));
  const client = new Map(clients.map((row) => [str(row.id), row]));
  const enquiryByCase = new Map(enquiries.map((row) => [str(row.case_id), row]));
  const caseById = new Map(cases.map((row) => [str(row.id), row]));
  const clientName = (id: unknown) => { const c = client.get(str(id)); return c ? `${str(c.first_name)} ${str(c.last_name)}`.trim() : ""; };
  const fields = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});

  // Lead-level filters apply to the enquiry record on the case.
  const leadRows = cases.map((row) => {
    const enquiry = enquiryByCase.get(str(row.id)) ?? {};
    const c = client.get(str(row.client_id)) ?? {};
    const custom = fields(row.custom_fields);
    const direct = row.service_type === "direct_visa";
    const converted = row.lifecycle_stage !== "enquiry";
    const convertedOn = enquiry.converted_at ?? (converted ? row.stage_entered_at : null);
    return {
      enquiryDate: dayOf(row.opened_at),
      client: clientName(row.client_id),
      email: str(c.email),
      mobile: str(c.mobile),
      nationality: str(c.nationality),
      office: branch.get(str(row.branch_id)) ?? "",
      stream: humanStream(row.service_type),
      matterType: str(row.matter_type),
      target: str(row.target),
      intake: str(custom.intake ?? custom.suggested_intake ?? ""),
      source: str(enquiry.source ?? c.source ?? ""),
      campaign: str(enquiry.campaign),
      leadStatus: str(enquiry.status ?? custom.mainStatus ?? ""),
      detailedStatus: str(custom.subStatus ?? ""),
      leadScore: Number(enquiry.score ?? 0),
      assignedTo: name.get(str(row.owner_id)) ?? "",
      nextFollowUp: dayOf(enquiry.next_follow_up_at),
      currentStage: humanStage(row.lifecycle_stage, direct),
      converted: converted ? "Yes" : "No",
      convertedOn: dayOf(convertedOn),
      daysToConvert: converted ? daysBetween(row.opened_at, convertedOn) : null,
      lostReason: str(enquiry.lost_reason),
      health: str(row.health),
      priority: str(row.priority),
      nextAction: str(row.next_action),
      due: dayOf(row.due_at),
      caseNumber: str(row.case_number),
      caseId: str(row.id),
    };
  }).filter((row) => (!filters.source || row.source.toLowerCase() === filters.source.toLowerCase()) && (!filters.status || row.leadStatus.toLowerCase() === filters.status.toLowerCase()));
  const keptCases = new Set(leadRows.map((row) => row.caseId));
  const scopedCases = cases.filter((row) => keptCases.has(str(row.id)));

  const sheets: ExportSheet[] = [];
  const want = (dataset: string) => filters.datasets.includes(dataset);
  const rangeNote = filters.from || filters.to ? `Enquiries opened ${filters.from ?? "any time"} to ${filters.to ?? "today"}.` : "All enquiries this account may see.";

  if (want("enquiries"))
    sheets.push({
      name: "Enquiries & leads",
      notes: [rangeNote],
      columns: [
        { key: "enquiryDate", header: "Enquiry date", type: "date" }, { key: "client", header: "Client" }, { key: "email", header: "Email" },
        { key: "mobile", header: "Mobile" }, { key: "nationality", header: "Nationality" }, { key: "office", header: "Office" },
        { key: "stream", header: "Service stream" }, { key: "matterType", header: "Matter type" }, { key: "target", header: "Course / visa target" },
        { key: "intake", header: "Intake" }, { key: "source", header: "Lead source" }, { key: "campaign", header: "Campaign" },
        { key: "leadStatus", header: "Lead status" }, { key: "detailedStatus", header: "Detailed status" }, { key: "leadScore", header: "Lead score", type: "number" },
        { key: "assignedTo", header: "Assigned to" }, { key: "nextFollowUp", header: "Next follow-up", type: "date" },
        { key: "currentStage", header: "Current stage" }, { key: "converted", header: "Converted" }, { key: "convertedOn", header: "Converted on", type: "date" },
        { key: "daysToConvert", header: "Days to convert", type: "number" }, { key: "lostReason", header: "Lost reason" },
        { key: "health", header: "Case health" }, { key: "priority", header: "Priority" }, { key: "nextAction", header: "Next action" },
        { key: "due", header: "Due", type: "date" }, { key: "caseNumber", header: "Case number" },
      ],
      rows: leadRows,
    });

  if (want("cases"))
    sheets.push({
      name: "Pipeline",
      notes: [rangeNote],
      columns: [
        { key: "caseNumber", header: "Case number" }, { key: "client", header: "Client" }, { key: "office", header: "Office" },
        { key: "stream", header: "Service stream" }, { key: "matterType", header: "Matter type" }, { key: "target", header: "Target" },
        { key: "stage", header: "Stage" }, { key: "health", header: "Health" }, { key: "progress", header: "Progress %", type: "number" },
        { key: "owner", header: "Case owner" }, { key: "opened", header: "Opened", type: "date" }, { key: "stageEntered", header: "Stage entered", type: "date" },
        { key: "due", header: "Next action due", type: "date" }, { key: "visaExpiry", header: "Visa expiry", type: "date" },
        { key: "closed", header: "Closed", type: "date" }, { key: "outcome", header: "Outcome" }, { key: "daysOpen", header: "Days open", type: "number" },
      ],
      rows: scopedCases.map((row) => ({
        caseNumber: str(row.case_number), client: clientName(row.client_id), office: branch.get(str(row.branch_id)) ?? "",
        stream: humanStream(row.service_type), matterType: str(row.matter_type), target: str(row.target),
        stage: humanStage(row.lifecycle_stage, row.service_type === "direct_visa"), health: str(row.health), progress: Number(row.progress ?? 0),
        owner: name.get(str(row.owner_id)) ?? "", opened: dayOf(row.opened_at), stageEntered: dayOf(row.stage_entered_at),
        due: dayOf(row.due_at), visaExpiry: dayOf(row.visa_expiry_on), closed: dayOf(row.closed_at), outcome: str(row.outcome),
        daysOpen: daysBetween(row.opened_at, row.closed_at ?? new Date().toISOString()),
      })),
    });

  if (want("applications"))
    sheets.push({
      name: "Applications",
      notes: ["Applications on the enquiries in range, including those not yet submitted."],
      columns: [
        { key: "caseNumber", header: "Case number" }, { key: "client", header: "Client" }, { key: "office", header: "Office" },
        { key: "institution", header: "Institution" }, { key: "course", header: "Course" }, { key: "campus", header: "Campus" },
        { key: "intake", header: "Intake" }, { key: "reference", header: "Application reference" }, { key: "status", header: "Status" },
        { key: "submitted", header: "Submitted", type: "date" }, { key: "offer", header: "Offer received", type: "date" },
        { key: "coe", header: "CoE received", type: "date" }, { key: "deadline", header: "Deadline", type: "date" },
        { key: "daysToOffer", header: "Days to offer", type: "number" }, { key: "owner", header: "Case owner" },
      ],
      rows: applications.filter((row) => keptCases.has(str(row.case_id)) && !row.archived_at).map((row) => {
        const parent = caseById.get(str(row.case_id)) ?? {};
        return {
          caseNumber: str(parent.case_number), client: clientName(parent.client_id), office: branch.get(str(parent.branch_id)) ?? "",
          institution: str(row.institution), course: str(row.course), campus: str(row.campus), intake: str(row.intake),
          reference: str(row.application_reference), status: str(row.status), submitted: dayOf(row.submitted_at),
          offer: dayOf(row.offer_received_at), coe: dayOf(row.coe_received_at), deadline: dayOf(row.deadline_at),
          daysToOffer: daysBetween(row.submitted_at, row.offer_received_at), owner: name.get(str(parent.owner_id)) ?? "",
        };
      }),
    });

  if (want("visas"))
    sheets.push({
      name: "Visa matters",
      notes: ["Visa matters on the enquiries in range."],
      columns: [
        { key: "caseNumber", header: "Case number" }, { key: "client", header: "Client" }, { key: "office", header: "Office" },
        { key: "destination", header: "Destination" }, { key: "subclass", header: "Visa subclass" }, { key: "visaStream", header: "Visa stream" },
        { key: "reference", header: "Lodgement reference" }, { key: "status", header: "Status" }, { key: "outcome", header: "Outcome" },
        { key: "lodged", header: "Lodged", type: "date" }, { key: "decision", header: "Decision", type: "date" },
        { key: "daysToDecision", header: "Days to decision", type: "number" }, { key: "currentExpiry", header: "Current visa expiry", type: "date" },
        { key: "infoDue", header: "Information due", type: "date" }, { key: "infoProvided", header: "Information provided", type: "date" },
        { key: "owner", header: "Case owner" },
      ],
      rows: visas.filter((row) => keptCases.has(str(row.case_id))).map((row) => {
        const parent = caseById.get(str(row.case_id)) ?? {};
        return {
          caseNumber: str(parent.case_number), client: clientName(parent.client_id), office: branch.get(str(parent.branch_id)) ?? "",
          destination: str(row.destination_country), subclass: str(row.visa_subclass), visaStream: str(row.visa_stream),
          reference: str(row.lodgement_reference), status: str(row.status), outcome: str(row.outcome), lodged: dayOf(row.lodged_at),
          decision: dayOf(row.decision_at), daysToDecision: daysBetween(row.lodged_at, row.decision_at), currentExpiry: dayOf(row.current_visa_expiry),
          infoDue: dayOf(row.information_due_at), infoProvided: dayOf(row.information_provided_at), owner: name.get(str(parent.owner_id)) ?? "",
        };
      }),
    });

  if (want("finance") && options.includeFinance)
    sheets.push({
      name: "Finance",
      notes: ["Invoices on the enquiries in range. Outstanding = total - paid."],
      columns: [
        { key: "invoiceNumber", header: "Invoice" }, { key: "client", header: "Client" }, { key: "caseNumber", header: "Case number" },
        { key: "office", header: "Office" }, { key: "type", header: "Type" }, { key: "currency", header: "Currency" },
        { key: "subtotal", header: "Subtotal", type: "money" }, { key: "tax", header: "Tax", type: "money" }, { key: "total", header: "Total", type: "money" },
        { key: "paid", header: "Paid", type: "money" }, { key: "outstanding", header: "Outstanding", type: "money" }, { key: "state", header: "State" },
        { key: "issued", header: "Issued", type: "date" }, { key: "due", header: "Due", type: "date" }, { key: "overdue", header: "Overdue" },
        { key: "raisedBy", header: "Raised by" },
      ],
      rows: invoices.filter((row) => keptCases.has(str(row.case_id))).map((row) => {
        const parent = caseById.get(str(row.case_id)) ?? {};
        const outstanding = ["void", "refunded"].includes(str(row.state)) ? 0 : Math.max(0, money(row.total) - money(row.paid));
        return {
          invoiceNumber: str(row.invoice_number), client: clientName(row.client_id), caseNumber: str(parent.case_number),
          office: branch.get(str(parent.branch_id)) ?? "", type: str(row.invoice_type), currency: str(row.currency),
          subtotal: money(row.subtotal), tax: money(row.tax), total: money(row.total), paid: money(row.paid), outstanding,
          state: str(row.state), issued: dayOf(row.issued_on), due: dayOf(row.due_on),
          overdue: outstanding > 0 && dayOf(row.due_on) && dayOf(row.due_on) < new Date().toISOString().slice(0, 10) ? "Yes" : "No",
          raisedBy: name.get(str(row.created_by)) ?? "",
        };
      }),
    });

  if (want("staff")) {
    const staff = profiles.filter((row) => row.active && !["student", "partner"].includes(str(row.level)));
    const inWindow = (value: unknown) => inRange(value, filters.from, filters.to);
    sheets.push({
      name: "Staff performance",
      notes: [rangeNote, "Enquiries and conversions count the cases each person owns; tasks and notes are their own work in the range."],
      columns: [
        { key: "staff", header: "Staff member" }, { key: "office", header: "Office" }, { key: "level", header: "Level" }, { key: "department", header: "Department" },
        { key: "enquiries", header: "Enquiries received", type: "number" }, { key: "converted", header: "Converted", type: "number" },
        { key: "conversionRate", header: "Conversion %", type: "percent" }, { key: "openCases", header: "Open cases", type: "number" },
        { key: "completed", header: "Completed cases", type: "number" }, { key: "attention", header: "Cases needing attention", type: "number" },
        { key: "tasksOpen", header: "Open tasks", type: "number" }, { key: "tasksOverdue", header: "Overdue tasks", type: "number" },
        { key: "tasksCompleted", header: "Tasks completed in range", type: "number" }, { key: "notes", header: "File notes in range", type: "number" },
        { key: "invoiced", header: "Invoiced in range", type: "money" },
      ],
      rows: staff.map((person) => {
        const id = str(person.id);
        const owned = scopedCases.filter((row) => str(row.owner_id) === id);
        const mine = tasks.filter((row) => str(row.assigned_to) === id);
        const today = new Date().toISOString();
        return {
          staff: str(person.display_name), office: branch.get(str(person.branch_id)) ?? "", level: str(person.level), department: str(person.department),
          enquiries: owned.length, converted: owned.filter((row) => row.lifecycle_stage !== "enquiry").length,
          conversionRate: rate(owned.filter((row) => row.lifecycle_stage !== "enquiry").length, owned.length),
          openCases: owned.filter((row) => row.lifecycle_stage !== "completed").length,
          completed: owned.filter((row) => row.lifecycle_stage === "completed").length,
          attention: owned.filter((row) => row.health !== "healthy" && row.lifecycle_stage !== "completed").length,
          tasksOpen: mine.filter((row) => row.status !== "completed").length,
          tasksOverdue: mine.filter((row) => row.status !== "completed" && dayOf(row.due_at) && dayOf(row.due_at) < today.slice(0, 10)).length,
          tasksCompleted: mine.filter((row) => row.status === "completed" && inWindow(row.completed_at)).length,
          notes: notes.filter((row) => str(row.author_id) === id && inWindow(row.created_at)).length,
          invoiced: money(invoices.filter((row) => str(row.created_by) === id && inWindow(row.issued_on)).reduce((sum, row) => sum + money(row.total), 0)),
        };
      }).filter((row) => row.enquiries || row.tasksOpen || row.tasksCompleted || row.notes || row.invoiced),
    });
  }

  if (want("patterns")) {
    const breakdown = (label: string, key: (row: (typeof leadRows)[number]) => string) =>
      [...group(leadRows, key).entries()].map(([value, rows]) => ({
        breakdown: label, value, enquiries: rows.length, converted: rows.filter((row) => row.converted === "Yes").length,
        conversionRate: rate(rows.filter((row) => row.converted === "Yes").length, rows.length),
        lost: rows.filter((row) => row.lostReason).length,
        averageScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.leadScore, 0) / rows.length) : 0,
        averageDaysToConvert: (() => { const d = rows.map((row) => row.daysToConvert).filter((v): v is number => v != null); return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null; })(),
      })).sort((a, b) => b.enquiries - a.enquiries);
    sheets.push({
      name: "Patterns",
      notes: [rangeNote, "Each block groups the same enquiries a different way, so patterns in source, destination, timing and staff can be compared side by side."],
      columns: [
        { key: "breakdown", header: "Breakdown" }, { key: "value", header: "Value" }, { key: "enquiries", header: "Enquiries", type: "number" },
        { key: "converted", header: "Converted", type: "number" }, { key: "conversionRate", header: "Conversion %", type: "percent" },
        { key: "lost", header: "Lost", type: "number" }, { key: "averageScore", header: "Average lead score", type: "number" },
        { key: "averageDaysToConvert", header: "Average days to convert", type: "number" },
      ],
      rows: [
        ...breakdown("Month", (row) => monthOf(row.enquiryDate)),
        ...breakdown("Lead source", (row) => row.source),
        ...breakdown("Campaign", (row) => row.campaign),
        ...breakdown("Office", (row) => row.office),
        ...breakdown("Service stream", (row) => row.stream),
        ...breakdown("Matter type", (row) => row.matterType),
        ...breakdown("Course / visa target", (row) => row.target),
        ...breakdown("Nationality", (row) => row.nationality),
        ...breakdown("Intake", (row) => row.intake),
        ...breakdown("Lead status", (row) => row.leadStatus),
        ...breakdown("Assigned to", (row) => row.assignedTo),
        ...breakdown("Current stage", (row) => row.currentStage),
        ...breakdown("Lost reason", (row) => row.lostReason).filter((row) => row.value !== "Not recorded"),
      ],
    });
  }

  const filtersApplied: [string, string][] = [];
  if (filters.from || filters.to) filtersApplied.push(["Enquiry date", `${filters.from ?? "any"} to ${filters.to ?? "today"}`]);
  if (filters.branchId) filtersApplied.push(["Office", branch.get(filters.branchId) ?? filters.branchId]);
  if (filters.stream) filtersApplied.push(["Service stream", humanStream(filters.stream)]);
  if (filters.ownerId) filtersApplied.push(["Assigned staff", name.get(filters.ownerId) ?? filters.ownerId]);
  if (filters.stage) filtersApplied.push(["Stage", filters.stage]);
  if (filters.source) filtersApplied.push(["Lead source", filters.source]);
  if (filters.status) filtersApplied.push(["Lead status", filters.status]);
  return { sheets, filtersApplied };
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
