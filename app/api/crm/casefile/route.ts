import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * Everything held about one case, in one request: the client and their intake,
 * every education application, the visa matter, the family, documents, notes
 * and a single chronological timeline. The Code of Conduct expects a
 * contemporaneous record of advice and instructions, so the timeline merges
 * notes, stage changes and audited actions rather than showing them apart.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const token = session.accessToken;
    const caseId = uuid(
      new URL(request.url).searchParams.get("caseId"),
      "Case",
    );

    const [caseRows] = await Promise.all([
      get<Json[]>(`cases?select=*&id=eq.${caseId}&limit=1`, token),
    ]);
    const record = caseRows[0];
    if (!record) throw new LiveAccessError(403, "This case is not available.");
    const clientId = String(record.client_id);

    const [
      clients,
      applications,
      visaMatters,
      dependants,
      documents,
      notes,
      lifecycle,
      audit,
      invoices,
      education,
      employment,
      tests,
      preferences,
      visaHistory,
      declarations,
    ] = await Promise.all([
      get<Json[]>(`clients?select=*&id=eq.${clientId}&limit=1`, token),
      get<Json[]>(
        `education_applications?select=*&case_id=eq.${caseId}&order=created_at.desc&limit=100`,
        token,
      ),
      get<Json[]>(`visa_matters?select=*&case_id=eq.${caseId}&limit=1`, token),
      get<Json[]>(
        `dependants?select=*&client_id=eq.${clientId}&order=relationship.asc,full_name.asc`,
        token,
      ),
      get<Json[]>(
        `documents?select=*&case_id=eq.${caseId}&order=created_at.desc`,
        token,
      ),
      get<Json[]>(
        `case_notes?select=*&case_id=eq.${caseId}&order=created_at.desc&limit=200`,
        token,
      ),
      get<Json[]>(
        `case_lifecycle_events?select=*&case_id=eq.${caseId}&order=occurred_at.desc&limit=200`,
        token,
      ),
      get<Json[]>(
        `audit_events?select=*&case_id=eq.${caseId}&order=occurred_at.desc&limit=200`,
        token,
      ),
      get<Json[]>(
        `invoices?select=*&case_id=eq.${caseId}&order=issued_on.desc`,
        token,
      ),
      get<Json[]>(
        `client_education_history?select=*&client_id=eq.${clientId}&order=started_on.desc`,
        token,
      ),
      get<Json[]>(
        `client_employment_history?select=*&client_id=eq.${clientId}&order=started_on.desc`,
        token,
      ),
      get<Json[]>(
        `english_tests?select=*&client_id=eq.${clientId}&order=test_date.desc`,
        token,
      ),
      get<Json[]>(
        `study_preferences?select=*&client_id=eq.${clientId}&limit=1`,
        token,
      ),
      get<Json[]>(
        `visa_history?select=*&client_id=eq.${clientId}&order=applied_on.desc`,
        token,
      ),
      get<Json[]>(
        `client_declarations?select=*&client_id=eq.${clientId}&order=declaration_type.asc`,
        token,
      ),
    ]);

    return appendRefreshCookies(
      Response.json({
        ok: true,
        case: record,
        client: clients[0] ?? null,
        applications,
        visaMatter: visaMatters[0] ?? null,
        dependants,
        documents,
        notes,
        invoices,
        intake: {
          education,
          employment,
          tests,
          preferences: preferences[0] ?? null,
          visaHistory,
          declarations,
        },
        timeline: buildTimeline(notes, lifecycle, audit),
      }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "This is available to staff only.");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");

    if (action === "application_create") {
      await insert(
        "education_applications",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          case_id: uuid(body.caseId, "Case"),
          institution: required(body.institution, "Institution"),
          course: required(body.course, "Course"),
          campus: optional(body.campus),
          intake: optional(body.intake),
          application_reference: optional(body.reference),
          status: applicationStatus(body.status),
          deadline_at: optionalDate(body.deadline),
          details: {},
        },
        token,
      );
    } else if (action === "application_update") {
      const changes: Json = {};
      if (body.institution !== undefined)
        changes.institution = required(body.institution, "Institution");
      if (body.course !== undefined)
        changes.course = required(body.course, "Course");
      if (body.campus !== undefined) changes.campus = optional(body.campus);
      if (body.intake !== undefined) changes.intake = optional(body.intake);
      if (body.reference !== undefined)
        changes.application_reference = optional(body.reference);
      if (body.status !== undefined) {
        changes.status = applicationStatus(body.status);
        // Stamp the milestone the status implies, so the timeline is accurate
        // without asking the user to enter the date twice.
        const now = new Date().toISOString();
        if (changes.status === "submitted") changes.submitted_at = now;
        if (changes.status === "offer_received") changes.offer_received_at = now;
        if (changes.status === "coe_received") changes.coe_received_at = now;
      }
      if (body.deadline !== undefined)
        changes.deadline_at = optionalDate(body.deadline);
      changes.updated_at = new Date().toISOString();
      await patch(
        "education_applications",
        uuid(body.id, "Application"),
        changes,
        token,
      );
    } else if (action === "application_delete") {
      await remove("education_applications", uuid(body.id, "Application"), token);
    } else if (action === "visa_matter_save") {
      const caseId = uuid(body.caseId, "Case");
      const existing = await get<Json[]>(
        `visa_matters?select=id&case_id=eq.${caseId}&limit=1`,
        token,
      );
      const value: Json = {
        destination_country: required(
          body.destinationCountry,
          "Destination country",
        ).toUpperCase(),
        visa_subclass: optional(body.subclass),
        visa_stream: optional(body.stream),
        lodgement_reference: optional(body.lodgementReference),
        trn: optional(body.trn),
        status: optional(body.status) || "assessment",
        responsible_agent_marn: optional(body.marn),
        bridging_visa: optional(body.bridgingVisa),
        bridging_visa_granted_on: optionalDay(body.bridgingVisaGrantedOn),
        current_visa_expiry: optionalDay(body.currentVisaExpiry),
        health_examination_status: checkStatus(body.healthExamination),
        biometrics_status: checkStatus(body.biometrics),
        police_clearance_status: checkStatus(body.policeClearance),
        skills_assessment_status: checkStatus(body.skillsAssessment),
        information_requested_at: optionalDate(body.informationRequestedAt),
        information_due_at: optionalDate(body.informationDueAt),
        information_provided_at: optionalDate(body.informationProvidedAt),
        lodged_at: optionalDate(body.lodgedAt),
        decision_at: optionalDate(body.decisionAt),
        outcome: optional(body.outcome),
        refusal_reason: optional(body.refusalReason),
        visa_conditions: stringList(body.conditions),
      };
      if (existing[0])
        await patch("visa_matters", String(existing[0].id), value, token);
      else
        await insert(
          "visa_matters",
          { id: crypto.randomUUID(), organisation_id: org, case_id: caseId, ...value },
          token,
        );
    } else if (action === "dependant_create") {
      await insert(
        "dependants",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          client_id: uuid(body.clientId, "Client"),
          relationship: relationship(body.relationship),
          full_name: required(body.fullName, "Full name"),
          date_of_birth: optionalDay(body.dateOfBirth),
          details: {
            passport_number: optional(body.passportNumber),
            passport_expiry: optionalDay(body.passportExpiry),
            nationality: optional(body.nationality),
            included_in_application: body.included === true,
            visa_status: optional(body.visaStatus),
          },
        },
        token,
      );
    } else if (action === "dependant_update") {
      const changes: Json = {};
      if (body.fullName !== undefined)
        changes.full_name = required(body.fullName, "Full name");
      if (body.relationship !== undefined)
        changes.relationship = relationship(body.relationship);
      if (body.dateOfBirth !== undefined)
        changes.date_of_birth = optionalDay(body.dateOfBirth);
      if (isObject(body.details)) changes.details = body.details;
      await patch("dependants", uuid(body.id, "Dependant"), changes, token);
    } else if (action === "dependant_delete") {
      await remove("dependants", uuid(body.id, "Dependant"), token);
    } else {
      throw new InputError("Unsupported case file action.");
    }

    return appendRefreshCookies(
      Response.json({ ok: true }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

type TimelineEntry = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  actorId: string | null;
};

function buildTimeline(
  notes: Json[],
  lifecycle: Json[],
  audit: Json[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...notes.map((row) => ({
      id: `note-${row.id}`,
      at: String(row.created_at ?? ""),
      kind: row.visibility === "private" ? "private_note" : "note",
      title: "Note",
      detail: typeof row.body === "string" ? row.body : null,
      actorId: (row.author_id as string) ?? null,
    })),
    ...lifecycle.map((row) => ({
      id: `stage-${row.id}`,
      at: String(row.occurred_at ?? ""),
      kind: "stage",
      title: `${row.from_stage ?? "new"} → ${row.to_stage}`,
      detail: (row.reason as string) ?? null,
      actorId: (row.changed_by as string) ?? null,
    })),
    ...audit.map((row) => ({
      id: `audit-${row.id}`,
      at: String(row.occurred_at ?? ""),
      kind: String(row.action ?? "action"),
      title: String(row.summary ?? row.action ?? "Action"),
      detail: null,
      actorId: (row.actor_id as string) ?? null,
    })),
  ];
  return entries
    .filter((entry) => entry.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 300);
}

async function get<T>(query: string, token: string): Promise<T> {
  return supabaseRequest<T>(`/rest/v1/${query}`, { method: "GET" }, token);
}
async function insert(table: string, value: Json, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}`,
    {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    },
    token,
  );
}
async function patch(table: string, id: string, value: Json, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    },
    token,
  );
}
async function remove(table: string, id: string, token: string) {
  await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" }, token);
}

const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "offer_received",
  "offer_accepted",
  "coe_received",
  "deferred",
  "withdrawn",
  "rejected",
];
function applicationStatus(value: unknown): string {
  const parsed = (optional(value) ?? "draft").toLowerCase().replace(/\s+/g, "_");
  if (!APPLICATION_STATUSES.includes(parsed))
    throw new InputError("That application status is not recognised.");
  return parsed;
}
const CHECK_STATUSES = ["not_started", "requested", "in_progress", "completed", "not_required"];
function checkStatus(value: unknown): string {
  const parsed = (optional(value) ?? "not_started").toLowerCase().replace(/\s+/g, "_");
  if (!CHECK_STATUSES.includes(parsed))
    throw new InputError("That check status is not recognised.");
  return parsed;
}
const RELATIONSHIPS = ["spouse", "partner", "child", "parent", "sibling", "other"];
function relationship(value: unknown): string {
  const parsed = required(value, "Relationship").toLowerCase();
  if (!RELATIONSHIPS.includes(parsed))
    throw new InputError("That relationship is not recognised.");
  return parsed;
}
function optional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function required(value: unknown, label: string) {
  const parsed = optional(value);
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
function uuid(value: unknown, label: string) {
  const parsed = required(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      parsed,
    )
  )
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
function optionalDay(value: unknown) {
  const parsed = optional(value);
  if (!parsed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(Date.parse(parsed)))
    throw new InputError("That date is invalid.");
  return parsed;
}
function optionalDate(value: unknown) {
  const parsed = optional(value);
  if (!parsed) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? `${parsed}T00:00:00Z` : parsed;
  if (Number.isNaN(Date.parse(day))) throw new InputError("That date is invalid.");
  return new Date(day).toISOString();
}
function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optional).filter((item): item is string => Boolean(item)).slice(0, 40)
    : [];
}
function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) {
    console.error(error.message);
    return Response.json(
      { ok: false, error: "The database rejected this case file action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  }
  console.error(error);
  return Response.json(
    { ok: false, error: "The case file could not be loaded." },
    { status: 500 },
  );
}
