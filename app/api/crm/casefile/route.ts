import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import {
  mask,
  protect,
  ProtectedFieldError,
  reveal,
} from "@/server/protected-fields";

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
      collaborators,
      communications,
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
      get<Json[]>(
        `case_collaborators?select=profile_id,added_at,profiles!case_collaborators_profile_id_fkey(display_name,email)&case_id=eq.${caseId}&order=added_at.asc`,
        token,
      ),
      get<Json[]>(
        `email_messages?select=id,sender,recipients,direction,body_preview,sent_at,created_at,delivery_state,email_threads!inner(case_id,subject)&email_threads.case_id=eq.${caseId}&order=created_at.desc&limit=200`,
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
        // The ciphertext never leaves the server; the masked form is what the
        // interface shows.
        dependants: dependants.map((row) => {
          const visible = { ...row };
          delete visible.passport_number_encrypted;
          return visible;
        }),
        documents,
        notes,
        invoices,
        collaborators: collaborators.map((row) => ({
          profileId: row.profile_id,
          addedAt: row.added_at,
          name: (row.profiles as Json | null)?.display_name ?? "Team member",
          email: (row.profiles as Json | null)?.email ?? "",
        })),
        communications: communications.map((row) => ({
          id: row.id,
          sender: row.sender,
          recipients: row.recipients,
          direction: row.direction,
          body: row.body_preview,
          sentAt: row.sent_at ?? row.created_at,
          status: row.delivery_state,
          subject: (row.email_threads as Json | null)?.subject ?? "Message",
        })),
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

    if (action === "invoice_pdf_prepare") {
      const invoiceId = uuid(body.invoiceId, "Invoice");
      const caseId = uuid(body.caseId, "Case");
      const [invoice] = await get<Json[]>(
        `invoices?select=id,client_id,case_id,invoice_number&id=eq.${invoiceId}&limit=1`,
        token,
      );
      if (!invoice || String(invoice.case_id) !== caseId)
        throw new LiveAccessError(403, "That invoice is not available in this case.");
      const existing = await get<Json[]>(
        `documents?select=id&case_id=eq.${caseId}&metadata->>invoice_id=eq.${invoiceId}&limit=1`,
        token,
      );
      if (existing[0]) return Response.json({ ok: true, documentId: existing[0].id });

      const documentId = crypto.randomUUID();
      const invoiceNumber = String(invoice.invoice_number || "Invoice");
      await insert(
        "documents",
        {
          id: documentId,
          organisation_id: org,
          client_id: invoice.client_id,
          case_id: caseId,
          document_type: "10 Accounts and Receipts",
          display_name: `${invoiceNumber}.pdf`,
          state: "requested",
          requested_by: session.identity.profileId,
          metadata: {
            source: "invoice_pdf",
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            client_visible: false,
          },
        },
        token,
      );
      await audit(session, "invoice.pdf_prepared", "invoice", invoiceId, {
        caseId,
        summary: `Prepared a PDF attachment for ${invoiceNumber}`,
      });
      return Response.json({ ok: true, documentId });
    }

    if (action === "application_create") {
      const id = crypto.randomUUID();
      const status = applicationStatus(body.status);
      // A record can be entered already at a later status -- an application
      // logged after the fact as already Submitted, say -- and the milestone
      // date it implies has to be stamped then, not only when a later update
      // moves it there. Reporting reads these dates, not the status text.
      const now = new Date().toISOString();
      const value = {
        id,
        organisation_id: org,
        case_id: uuid(body.caseId, "Case"),
        institution: required(body.institution, "Institution"),
        course: required(body.course, "Course"),
        campus: optional(body.campus),
        intake: optional(body.intake),
        application_reference: optional(body.reference),
        status,
        deadline_at: optionalDate(body.deadline),
        // Each later status implies the ones before it already happened.
        ...(["submitted", "offer_received", "coe_received"].includes(status)
          ? { submitted_at: now }
          : {}),
        ...(["offer_received", "coe_received"].includes(status)
          ? { offer_received_at: now }
          : {}),
        ...(status === "coe_received" ? { coe_received_at: now } : {}),
        details: {},
      };
      await insert("education_applications", value, token);
      await audit(session, "application.created", "education_application", id, {
        caseId: value.case_id,
        summary: `Added application to ${value.institution} for ${value.course}`,
        after: { institution: value.institution, course: value.course, status: value.status },
      });
    } else if (action === "application_update") {
      const id = uuid(body.id, "Application");
      const before = await one("education_applications", id, token);
      const changes: Json = {};
      if (body.institution !== undefined)
        changes.institution = required(body.institution, "Institution");
      if (body.course !== undefined) changes.course = required(body.course, "Course");
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
      await patch("education_applications", id, changes, token);
      const statusChanged =
        changes.status !== undefined && changes.status !== before?.status;
      await audit(
        session,
        statusChanged ? "application.status_changed" : "application.updated",
        "education_application",
        id,
        {
          caseId: before?.case_id,
          summary: statusChanged
            ? `${before?.institution ?? "Application"} moved from ${before?.status} to ${changes.status}`
            : `Updated the application to ${before?.institution ?? "an institution"}`,
          before: statusChanged ? { status: before?.status } : before ?? undefined,
          after: changes,
        },
      );
    } else if (action === "application_archive") {
      // Migration file records are archived with a reason, never destroyed.
      const id = uuid(body.id, "Application");
      const before = await one("education_applications", id, token);
      const outcome = archiveOutcome(body.outcome);
      await patch(
        "education_applications",
        id,
        {
          status: outcome,
          archived_at: new Date().toISOString(),
          archived_by: session.identity.profileId,
          archive_reason: required(body.reason, "Reason"),
          updated_at: new Date().toISOString(),
        },
        token,
      );
      await audit(session, "application.archived", "education_application", id, {
        caseId: before?.case_id,
        summary: `${before?.institution ?? "Application"} ${outcome.replace(/_/g, " ")}: ${String(body.reason)}`,
        before: { status: before?.status },
        after: { status: outcome, reason: optional(body.reason) },
      });
    } else if (action === "visa_matter_save") {
      const caseId = uuid(body.caseId, "Case");
      const existing = await get<Json[]>(
        `visa_matters?select=*&case_id=eq.${caseId}&limit=1`,
        token,
      );
      const before = existing[0];
      // Only write what the caller actually sent. Building the whole row every
      // time meant a partial save silently cleared the fields it omitted -- a
      // lodgement date or a TRN could disappear without anyone touching it.
      const value: Json = {};
      const setIf = (key: string, field: string, convert: (raw: unknown) => unknown) => {
        if (body[field] !== undefined) value[key] = convert(body[field]);
      };
      setIf("visa_subclass", "subclass", optional);
      setIf("visa_stream", "stream", optional);
      setIf("lodgement_reference", "lodgementReference", optional);
      setIf("trn", "trn", optional);
      setIf("responsible_agent_marn", "marn", optional);
      setIf("bridging_visa", "bridgingVisa", optional);
      setIf("bridging_visa_granted_on", "bridgingVisaGrantedOn", optionalDay);
      setIf("current_visa_expiry", "currentVisaExpiry", optionalDay);
      setIf("health_examination_status", "healthExamination", checkStatus);
      setIf("biometrics_status", "biometrics", checkStatus);
      setIf("police_clearance_status", "policeClearance", checkStatus);
      setIf("skills_assessment_status", "skillsAssessment", checkStatus);
      setIf("information_requested_at", "informationRequestedAt", optionalDate);
      setIf("information_due_at", "informationDueAt", optionalDate);
      setIf("information_provided_at", "informationProvidedAt", optionalDate);
      setIf("lodged_at", "lodgedAt", optionalDate);
      setIf("decision_at", "decisionAt", optionalDate);
      setIf("outcome", "outcome", optional);
      setIf("refusal_reason", "refusalReason", optional);
      if (body.conditions !== undefined)
        value.visa_conditions = stringList(body.conditions);
      if (body.status !== undefined) value.status = optional(body.status) ?? "assessment";
      value.destination_country = required(
        body.destinationCountry,
        "Destination country",
      ).toUpperCase();
      if (!before && value.status === undefined) value.status = "assessment";

      if (before) await patch("visa_matters", String(before.id), value, token);
      else
        await insert(
          "visa_matters",
          { id: crypto.randomUUID(), organisation_id: org, case_id: caseId, ...value },
          token,
        );

      // An outcome or a lodgement is a milestone; record it as its own event so
      // the timeline shows what changed rather than only that something did.
      const outcomeChanged =
        value.outcome !== undefined &&
        (before?.outcome ?? null) !== (value.outcome ?? null);
      const lodgementChanged =
        value.lodged_at !== undefined &&
        (before?.lodged_at ?? null) !== (value.lodged_at ?? null);
      const action_ = outcomeChanged
        ? "visa.outcome_changed"
        : lodgementChanged
          ? "visa.lodged"
          : before
            ? "visa.updated"
            : "visa.created";
      await audit(session, action_, "visa_matter", String(before?.id ?? caseId), {
        caseId,
        summary: outcomeChanged
          ? `Visa outcome set to ${value.outcome ?? "none"}`
          : lodgementChanged
            ? `Visa lodged${value.lodgement_reference ? ` (${String(value.lodgement_reference)})` : ""}`
            : `Updated the visa matter${
                value.visa_subclass ?? before?.visa_subclass
                  ? ` (subclass ${String(value.visa_subclass ?? before?.visa_subclass)})`
                  : ""
              }`,
        before: before
          ? {
              outcome: before.outcome,
              status: before.status,
              lodged_at: before.lodged_at,
              information_due_at: before.information_due_at,
            }
          : undefined,
        after: {
          outcome: value.outcome ?? before?.outcome ?? null,
          status: value.status ?? before?.status ?? null,
          lodged_at: value.lodged_at ?? before?.lodged_at ?? null,
          information_due_at:
            value.information_due_at ?? before?.information_due_at ?? null,
        },
      });
    } else if (action === "dependant_create") {
      const id = crypto.randomUUID();
      const clientId = uuid(body.clientId, "Client");
      const passport = optional(body.passportNumber);
      const value: Json = {
        id,
        organisation_id: org,
        client_id: clientId,
        relationship: relationship(body.relationship),
        full_name: required(body.fullName, "Full name"),
        date_of_birth: optionalDay(body.dateOfBirth),
        nationality: optional(body.nationality),
        passport_expiry: optionalDay(body.passportExpiry),
        included_in_application: body.included === true,
        visa_status: optional(body.visaStatus),
        details: {},
      };
      if (passport) {
        value.passport_number_encrypted = await protect(passport);
        value.passport_masked = mask(passport);
      }
      await insert("dependants", value, token);
      await audit(session, "dependant.added", "dependant", id, {
        caseId: optional(body.caseId) ?? (await caseForClient(clientId, token)),
        summary: `Added ${value.relationship} ${value.full_name} as a dependant`,
        after: { relationship: value.relationship, full_name: value.full_name },
      });
    } else if (action === "dependant_update") {
      const id = uuid(body.id, "Dependant");
      const before = await one("dependants", id, token);
      const changes: Json = {};
      if (body.fullName !== undefined)
        changes.full_name = required(body.fullName, "Full name");
      if (body.relationship !== undefined)
        changes.relationship = relationship(body.relationship);
      if (body.dateOfBirth !== undefined)
        changes.date_of_birth = optionalDay(body.dateOfBirth);
      if (body.nationality !== undefined)
        changes.nationality = optional(body.nationality);
      if (body.passportExpiry !== undefined)
        changes.passport_expiry = optionalDay(body.passportExpiry);
      if (body.visaStatus !== undefined)
        changes.visa_status = optional(body.visaStatus);
      if (typeof body.included === "boolean")
        changes.included_in_application = body.included;
      const passport = optional(body.passportNumber);
      if (passport) {
        changes.passport_number_encrypted = await protect(passport);
        changes.passport_masked = mask(passport);
      }
      await patch("dependants", id, changes, token);
      await audit(session, "dependant.updated", "dependant", id, {
        caseId: await caseForClient(before?.client_id, token),
        summary: `Updated dependant ${before?.full_name ?? ""}`.trim(),
        after: { ...changes, passport_number_encrypted: undefined },
      });
    } else if (action === "dependant_archive") {
      const id = uuid(body.id, "Dependant");
      const before = await one("dependants", id, token);
      await patch(
        "dependants",
        id,
        {
          archived_at: new Date().toISOString(),
          archived_by: session.identity.profileId,
          archive_reason: required(body.reason, "Reason"),
        },
        token,
      );
      await audit(session, "dependant.archived", "dependant", id, {
        caseId: await caseForClient(before?.client_id, token),
        summary: `Removed dependant ${before?.full_name ?? ""}: ${String(body.reason)}`.trim(),
        before: { full_name: before?.full_name, relationship: before?.relationship },
        after: { reason: optional(body.reason) },
      });
    } else if (action === "reveal_passport") {
      // The real number is needed to lodge. Releasing it is a management action
      // and is recorded against the person who asked for it.
      if (
        session.identity.role !== "super_admin" &&
        session.identity.role !== "admin"
      )
        throw new LiveAccessError(
          403,
          "Only a manager or administrator can reveal a passport number.",
        );
      const table = body.subject === "client" ? "clients" : "dependants";
      const id = uuid(body.id, "Record");
      const record = await one(table, id, token);
      if (!record?.passport_number_encrypted)
        throw new InputError("No passport number is stored for that record.");
      const number = await reveal(String(record.passport_number_encrypted));
      await audit(session, "passport.revealed", table.slice(0, -1), id, {
        caseId: await caseForClient(
          table === "clients" ? id : record.client_id,
          token,
        ),
        summary: `Revealed the passport number for ${record.full_name ?? `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim()}`,
      });
      return appendRefreshCookies(
        Response.json({ ok: true, passportNumber: number }),
        session.refreshed,
        request,
      );
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

/**
 * A dependant and a passport belong to a client, but the file they appear on is
 * the case. Resolve it so those events land on the case timeline rather than
 * being recorded with no case and disappearing from the history.
 */
async function caseForClient(
  clientId: unknown,
  token: string,
): Promise<string | null> {
  if (typeof clientId !== "string" || !clientId) return null;
  const rows = await get<Json[]>(
    `cases?select=id&client_id=eq.${clientId}&order=opened_at.desc&limit=1`,
    token,
  );
  return rows[0] ? String(rows[0].id) : null;
}

/** Reads one row by id, for recording what a change replaced. */
async function one(table: string, id: string, token: string): Promise<Json | null> {
  const rows = await get<Json[]>(`${table}?select=*&id=eq.${id}&limit=1`, token);
  return rows[0] ?? null;
}

type LiveSession = Awaited<ReturnType<typeof liveSession>>;

/**
 * Writes the case-file change to the audit trail, which is what the case
 * timeline reads. Without this a visa outcome or an archived application would
 * change with nothing in the file to show it.
 */
async function audit(
  session: LiveSession,
  action: string,
  resourceType: string,
  resourceId: string,
  detail: {
    caseId?: unknown;
    summary: string;
    before?: Json;
    after?: Json;
  },
): Promise<void> {
  const caseId = typeof detail.caseId === "string" ? detail.caseId : null;
  try {
    await insert(
      "audit_events",
      {
        organisation_id: session.identity.organisationId,
        actor_id: session.identity.profileId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        case_id: caseId,
        summary: detail.summary,
        before_data: detail.before ?? null,
        after_data: detail.after ?? null,
      },
      session.accessToken,
    );
  } catch (error) {
    // The change itself succeeded; losing its audit row must not undo it, but
    // it must not vanish either.
    console.error(`Could not record ${action} in the audit trail`, error);
  }
}

const ARCHIVE_OUTCOMES = ["withdrawn", "rejected", "deferred", "removed_in_error"];
function archiveOutcome(value: unknown): string {
  const parsed = (optional(value) ?? "withdrawn").toLowerCase().replace(/\s+/g, "_");
  if (!ARCHIVE_OUTCOMES.includes(parsed))
    throw new InputError(
      "Say whether this was withdrawn, rejected, deferred or removed in error.",
    );
  return parsed;
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
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof ProtectedFieldError)
    return Response.json({ ok: false, error: error.message }, { status: 503 });
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
