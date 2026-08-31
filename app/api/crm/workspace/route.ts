import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import {
  serviceRoleKey,
  SupabaseError,
  supabaseAdminRequest,
  supabaseRequest,
} from "@/server/supabase";
import { driveConfigured } from "@/server/google-drive";
import { protectionConfigured, protect, reveal } from "@/server/protected-fields";
import { calendarRefreshAccessToken, createCalendarEvent, deleteCalendarEvent } from "@/server/google-calendar";
import { orgDate, orgTime } from "@/lib/timezone";
import { emailConfigured, renderTemplate, sendEmail } from "@/server/email";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

// The pipeline an agency works: an enquiry becomes a student, a student gets
// applications, an application leads to a visa, and an approved visa completes
// the case. A case can be deferred from any stage it is being worked at and
// resumes into whichever stage the work restarts at; a completed case reopens
// the same way.
const LIFECYCLE_STAGES = [
  "enquiry",
  "student",
  "application",
  "visa",
  "deferred",
  "completed",
] as const;
type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
const WORKING_STAGES = LIFECYCLE_STAGES.filter(
  (stage) => stage !== "completed" && stage !== "deferred",
);

// Mirrors the rules enforced by public.move_case_lifecycle so the interface can
// only offer transitions the database will accept. The database remains the
// authority; this exists to keep the buttons honest.
export function allowedLifecycleMoves(from: LifecycleStage): LifecycleStage[] {
  if (from === "completed" || from === "deferred") return [...WORKING_STAGES];
  const moves: LifecycleStage[] = WORKING_STAGES.filter((stage) => stage !== from);
  moves.push("deferred");
  if (from === "visa") moves.push("completed");
  return moves;
}

// Raised well past what a single agency realistically holds, but a limit is
// still a limit: RECORD_LIMIT rows fetched exactly at the cap means there may
// be more the interface never asked for, so that is reported rather than
// silently dropped. Real pagination -- fetching further pages on request --
// is a larger, separate change to how every screen loads its data; this is
// the honest stopgap for it.
const RECORD_LIMIT = 800;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const token = session.accessToken;
    // Datasets are read independently so one unavailable table cannot fail the
    // whole load; the names of any that failed are reported to the client.
    const degraded: string[] = [];
    const lifecycleEnabled = await lifecycleReady(token);
    const [
      clients,
      cases,
      stages,
      tasks,
      appointments,
      documents,
      threads,
      messages,
      invoices,
      commissionClaims,
      creditNotes,
      stageHistory,
      declarations,
      templates,
      workflowTemplates,
      audit,
      branches,
      profiles,
      roles,
      applications,
      visaMatters,
      visaHistory,
      collaborators,
    ] = await Promise.all([
      safeRest(
        `clients?select=*&archived_at=is.null&order=updated_at.desc&limit=${RECORD_LIMIT}`,
        token,
        degraded,
      ),
      safeRest(`cases?select=*&order=opened_at.desc&limit=${RECORD_LIMIT}`, token, degraded),
      safeRest("workflow_stages?select=*&order=position.asc", token, degraded),
      safeRest(`tasks?select=*&order=created_at.desc&limit=${RECORD_LIMIT}`, token, degraded),
      safeRest(
        `appointments?select=*&order=starts_at.asc&limit=${RECORD_LIMIT}`,
        token,
        degraded,
      ),
      safeRest(`documents?select=*&order=created_at.desc&limit=${RECORD_LIMIT}`, token, degraded),
      safeRest(
        `email_threads?select=*&order=last_message_at.desc&limit=${RECORD_LIMIT}`,
        token,
        degraded,
      ),
      safeRest(
        `email_messages?select=*&order=sent_at.desc.nullslast&limit=${RECORD_LIMIT}`,
        token,
        degraded,
      ),
      safeRest(`invoices?select=*&order=issued_on.desc&limit=${RECORD_LIMIT}`, token, degraded),
      safeRest(
        `commission_claims?select=*&order=due_on.asc.nullslast&limit=${RECORD_LIMIT}`,
        token,
        degraded,
      ),
      safeRest("credit_notes?select=*&order=issued_at.desc&limit=2000", token, degraded),
      // The journey a client's case has actually taken, for the portal's
      // milestone timeline -- not just where it is now, but how it got there.
      safeRest(
        "case_stage_history?select=case_id,from_stage_id,to_stage_id,entered_at,reason&order=entered_at.asc&limit=5000",
        token,
        degraded,
      ),
      safeRest(
        "client_declarations?select=id,client_id,declaration_type,response,declared_at&limit=2000",
        token,
        degraded,
      ),
      safeRest(
        "content_templates?select=*&order=updated_at.desc&limit=200",
        token,
        degraded,
      ),
      safeRest(
        "workflow_templates?select=*&order=created_at.desc&limit=100",
        token,
        degraded,
      ),
      safeRest(
        "audit_events?select=*&order=occurred_at.desc&limit=100",
        token,
        degraded,
      ),
      safeRest(
        "branches?select=id,name,code,country_code&active=eq.true&order=name.asc",
        token,
        degraded,
      ),
      safeRest(
        "profiles?select=id,display_name,email,branch_id,level,active&active=eq.true&order=display_name.asc",
        token,
        degraded,
      ),
      safeRest(
        "roles?select=id,name,data_scope,system_role&system_role=eq.false&order=name.asc",
        token,
        degraded,
      ),
      safeRest(
        "education_applications?select=*&order=created_at.desc&limit=2000",
        token,
        degraded,
      ),
      safeRest(
        "visa_matters?select=*&order=lodged_at.desc.nullslast&limit=2000",
        token,
        degraded,
      ),
      // The visa the client holds now, which is not the one being applied for.
      safeRest(
        "visa_history?select=client_id,visa_type,status,expires_on,granted_on&order=granted_on.desc.nullslast&limit=2000",
        token,
        degraded,
      ),
      safeRest(
        "case_collaborators?select=case_id,profile_id&limit=5000",
        token,
        degraded,
      ),
    ]);

    // A dataset fetched exactly up to its cap may have more rows the
    // interface never saw -- flagged rather than silently short.
    const truncated = (
      [
        ["clients", clients],
        ["cases", cases],
        ["tasks", tasks],
        ["appointments", appointments],
        ["documents", documents],
        ["invoices", invoices],
      ] as const
    )
      .filter(([, rows]) => rows.length === RECORD_LIMIT)
      .map(([name]) => name);

    // A deferral is an application moved to a later intake, not a phrase typed
    // into a status box. Count them per case so the interface can stop matching
    // the word "defer" against free text.
    const deferredByCase = new Map<string, number>();
    for (const row of applications) {
      if (row.archived_at || row.status !== "deferred") continue;
      const key = String(row.case_id);
      deferredByCase.set(key, (deferredByCase.get(key) ?? 0) + 1);
    }

    const clientById = new Map(clients.map((row) => [String(row.id), row]));
    const caseById = new Map(cases.map((row) => [String(row.id), row]));
    // Ordered newest first above, so the first entry seen for a client is the
    // most recently granted visa they hold.
    const heldVisaByClient = new Map<string, Json>();
    for (const row of visaHistory) {
      const key = String(row.client_id);
      if (!heldVisaByClient.has(key)) heldVisaByClient.set(key, row);
    }
    const stageById = new Map(stages.map((row) => [String(row.id), row]));
    const creditedByInvoice = new Map<string, number>();
    for (const row of creditNotes) {
      const key = String(row.invoice_id);
      creditedByInvoice.set(key, (creditedByInvoice.get(key) ?? 0) + Number(row.amount ?? 0));
    }
    const invoicePdfByInvoice = new Map<string, Json>();
    for (const row of documents) {
      const metadata = (row.metadata as Json | null) ?? {};
      if (metadata.source !== "invoice_pdf" || !metadata.invoice_id) continue;
      invoicePdfByInvoice.set(String(metadata.invoice_id), row);
    }
    const branchById = new Map(branches.map((row) => [String(row.id), row]));
    const profileById = new Map(profiles.map((row) => [String(row.id), row]));
    const threadById = new Map(threads.map((row) => [String(row.id), row]));
    const collaboratorsByCase = new Map<string, string[]>();
    for (const row of collaborators) {
      const key = String(row.case_id);
      collaboratorsByCase.set(key, [...(collaboratorsByCase.get(key) ?? []), String(row.profile_id)]);
    }
    const workflowStages = new Map<string, Json[]>();
    for (const stage of stages) {
      const key = String(stage.template_id);
      workflowStages.set(key, [...(workflowStages.get(key) ?? []), stage]);
    }

    const payload = {
      identity: session.identity,
      degraded,
      truncated,
      capabilities: {
        lifecycle: lifecycleEnabled,
        documentStorage: driveConfigured(),
        protectedFields: protectionConfigured(),
      },
      schemaWarning: lifecycleEnabled ? null : LIFECYCLE_MIGRATION_HINT,
      branches,
      profiles,
      roles: roles.map((row) => ({
        id: row.id,
        name: row.name,
        scope: row.data_scope,
      })),
      cases: cases.map((row) => {
        const client = clientById.get(String(row.client_id)) ?? {};
        const stage = stageById.get(String(row.current_stage_id)) ?? {};
        const owner = profileById.get(String(row.owner_id)) ?? {};
        const branch = branchById.get(String(row.branch_id)) ?? {};
        const name = [client.first_name, client.last_name]
          .filter(Boolean)
          .join(" ");
        return {
          dbId: row.id,
          clientId: row.client_id,
          id: row.case_number,
          name,
          email: client.email ?? "",
          phone: client.mobile ?? "",
          // The stream the case is worked in, and the matter itself. Before
          // these were separated the interface showed "direct_visa" where the
          // user had chosen "Partner 820/801".
          serviceType: row.service_type,
          matterType:
            row.matter_type ??
            (row.custom_fields as Json | undefined)?.intake_type ??
            "",
          type: row.matter_type || row.service_type,
          target: row.target ?? "",
          stage: stage.name ?? client.current_lifecycle ?? "Enquiry",
          owner: owner.display_name ?? "",
          ownerId: row.owner_id ?? "",
          collaboratorIds: collaboratorsByCase.get(String(row.id)) ?? [],
          branch: branch.name ?? "",
          branchId: row.branch_id,
          due: dateOnly(row.due_at),
          health: row.health === "closed" ? "healthy" : row.health,
          progress: Number(row.progress ?? 0),
          lifecycleStage: (row.lifecycle_stage as LifecycleStage) ?? "enquiry",
          visaExpiry: plainDate(row.visa_expiry_on),
          status:
            row.lifecycle_stage === "completed" || row.closed_at
              ? "completed"
              : row.health === "attention"
                ? "waiting"
                : "active",
          deferredApplications: deferredByCase.get(String(row.id)) ?? 0,
          completedAt: dateOnly(row.completed_at),
          reopenedAt: dateOnly(row.reopened_at),
          createdAt: row.opened_at,
        };
      }),
      tasks: tasks.map((row) => ({
        id: row.id,
        title: row.title,
        caseId: row.case_id ?? "",
        due: dateOnly(row.due_at),
        priority: row.priority ?? "medium",
        completed: row.status === "completed",
      })),
      appointments: appointments.map((row) => ({
        id: row.id,
        title: row.title,
        client:
          clientById.get(
            String((cases.find((c) => c.id === row.case_id) ?? {}).client_id),
          )?.first_name ?? "",
        date: dateOnly(row.starts_at),
        time: timeOnly(row.starts_at),
        type: row.appointment_type,
      })),
      documents: documents.map((row) => ({
        id: row.id,
        title: row.display_name,
        client: fullClientName(clientById.get(String(row.client_id))),
        folder: row.document_type,
        fileName: row.drive_file_id ? "Google Drive file" : "Awaiting upload",
        status: row.state,
        createdAt: row.created_at,
        caseId: row.case_id ?? "",
        checklistKey: (row.metadata as Json | null)?.checklist_key ?? "",
        note: (row.metadata as Json | null)?.note ?? "",
        due: (row.metadata as Json | null)?.due_on ?? "",
        clientVisible: (row.metadata as Json | null)?.client_visible !== false,
      })),
      messages: messages.map((row) => {
        const thread = threadById.get(String(row.thread_id)) ?? {};
        return {
          id: row.id,
          to: Array.isArray(row.recipients) ? row.recipients.join(", ") : "",
          subject: thread.subject ?? "Message",
          body: row.body_preview ?? "",
          caseId: thread.case_id ?? "",
          status: row.delivery_state ?? "Draft",
          // A draft has no sent date. Both are carried so the interface can say
          // which it is instead of rendering an unparseable date.
          createdAt: row.created_at ?? null,
          sentAt: row.sent_at ?? null,
        };
      }),
      invoices: invoices.map((row) => {
        const total = Number(row.total ?? 0);
        const paid = Number(row.paid ?? 0);
        const credited = creditedByInvoice.get(String(row.id)) ?? 0;
        return {
          id: row.id,
          invoiceNumber: String(row.invoice_number ?? ""),
          client: fullClientName(clientById.get(String(row.client_id))),
          currency: String(row.currency ?? "AUD"),
          subtotal: Number(row.subtotal ?? 0),
          tax: Number(row.tax ?? 0),
          amount: total,
          paid,
          credited,
          balance: Math.max(0, total - paid - credited),
          // The portal shows only what the client is billed. Anything else --
          // a commission claim raised against a partner, for instance -- is
          // never a client's business and is filtered out on the way to them.
          type: String(row.invoice_type ?? "professional_fee"),
          issued: String(row.issued_on ?? ""),
          due: String(row.due_on ?? ""),
          status:
            row.state === "paid"
              ? "Paid"
              : row.state === "refunded"
                ? "Refunded"
                : row.state === "void"
                  ? "Void"
                  : "Unpaid",
          pdfDocumentId: invoicePdfByInvoice.get(String(row.id))?.drive_file_id
            ? String(invoicePdfByInvoice.get(String(row.id))?.id ?? "")
            : "",
        };
      }),
      // Management-only, same read scope as commission claims -- comes back
      // empty rather than forbidden for anyone else.
      creditNotes: creditNotes.map((row) => ({
        id: row.id,
        invoiceId: String(row.invoice_id),
        amount: Number(row.amount ?? 0),
        reason: row.reason ?? "",
        issuedAt: row.issued_at,
      })),
      // The journey a client's case has actually taken. can_access_client
      // already scopes this to a client's own case for the portal, and to
      // whatever staff can see for everyone else.
      journeyHistory: stageHistory.map((row) => ({
        caseId: String(row.case_id),
        fromStage: row.from_stage_id
          ? String(stageById.get(String(row.from_stage_id))?.name ?? "")
          : "",
        toStage: String(stageById.get(String(row.to_stage_id))?.name ?? ""),
        at: row.entered_at,
        reason: row.reason ?? "",
      })),
      declarations: declarations.map((row) => ({
        id: row.id,
        clientId: String(row.client_id),
        type: String(row.declaration_type),
        response: row.response === null ? null : Boolean(row.response),
        declaredAt: row.declared_at ?? null,
      })),
      // Row-level security already limits this to manager level and above --
      // the same read scope commission_claims_internal has always had -- so
      // it comes back empty rather than forbidden for anyone else.
      commissionClaims: commissionClaims.map((row) => ({
        id: row.id,
        partnerName: String(row.partner_name ?? ""),
        institution: String(row.institution ?? ""),
        currency: String(row.currency ?? "AUD"),
        expectedAmount: Number(row.expected_amount ?? 0),
        receivedAmount: Number(row.received_amount ?? 0),
        status: String(row.status ?? "expected"),
        dueOn: row.due_on ? String(row.due_on) : "",
      })),
      templates: templates.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.template_type,
        content: row.body,
        updatedAt: row.updated_at,
      })),
      workflows: workflowTemplates.map((row) => ({
        id: row.id,
        name: row.name,
        stages: (workflowStages.get(String(row.id)) ?? []).map((stage) =>
          String(stage.name),
        ),
        active: Boolean(row.active),
      })),
      audits: audit.map((row) => ({
        id: String(row.id),
        text: row.summary || `${row.action} · ${row.resource_type}`,
        at: row.occurred_at,
      })),
      // One student can hold several offers at once, so the Applications screen
      // lists the applications themselves rather than the cases holding them.
      applications: applications.map((row) => {
        const parent = caseById.get(String(row.case_id)) ?? {};
        const client = clientById.get(String(parent.client_id)) ?? {};
        return {
          id: String(row.id),
          caseId: String(row.case_id),
          caseNumber: parent.case_number ?? "",
          client: fullClientName(client),
          institution: row.institution ?? "",
          course: row.course ?? "",
          campus: row.campus ?? "",
          intake: row.intake ?? "",
          reference: row.application_reference ?? "",
          status: row.status ?? "draft",
          submittedOn: dateOnly(row.submitted_at),
          offerOn: dateOnly(row.offer_received_at),
          coeOn: dateOnly(row.coe_received_at),
          deadlineOn: dateOnly(row.deadline_at),
          owner: profileById.get(String(parent.owner_id))?.display_name ?? "",
          branch: branchById.get(String(parent.branch_id))?.name ?? "",
          archived: Boolean(row.archived_at),
        };
      }),
      // The visa screen is worked from the matter, not from the case row: the
      // subclass, the reference the department knows it by, and the dates a
      // missed deadline is measured against.
      visaMatters: visaMatters.map((row) => {
        const parent = caseById.get(String(row.case_id)) ?? {};
        const client = clientById.get(String(parent.client_id)) ?? {};
        return {
          id: String(row.id),
          caseId: String(row.case_id),
          caseNumber: parent.case_number ?? "",
          client: fullClientName(client),
          matterType: parent.matter_type ?? "",
          currentVisa: String(
            heldVisaByClient.get(String(parent.client_id))?.visa_type ?? "",
          ),
          subclass: row.visa_subclass ?? "",
          stream: row.visa_stream ?? "",
          destination: row.destination_country ?? "",
          currentVisaExpiry: plainDate(row.current_visa_expiry),
          bridgingVisa: row.bridging_visa ?? "",
          lodgedOn: dateOnly(row.lodged_at),
          trn: row.trn ?? "",
          reference: row.lodgement_reference ?? "",
          agent: profileById.get(String(row.agent_id))?.display_name ?? "",
          marn: row.responsible_agent_marn ?? "",
          status: row.status ?? "assessment",
          informationDueOn: dateOnly(row.information_due_at),
          informationProvidedOn: dateOnly(row.information_provided_at),
          decisionOn: dateOnly(row.decision_at),
          outcome: row.outcome ?? "",
          owner: profileById.get(String(parent.owner_id))?.display_name ?? "",
        };
      }),
    };
    return appendRefreshCookies(
      Response.json({ ok: true, ...payload }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

// The schema lives in Supabase and is migrated separately from this code, so a
// deployment can be ahead of the database. Rather than failing with PostgREST
// internals ("Could not find the function ... in the schema cache"), detect
// whether the case-lifecycle migration has been applied and say so plainly.
//
// Only a positive result is remembered: once the migration is applied the
// answer cannot go back to false, and while it is missing every request
// re-checks, so the CRM starts working the moment the migration is run.
let lifecycleMigrationApplied = false;
export const LIFECYCLE_MIGRATION_HINT =
  "This CRM needs a database update. Apply supabase/migrations/0008_case_lifecycle.sql to your Supabase project, then reload.";

async function lifecycleReady(token: string): Promise<boolean> {
  if (lifecycleMigrationApplied) return true;
  try {
    await rest<Json[]>("cases?select=lifecycle_stage&limit=1", token);
    lifecycleMigrationApplied = true;
  } catch {
    lifecycleMigrationApplied = false;
  }
  return lifecycleMigrationApplied;
}

async function safeRest(
  path: string,
  token: string,
  degraded?: string[],
): Promise<Json[]> {
  try {
    return await rest<Json[]>(path, token);
  } catch (error) {
    const dataset = path.split("?")[0];
    console.error(`Workspace dataset unavailable: ${dataset}`, error);
    degraded?.push(dataset);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const actor = session.identity.profileId;
    // A portal account may write only through the few actions built for it.
    const PORTAL_ACTIONS = [
      "message",
      "appointment_request",
      "update_own_contact",
      "acknowledge_consent",
      "confirm_document",
      "confirm_invoice",
    ];
    if (
      session.identity.role === "client" &&
      !PORTAL_ACTIONS.includes(action)
    )
      throw new LiveAccessError(
        403,
        "This action is not available in the client portal.",
      );

    if (action === "update_own_contact") {
      try {
        await supabaseRequest(
          "/rest/v1/rpc/update_own_contact_details",
          {
            method: "POST",
            body: JSON.stringify({
              p_email: nullable(body.email),
              p_mobile: nullable(body.mobile),
              p_preferred_name: nullable(body.preferredName),
            }),
          },
          token,
        );
      } catch (error) {
        throw databaseError(error, "Your details could not be updated.");
      }
      return Response.json({ ok: true });
    }

    if (action === "acknowledge_consent") {
      try {
        await supabaseRequest(
          "/rest/v1/rpc/acknowledge_own_consent",
          {
            method: "POST",
            body: JSON.stringify({
              p_declaration_type: required(body.declarationType, "Declaration"),
              p_response: Boolean(body.response),
              p_details: nullable(body.details),
            }),
          },
          token,
        );
      } catch (error) {
        throw databaseError(error, "That could not be recorded.");
      }
      return Response.json({ ok: true });
    }

    if (action === "appointment_request") {
      // The client asks; staff confirm. The request is attached to one of their
      // own cases and is created as requested rather than scheduled.
      const linkedClient = await ownClientId(session.identity.profileId, token);
      const caseId = required(body.caseId, "Case");
      const cases = await rest<Json[]>(
        `cases?select=id,client_id,owner_id,organisation_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      );
      const linkedCase = cases[0];
      if (!linkedCase)
        throw new LiveAccessError(403, "That case is not available to you.");
      if (
        session.identity.role === "client" &&
        String(linkedCase.client_id) !== String(linkedClient ?? "")
      )
        throw new LiveAccessError(
          403,
          "You can only request an appointment on your own case.",
        );
      const id = crypto.randomUUID();
      const startsAt = new Date(
        `${required(body.date, "Preferred date")}T${String(body.time || "09:00")}:00`,
      );
      if (Number.isNaN(startsAt.getTime()))
        throw new InputError("That preferred date is not valid.");
      if (startsAt.getTime() < Date.now())
        throw new InputError("Choose a date in the future.");
      await insert(
        "appointments",
        {
          id,
          organisation_id: org,
          case_id: caseId,
          owner_id: linkedCase.owner_id ?? null,
          title: required(body.title, "What the appointment is about"),
          appointment_type: String(body.appointmentType || "Consultation"),
          starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString(),
          status: "requested",
        },
        token,
      );
      if (linkedCase.owner_id)
        await insert(
          "notifications",
          {
            id: crypto.randomUUID(),
            organisation_id: org,
            recipient_id: linkedCase.owner_id,
            case_id: caseId,
            kind: "appointment_requested",
            title: "A client asked for an appointment",
            body: `${session.identity.displayName} asked for ${String(body.title)}.`,
          },
          token,
        ).catch((error) =>
          console.error("Could not notify the case owner", error),
        );
      return appendRefreshCookies(
        Response.json({ ok: true }),
        session.refreshed,
        request,
      );
    }

    if (action === "confirm_document" || action === "confirm_invoice") {
      // A client acknowledging a document or invoice request reached them --
      // recorded on the case history, and the case owner is told. It never
      // changes the record's own state (still requested, still unpaid); it
      // is only the client's own audit trail of having seen it.
      const resource = action === "confirm_document" ? "documents" : "invoices";
      const label = action === "confirm_document" ? "Document" : "Invoice";
      const recordId = required(body.id, label);
      const linkedClient = await ownClientId(session.identity.profileId, token);
      if (!linkedClient)
        throw new LiveAccessError(403, "No client record is linked to this account.");
      const [record] = await rest<Json[]>(
        `${resource}?select=id,client_id,case_id&id=eq.${encodeURIComponent(recordId)}&limit=1`,
        token,
      );
      if (!record || String(record.client_id) !== String(linkedClient))
        throw new LiveAccessError(403, "That record is not available to you.");
      if (!record.case_id)
        throw new InputError("This is not linked to a case yet, so it cannot be confirmed.");
      const caseId = String(record.case_id);
      await insert(
        "audit_events",
        {
          organisation_id: org,
          actor_id: actor,
          action: action === "confirm_document" ? "document.confirmed_received" : "invoice.confirmed_received",
          resource_type: action === "confirm_document" ? "document" : "invoice",
          resource_id: recordId,
          case_id: caseId,
          summary: `${session.identity.displayName} confirmed receipt of ${label.toLowerCase() === "document" ? "a document" : "an invoice"}`,
        },
        token,
      );
      const [caseRow] = await rest<Array<{ owner_id: string | null }>>(
        `cases?select=owner_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      );
      if (caseRow?.owner_id)
        await insert(
          "notifications",
          {
            id: crypto.randomUUID(),
            organisation_id: org,
            recipient_id: caseRow.owner_id,
            case_id: caseId,
            kind: action === "confirm_document" ? "document_confirmed" : "invoice_confirmed",
            title:
              action === "confirm_document"
                ? "A client confirmed a document request"
                : "A client confirmed an invoice",
            body: `${session.identity.displayName} confirmed receipt.`,
          },
          token,
        ).catch((error) =>
          console.error("Could not notify the case owner", error),
        );
      return appendRefreshCookies(
        Response.json({ ok: true }),
        session.refreshed,
        request,
      );
    }

    // The visa stage cannot be entered without the expiry date it is worked
    // against. Rather than sending staff to another screen to supply it, the
    // pipeline control asks for it where the requirement appears.
    if (action === "set_visa_expiry") {
      const caseId = required(body.caseId, "Case");
      const visaExpiry = requiredDay(body.visaExpiry, "Visa expiry date");
      if (!(await lifecycleReady(token)))
        throw new InputError(LIFECYCLE_MIGRATION_HINT);
      await patchRow("cases", caseId, { visa_expiry_on: visaExpiry }, token);
      await auditEvent(
        org,
        actor,
        "case.visa_expiry_recorded",
        "case",
        caseId,
        session.identity.branchId,
        `Recorded visa expiry ${visaExpiry}`,
        token,
      );
      return Response.json({ ok: true, visaExpiry });
    }

    if (action === "update_case") {
      const displayName = required(body.name, "Client name");
      const emailAddress = requiredEmail(body.email);
      const visaExpiry = requiredDay(body.visaExpiry, "Visa expiry date");
      const parts = displayName.split(/\s+/);
      const firstName = parts.shift() || displayName;
      const lastName = parts.join(" ") || "—";
      const clientId = required(body.clientId, "Client");
      const caseId = required(body.caseId, "Case");
      await patchRow(
        "clients",
        clientId,
        {
          first_name: firstName,
          last_name: lastName,
          email: emailAddress,
          mobile: nullable(body.phone),
          updated_at: new Date().toISOString(),
        },
        token,
      );
      const caseChanges: Json = {
        service_type: serviceStream(body.workspace, body.matterType ?? body.type),
        matter_type: nullable(body.matterType ?? body.type),
        target: nullable(body.target),
        next_action: nullable(body.stage),
        due_at: nullableDate(body.due),
        health: normalHealth(body.health),
      };
      if (await lifecycleReady(token)) caseChanges.visa_expiry_on = visaExpiry;
      // Progress tracks the lifecycle stage, so an edit that does not carry a
      // progress value must not reset it to zero.
      if (body.progress !== undefined && body.progress !== "")
        caseChanges.progress = Number(body.progress);
      if (typeof body.ownerId === "string" && body.ownerId.trim())
        caseChanges.owner_id = await resolveOwnerId(body.ownerId, actor, token);
      await patchRow("cases", caseId, caseChanges, token);
      await auditEvent(
        org,
        actor,
        "case.updated",
        "case",
        caseId,
        session.identity.branchId,
        `Updated case for ${displayName}`,
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "case") {
      const displayName = required(body.name, "Client name");
      const emailAddress = requiredEmail(body.email);
      const visaExpiry = requiredDay(body.visaExpiry, "Visa expiry date");
      const lifecycleEnabled = await lifecycleReady(token);
      const ownerId = await resolveOwnerId(body.ownerId, actor, token);
      const parts = displayName.split(/\s+/);
      const firstName = parts.shift() || displayName;
      const lastName = parts.join(" ") || "—";
      const branchId = await resolveBranchId(
        body.branchId,
        session.identity.branchId,
        session.identity.sourceLevel,
        token,
      );
      // A second case for somebody already on file. The duplicate check offers
      // this so that a returning client keeps one record, one document folder
      // and one history instead of gaining a second of each.
      const existingClientId = nullable(body.existingClientId);
      if (existingClientId) {
        const found = await rest<Json[]>(
          `clients?select=id,branch_id&id=eq.${encodeURIComponent(existingClientId)}&limit=1`,
          token,
        );
        if (!found[0])
          throw new InputError("That client is not available to you.");
      }
      const clientId = existingClientId || crypto.randomUUID();
      const caseId = crypto.randomUUID();
      const now = new Date().toISOString();
      const matterType = nullable(body.matterType ?? body.type);
      const kind = serviceStream(body.workspace, matterType);
      const client = {
        id: clientId,
        organisation_id: org,
        branch_id: branchId,
        crm_id: `MAX-${new Date().getUTCFullYear()}-${clientId.slice(0, 8).toUpperCase()}`,
        first_name: firstName,
        last_name: lastName,
        email: emailAddress,
        mobile: nullable(body.phone),
        owner_id: ownerId,
        current_lifecycle: "enquiry",
        date_of_birth: nullableDay(body.dob),
        nationality: nullable(body.nationality),
        source: nullable(body.source),
        custom_fields: intakeFields(body, [
          "action", "name", "email", "phone", "dob", "nationality", "source",
          "branchId", "type", "target", "stage", "due", "health", "progress",
        ]),
        updated_at: now,
      };
      if (!existingClientId) await insert("clients", client, token);
      try {
        await insert(
          "cases",
          {
            id: caseId,
            organisation_id: org,
            client_id: clientId,
            branch_id: branchId,
            case_number: `CASE-${new Date().getUTCFullYear()}-${caseId.slice(0, 8).toUpperCase()}`,
            service_type: kind,
            matter_type: matterType,
            owner_id: ownerId,
            health: normalHealth(body.health),
            priority: "medium",
            progress: Number(body.progress ?? 0),
            target: nullable(body.target),
            next_action: nullable(body.stage),
            due_at: nullableDate(body.due),
            // Written only when the lifecycle migration has been applied, so
            // an out-of-date database still accepts new cases.
            ...(lifecycleEnabled ? { visa_expiry_on: visaExpiry } : {}),
            custom_fields: {
              intake_type: nullable(body.type),
              workspace: nullable(body.workspace),
              ...intakeFields(body, [
                "action", "name", "email", "phone", "dob", "nationality", "source",
                "branchId", "type", "target", "stage", "due", "health", "progress",
              ]),
            },
          },
          token,
        );
      } catch (error) {
        // Only undo a client this request created. An existing client keeps
        // their record and their other cases.
        if (!existingClientId)
          await supabaseRequest(
            `/rest/v1/clients?id=eq.${clientId}`,
            { method: "DELETE" },
            token,
          ).catch(() => undefined);
        throw error;
      }
      await auditEvent(
        org,
        actor,
        "case.created",
        "case",
        caseId,
        branchId,
        `Created ${kind === "study_abroad" ? "student" : "migration"} case for ${displayName}${
          existingClientId ? " (added to their existing client record)" : ""
        }`,
        token,
      );
      return Response.json({ ok: true, clientId, caseId });
    }

    if (action === "task") {
      const id = crypto.randomUUID();
      await insert(
        "tasks",
        {
          id,
          organisation_id: org,
          case_id: nullable(body.caseId),
          title: required(body.title, "Task title"),
          assigned_to: actor,
          assigned_by: actor,
          priority: String(body.priority || "medium").toLowerCase(),
          status: "open",
          due_at: nullableDate(body.due),
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        "task.created",
        "task",
        id,
        session.identity.branchId,
        `Created task: ${String(body.title)}`,
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "appointment") {
      const id = crypto.randomUUID();
      const title = required(body.title, "Title");
      const startsAt = new Date(
        `${required(body.date, "Date")}T${String(body.time || "09:00")}:00`,
      ).toISOString();
      const endsAt = new Date(
        new Date(startsAt).getTime() + 60 * 60 * 1000,
      ).toISOString();
      await insert(
        "appointments",
        {
          id,
          organisation_id: org,
          case_id: nullable(body.caseId),
          owner_id: actor,
          title,
          appointment_type: String(body.appointmentType || "Consultation"),
          starts_at: startsAt,
          ends_at: endsAt,
          status: "scheduled",
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        "appointment.created",
        "appointment",
        id,
        session.identity.branchId,
        `Scheduled appointment: ${String(body.title)}`,
        token,
      );
      // A scheduling convenience, not the record of truth: the appointment is
      // already saved, so a Google-side failure here is logged and swallowed
      // rather than surfacing as a failed request to schedule it.
      await syncAppointmentToCalendar(actor, id, title, startsAt, endsAt, token);
      return Response.json({ ok: true });
    }

    if (action === "document") {
      const id = crypto.randomUUID();
      const clientId = required(body.clientId, "Client");
      const title = required(body.title, "Document title");
      await insert(
        "documents",
        {
          id,
          organisation_id: org,
          client_id: clientId,
          case_id: nullable(body.caseId),
          document_type: String(body.folder || "General"),
          display_name: title,
          state: "requested",
          requested_by: actor,
          // No file is transferred here. The document is tracked as requested
          // until storage is connected and someone records that it arrived.
          metadata: {
            storage: "not_connected",
            note: nullable(body.documentNote),
          },
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        "document.requested",
        "document",
        id,
        session.identity.branchId,
        `Requested document: ${String(body.title)}`,
        token,
      );
      const [client] = await rest<Json[]>(
        `clients?select=email,first_name,last_name&id=eq.${encodeURIComponent(clientId)}&limit=1`,
        token,
      );
      if (client)
        await notifyClient(org, token, "document_request", String(client.email ?? ""), {
          client_name: fullClientName(client),
          document_title: title,
          note: nullable(body.documentNote) ?? "",
          portal_link: publicOrigin(request),
          sender_name: session.identity.displayName,
        });
      return Response.json({ ok: true });
    }

    if (action === "visaChecklist") {
      if (session.identity.role === "client")
        throw new LiveAccessError(403, "Only the case team can request documents.");
      const caseId = required(body.caseId, "Visa case");
      const [caseRow] = await rest<Json[]>(
        `cases?select=id,client_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      );
      if (!caseRow)
        throw new LiveAccessError(403, "That visa case is not available to you.");

      // The checklist is masters data now, editable per organisation
      // (document_checklist_templates), not a fixed list baked into the
      // code. Only active entries can be requested; a retired one is left
      // alone rather than silently archiving what was already asked for
      // under it.
      const checklistTemplates = (
        await rest<Json[]>(
          `document_checklist_templates?select=id,category,title,guidance&organisation_id=eq.${org}&active=eq.true`,
          token,
        )
      ).map((row) => ({
        key: String(row.id),
        category: String(row.category),
        title: String(row.title),
        guidance: row.guidance ? String(row.guidance) : "",
      }));

      const selected = new Set(
        checklistTemplates
          .filter((item) => body[`visaDoc_${item.key}`] === "on")
          .map((item) => item.key),
      );
      if (selected.size === 0)
        throw new InputError("Select at least one document to request.");
      const existing = await rest<Json[]>(
        `documents?select=*&case_id=eq.${encodeURIComponent(caseId)}&metadata->>source=eq.visa_checklist`,
        token,
      );
      const byKey = new Map(
        existing.map((row) => [String((row.metadata as Json | null)?.checklist_key ?? ""), row]),
      );

      const newlyRequested: string[] = [];
      for (const template of checklistTemplates) {
        const current = byKey.get(template.key);
        if (selected.has(template.key)) {
          const metadata = {
            ...((current?.metadata as Json | null) ?? {}),
            source: "visa_checklist",
            checklist_key: template.key,
            guidance: template.guidance,
            note: nullable(body.documentNote),
            due_on: nullable(body.due),
            client_visible: true,
          };
          if (current) {
            if (String(current.state) === "archived") {
              await patchRow("documents", String(current.id), { state: "requested", metadata }, token);
              newlyRequested.push(template.title);
            } else {
              await patchRow("documents", String(current.id), { metadata }, token);
            }
          } else {
            await insert("documents", {
              id: crypto.randomUUID(),
              organisation_id: org,
              client_id: caseRow.client_id,
              case_id: caseId,
              document_type: template.category,
              display_name: template.title,
              state: "requested",
              requested_by: actor,
              metadata,
            }, token);
            newlyRequested.push(template.title);
          }
        } else if (
          current &&
          ["requested", "rejected", "archived"].includes(String(current.state)) &&
          !current.drive_file_id
        ) {
          await patchRow("documents", String(current.id), {
            state: "archived",
            metadata: {
              ...((current.metadata as Json | null) ?? {}),
              client_visible: false,
              withdrawn_at: new Date().toISOString(),
            },
          }, token);
        }
      }
      await auditEvent(
        org,
        actor,
        "visa_document_checklist.updated",
        "case",
        caseId,
        session.identity.branchId,
        `Updated visa document checklist (${selected.size} requested)`,
        token,
      );
      if (newlyRequested.length) {
        const [client] = await rest<Json[]>(
          `clients?select=email,first_name,last_name&id=eq.${encodeURIComponent(String(caseRow.client_id))}&limit=1`,
          token,
        );
        if (client)
          await notifyClient(org, token, "document_request", String(client.email ?? ""), {
            client_name: fullClientName(client),
            document_title: newlyRequested.join(", "),
            note: nullable(body.documentNote) ?? "",
            portal_link: publicOrigin(request),
            sender_name: session.identity.displayName,
          });
      }
      return Response.json({ ok: true, requested: selected.size });
    }

    if (action === "message") {
      const threadId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      let clientId = nullable(body.clientId);
      let caseId = nullable(body.caseId);
      let recipient = nullable(body.to);
      let assignedTo = actor;
      let threadStatus = "draft";
      let direction = "outbound";
      let deliveryState = "draft";
      if (session.identity.role === "client") {
        clientId = await ownClientId(session.identity.profileId, token);
        caseId = required(body.caseId, "Case");
        if (!clientId)
          throw new LiveAccessError(
            403,
            "No client record is linked to this account.",
          );
        const [linkedCase] = await rest<Json[]>(
          `cases?select=id,client_id,owner_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
          token,
        );
        if (!linkedCase || String(linkedCase.client_id) !== String(clientId))
          throw new LiveAccessError(
            403,
            "You can only message the team working on your own case.",
          );
        if (!linkedCase.owner_id)
          throw new InputError(
            "Your case does not have an assigned officer yet. Please contact Maximus directly.",
          );
        assignedTo = String(linkedCase.owner_id);
        recipient = "Maximus case team";
        threadStatus = "open";
        direction = "inbound";
        deliveryState = "received";
      } else {
        // Staff never type a recipient for case communication. Resolve it
        // from the case and its client at send time, so a corrected address
        // in the case profile is used immediately and an unrelated address
        // cannot be attached to the wrong file.
        caseId = required(body.caseId, "Case");
        const [linkedCase] = await rest<Json[]>(
          `cases?select=id,client_id,owner_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
          token,
        );
        if (!linkedCase)
          throw new LiveAccessError(403, "That case is not available to you.");
        clientId = String(linkedCase.client_id);
        const [linkedClient] = await rest<Json[]>(
          `clients?select=id,email&id=eq.${encodeURIComponent(clientId)}&limit=1`,
          token,
        );
        if (!linkedClient)
          throw new LiveAccessError(403, "That client is not available to you.");
        recipient = requiredEmail(linkedClient.email);
        assignedTo = String(linkedCase.owner_id || actor);
      }
      await insert(
        "email_threads",
        {
          id: threadId,
          organisation_id: org,
          client_id: clientId,
          case_id: caseId,
          subject: required(body.subject, "Subject"),
          assigned_to: assignedTo,
          status: threadStatus,
          awaiting_party: "staff",
          last_message_at: new Date().toISOString(),
        },
        token,
      );
      await insert(
        "email_messages",
        {
          id: messageId,
          organisation_id: org,
          thread_id: threadId,
          sender: session.identity.email,
          recipients: [recipient],
          direction,
          body_preview: required(body.body, "Message"),
          delivery_state: deliveryState,
          created_by: actor,
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        session.identity.role === "client" ? "message.received" : "message.drafted",
        "email_message",
        messageId,
        session.identity.branchId,
        session.identity.role === "client"
          ? `Client message: ${String(body.subject)}`
          : `Saved message draft: ${String(body.subject)}`,
        token,
      );
      return Response.json({ ok: true, messageId, recipientSource: "case_profile" });
    }

    if (action === "invoice") {
      // Raising one is open to a case officer for a client they can already
      // modify -- invoices_staff_create enforces that boundary at the
      // database, same as every other staff write in this schema. Changing
      // or voiding an invoice once raised stays manager and above.
      const id = crypto.randomUUID();
      const documentId = crypto.randomUUID();
      const caseId = required(body.caseId, "Case");
      const [invoiceCase] = await rest<Json[]>(
        `cases?select=id,client_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      );
      if (!invoiceCase)
        throw new LiveAccessError(403, "That case is not available to you.");
      const clientId = String(invoiceCase.client_id);
      const subtotal = moneyAmount(body.subtotal ?? body.amount, "Subtotal");
      const tax = moneyAmount(body.tax ?? 0, "Tax", true);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const currency = invoiceCurrency(body.currency);
      const invoiceType = invoiceTypeValue(body.invoiceType);
      const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
      await insert(
        "invoices",
        {
          id,
          organisation_id: org,
          client_id: clientId,
          case_id: caseId,
          invoice_number: invoiceNumber,
          invoice_type: invoiceType,
          currency,
          subtotal,
          tax,
          total,
          state: "issued",
          issued_on: new Date().toISOString().slice(0, 10),
          due_on: nullable(body.due),
          created_by: actor,
        },
        token,
      );
      // Every invoice gets a protected file slot, even when the PDF is added
      // later. The normal document uploader then stores it in the client's
      // Accounts and Receipts folder and keeps replacement/version history.
      await insert(
        "documents",
        {
          id: documentId,
          organisation_id: org,
          client_id: clientId,
          case_id: caseId,
          document_type: "10 Accounts and Receipts",
          display_name: `${invoiceNumber}.pdf`,
          state: "requested",
          requested_by: actor,
          metadata: {
            source: "invoice_pdf",
            invoice_id: id,
            invoice_number: invoiceNumber,
            // Shown through the invoice, not as a document request asking the
            // client to upload Maximus's own invoice back to the agency.
            client_visible: false,
          },
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        "invoice.created",
        "invoice",
        id,
        session.identity.branchId,
        `Created ${invoiceNumber} for ${currency} ${total.toFixed(2)}`,
        token,
      );
      const [invoiceClient] = await rest<Json[]>(
        `clients?select=email,first_name,last_name&id=eq.${encodeURIComponent(clientId)}&limit=1`,
        token,
      );
      if (invoiceClient) {
        const due = nullable(body.due);
        await notifyClient(org, token, "invoice_request", String(invoiceClient.email ?? ""), {
          client_name: fullClientName(invoiceClient),
          amount: `${currency} ${total.toFixed(2)}`,
          due_clause: due ? `, due ${due}` : "",
            portal_link: publicOrigin(request),
          sender_name: session.identity.displayName,
        });
      }
      return Response.json({ ok: true, invoiceId: id, invoiceNumber, documentId });
    }

    if (action === "send_portal_access") {
      // Same boundary a case officer already writes every other client record
      // through -- true always for manager and above, true for staff or a
      // partner only for a client they can already modify.
      const clientId = required(body.clientId, "Client");
      const permitted = await supabaseRequest<boolean>(
        "/rest/v1/rpc/can_modify_client",
        { method: "POST", body: JSON.stringify({ target_client: clientId }) },
        token,
      );
      if (!permitted)
        throw new LiveAccessError(403, "That client is not available to you.");
      const [client] = await rest<Json[]>(
        `clients?select=id,email,first_name,last_name,branch_id&id=eq.${encodeURIComponent(clientId)}&limit=1`,
        token,
      );
      if (!client)
        throw new LiveAccessError(403, "That client is not available to you.");
      const address = String(client.email ?? "").trim().toLowerCase();
      if (!address) throw new InputError("This client has no email address on file.");
      if (!serviceRoleKey())
        throw new InputError(
          "Portal access needs a service-role key configured for this deployment (SUPABASE_SERVICE_ROLE_KEY).",
        );

      // The login and the profile it points at are created with the
      // service-role key, the same as adding a member of staff -- the
      // permission check above is what actually gates this, not row-level
      // security on profiles (which never lets staff write there directly).
      // Read with the service-role key, not the caller's own token: staff can
      // write a client's case but client_user_links is readable only by an
      // administrator, so a case officer's own session would never see a
      // link that already exists and would try to create a second one.
      const [existingLink] = await supabaseAdminRequest<Array<{ profile_id: string }>>(
        `/rest/v1/client_user_links?select=profile_id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`,
      );
      let profileId = existingLink?.profile_id ?? null;
      if (!profileId) {
        let created: { id?: string };
        let connectedExisting = false;
        try {
          created = await supabaseAdminRequest<{ id?: string }>("/auth/v1/admin/users", {
            method: "POST",
            body: JSON.stringify({
              email: address,
              password: crypto.randomUUID(),
              email_confirm: true,
            }),
          });
        } catch (error) {
          // That address already has a Supabase login -- connect it rather
          // than fail, the same fallback staff onboarding uses.
          if (!(error instanceof SupabaseError) || error.status !== 422) throw error;
          const found = await supabaseAdminRequest<{ users?: { id: string; email?: string }[] }>(
            `/auth/v1/admin/users?email=${encodeURIComponent(address)}`,
          );
          const match = (found.users ?? []).find(
            (row) => (row.email ?? "").toLowerCase() === address,
          );
          if (!match) throw error;
          created = { id: match.id };
          connectedExisting = true;
        }
        if (!created?.id) throw new InputError("The portal login was not created.");
        profileId = created.id;
        const [existingProfile] = await supabaseAdminRequest<Json[]>(
          `/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(profileId)}&limit=1`,
        );
        if (!existingProfile) {
          try {
            await supabaseAdminRequest("/rest/v1/profiles", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({
                id: profileId,
                organisation_id: org,
                branch_id: client.branch_id ?? null,
                display_name: fullClientName(client) || address,
                email: address,
                level: "student",
                active: true,
              }),
            });
          } catch (error) {
            if (!connectedExisting)
              await supabaseAdminRequest(`/auth/v1/admin/users/${profileId}`, {
                method: "DELETE",
              }).catch(() => undefined);
            throw error;
          }
        }
        await supabaseAdminRequest("/rest/v1/client_user_links", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ profile_id: profileId, client_id: clientId }),
        });
      }

      // A secure one-time link, not a password handed over in an email --
      // the client sets their own password behind it.
      let setupLink = "";
      try {
        const generated = await supabaseAdminRequest<{
          action_link?: string;
          properties?: { action_link?: string };
        }>("/auth/v1/admin/generate_link", {
          method: "POST",
          body: JSON.stringify({
            type: "recovery",
            email: address,
            options: { redirect_to: publicOrigin(request) },
          }),
        });
        setupLink = generated.action_link || generated.properties?.action_link || "";
      } catch (error) {
        console.error("Could not generate a portal setup link", error);
      }

      let emailSent = false;
      if (setupLink && emailConfigured()) {
        try {
          const template = await emailTemplateFor(org, "portal_welcome", token);
          if (template) {
            const values = {
              client_name: fullClientName(client) || address,
              email: address,
              setup_link: setupLink,
              sender_name: session.identity.displayName,
            };
            const subject = renderTemplate(template.subject, values);
            const rendered = renderTemplate(template.body, values);
            await sendEmail({
              to: address,
              subject,
              text: rendered,
              html: rendered.replace(/\n/g, "<br>"),
            });
            emailSent = true;
          }
        } catch (error) {
          console.error(`Could not send portal_welcome email to ${address}`, error);
        }
      }

      await auditEvent(
        org,
        actor,
        "client.portal_access_sent",
        "client",
        clientId,
        session.identity.branchId,
        `Sent portal access to ${address}`,
        token,
      );

      return appendRefreshCookies(
        Response.json({
          ok: true,
          email: address,
          emailSent,
          setupLink: emailSent ? undefined : setupLink,
          message: emailSent
            ? `${address} has been emailed their portal sign-in link.`
            : setupLink
              ? "Email is not configured on this deployment -- share this sign-in link with the client yourself."
              : 'Portal access was created, but a sign-in link could not be generated. Ask the client to use "Forgot password" on the sign-in page.',
        }),
        session.refreshed,
        request,
      );
    }

    if (action === "template") {
      requireManager(session.identity.role, "create a template");
      const id = crypto.randomUUID();
      await insert(
        "content_templates",
        {
          id,
          organisation_id: org,
          name: required(body.name, "Template name"),
          template_type: String(body.templateType || "Email"),
          body: required(body.content, "Content"),
          approval_status:
            session.identity.role === "super_admin" ? "approved" : "draft",
          approved_by: session.identity.role === "super_admin" ? actor : null,
        },
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "workflow") {
      if (
        session.identity.role !== "super_admin" &&
        session.identity.role !== "admin"
      )
        throw new LiveAccessError(
          403,
          "Only administrators can create workflows.",
        );
      const id = crypto.randomUUID();
      await insert(
        "workflow_templates",
        {
          id,
          organisation_id: org,
          name: required(body.name, "Workflow name"),
          service_type: String(body.serviceType || "study_abroad"),
          version: 1,
          active: true,
          configuration: {},
          created_by: actor,
        },
        token,
      );
      const stageNames = Array.isArray(body.stages)
        ? body.stages.map(String)
        : String(body.stages || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      for (let index = 0; index < stageNames.length; index += 1)
        await insert(
          "workflow_stages",
          {
            id: crypto.randomUUID(),
            template_id: id,
            name: stageNames[index],
            position: index + 1,
            entry_rules: {},
            exit_rules: {},
            automations: [],
          },
          token,
        );
      return Response.json({ ok: true });
    }

    if (action === "role") {
      if (session.identity.role !== "super_admin")
        throw new LiveAccessError(
          403,
          "Only a Super Admin can create staff roles.",
        );
      await insert(
        "roles",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          name: required(body.name, "Role name"),
          level: "staff",
          data_scope: String(body.scope || "assigned_cases")
            .toLowerCase()
            .replaceAll(" ", "_"),
          system_role: false,
        },
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "assign" || action === "bulk_assign") {
      // Managers may redistribute any accessible case. A staff member may
      // hand over the one case they currently own; bulk redistribution stays
      // a management operation.
      const manager =
        session.identity.role === "super_admin" || session.identity.role === "admin";
      if (!manager && action === "bulk_assign")
        throw new LiveAccessError(403, "Only an administrator can reassign cases in bulk.");
      const ownerId = required(body.ownerId, "Staff member");
      const candidates = await rest<Json[]>(
        `profiles?select=id,display_name,level,active&id=eq.${encodeURIComponent(ownerId)}&limit=1`,
        token,
      );
      const candidate = candidates[0];
      if (!candidate)
        throw new InputError("That staff member is not in this organisation.");
      if (candidate.active !== true)
        throw new InputError("That account is deactivated.");
      if (candidate.level === "student")
        throw new InputError("A case cannot be assigned to a portal account.");
      const candidateName = String(candidate.display_name ?? "a colleague");

      const caseIds =
        action === "bulk_assign"
          ? (Array.isArray(body.caseIds) ? body.caseIds : []).map(String)
          : [required(body.caseId, "Case")];
      if (caseIds.length === 0) throw new InputError("Select at least one case.");
      if (caseIds.length > 200) throw new InputError("Reassign at most 200 cases at a time.");

      let succeeded = 0;
      const failedCaseIds: string[] = [];
      for (const caseId of caseIds) {
        if (!manager) {
          const owned = await rest<Json[]>(
            `cases?select=id,owner_id&id=eq.${encodeURIComponent(caseId)}&owner_id=eq.${encodeURIComponent(actor)}&limit=1`,
            token,
          );
          if (!owned[0])
            throw new LiveAccessError(
              403,
              "You can transfer only a case currently assigned to you.",
            );
        }
        try {
          await patchRow("cases", caseId, { owner_id: ownerId }, token);
        } catch (error) {
          // One case this actor cannot reassign -- not accessible to them, or
          // already gone -- must not stop the rest of a bulk request.
          if (action === "bulk_assign" && error instanceof LiveAccessError) {
            failedCaseIds.push(caseId);
            continue;
          }
          throw error;
        }
        succeeded += 1;
        await auditEvent(
          org,
          actor,
          "case.reassigned",
          "case",
          caseId,
          session.identity.branchId,
          `Reassigned case to ${candidateName}`,
          token,
        );
        // Tell the new owner, unless an administrator assigned it to themselves.
        if (ownerId !== actor)
          await insert(
            "notifications",
            {
              id: crypto.randomUUID(),
              organisation_id: org,
              recipient_id: ownerId,
              case_id: caseId,
              kind: "case_assigned",
              title: "A case was assigned to you",
              body: `${session.identity.displayName} assigned you a case.`,
            },
            token,
          ).catch((error) => {
            // The assignment itself succeeded; a failed notification must not
            // undo it, but it should not disappear either.
            console.error("Could not notify the new case owner", error);
          });
      }
      if (action === "bulk_assign")
        return Response.json({ ok: true, succeeded, failed: failedCaseIds.length });
      return Response.json({ ok: true });
    }

    if (action === "add_collaborator" || action === "remove_collaborator") {
      const caseId = required(body.caseId, "Case");
      const profileId = required(body.profileId, "Staff member");
      const [subject] = await rest<Json[]>(
        `cases?select=id,owner_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      );
      if (!subject) throw new LiveAccessError(403, "That case is not available.");
      const manager =
        session.identity.role === "super_admin" || session.identity.role === "admin";
      if (!manager && subject.owner_id !== actor)
        throw new LiveAccessError(403, "Only the case owner or an administrator can change the case team.");
      if (profileId === subject.owner_id)
        throw new InputError("The case owner is already part of the case team.");
      if (action === "add_collaborator") {
        const [candidate] = await rest<Json[]>(
          `profiles?select=id,level,active&id=eq.${encodeURIComponent(profileId)}&limit=1`,
          token,
        );
        if (!candidate || candidate.active !== true || candidate.level === "student")
          throw new InputError("Choose an active staff member from this organisation.");
        await supabaseRequest(
          "/rest/v1/case_collaborators",
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ organisation_id: org, case_id: caseId, profile_id: profileId, added_by: actor }),
          },
          token,
        );
      } else {
        await supabaseRequest(
          `/rest/v1/case_collaborators?case_id=eq.${encodeURIComponent(caseId)}&profile_id=eq.${encodeURIComponent(profileId)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } },
          token,
        );
      }
      await auditEvent(
        org,
        actor,
        action === "add_collaborator" ? "case.collaborator_added" : "case.collaborator_removed",
        "case",
        caseId,
        session.identity.branchId,
        action === "add_collaborator" ? "Added a colleague to the case team" : "Removed a colleague from the case team",
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "lifecycle") {
      const caseId = required(body.caseId, "Case");
      const stage = required(body.stage, "Stage") as LifecycleStage;
      if (!LIFECYCLE_STAGES.includes(stage))
        throw new InputError("That is not a valid case stage.");
      if (!(await lifecycleReady(token)))
        throw new InputError(LIFECYCLE_MIGRATION_HINT);
      const reason = nullable(body.reason);
      let moved: Json[];
      try {
        moved = await supabaseRequest<Json[]>(
          "/rest/v1/rpc/move_case_lifecycle",
          {
            method: "POST",
            body: JSON.stringify({
              target_case: caseId,
              target_stage: stage,
              transition_reason: reason,
            }),
          },
          token,
        );
      } catch (error) {
        // move_case_lifecycle raises messages meant for the user, such as the
        // missing visa expiry date or completing outside the visa stage.
        if (error instanceof SupabaseError) {
          const message = databaseMessage(error.message);
          if (message) throw new InputError(message);
        }
        throw error;
      }
      return Response.json({
        ok: true,
        case: Array.isArray(moved) ? (moved[0] ?? null) : moved,
      });
    }

    if (action === "mutate") {
      if (session.identity.role === "client")
        throw new LiveAccessError(
          403,
          "Client records can only be changed through approved portal actions.",
        );
      const resource = required(body.resource, "Resource");
      const id = required(body.id, "Record id");
      const operation = required(body.operation, "Operation");
      if (resource === "invoice")
        requireManager(session.identity.role, "change an invoice");
      if (resource === "template")
        requireManager(session.identity.role, "change a template");
      if (resource === "workflow")
        requireManager(session.identity.role, "change a workflow");
      if (resource === "task" && operation === "toggle") {
        const completed = Boolean(body.completed);
        await patchRow(
          "tasks",
          id,
          {
            status: completed ? "completed" : "open",
            completed_at: completed ? new Date().toISOString() : null,
          },
          token,
        );
      } else if (resource === "case" && operation === "archive") {
        // Archiving ends the work on a case, so it is a management decision. A
        // case officer asks, and the managers who can approve are notified.
        if (session.identity.role === "staff") {
          await supabaseRequest(
            "/rest/v1/rpc/request_case_archive",
            {
              method: "POST",
              body: JSON.stringify({
                target_case: id,
                request_reason: nullable(body.reason),
              }),
            },
            token,
          );
          return Response.json({
            ok: true,
            requested: true,
            message:
              "Archiving needs a manager. They have been asked, and the request is on the case history.",
          });
        }
        await patchRow(
          "cases",
          id,
          {
            health: "closed",
            closed_at: new Date().toISOString(),
            outcome: "archived",
          },
          token,
        );
      } else if (resource === "task" && operation === "delete") {
        await deleteRow("tasks", id, token);
      } else if (resource === "appointment" && operation === "delete") {
        const [cancelled] = await rest<
          { owner_id: string | null; google_calendar_event_id: string | null }[]
        >(
          `appointments?select=owner_id,google_calendar_event_id&id=eq.${encodeURIComponent(id)}&limit=1`,
          token,
        );
        await deleteRow("appointments", id, token);
        if (cancelled)
          await cancelAppointmentOnCalendar(
            cancelled.owner_id,
            cancelled.google_calendar_event_id,
            token,
          );
      } else if (resource === "document" && operation === "delete") {
        await patchRow("documents", id, { state: "archived" }, token);
      } else if (resource === "message" && operation === "toggle") {
        await patchRow(
          "email_messages",
          id,
          { delivery_state: body.completed ? "ready" : "draft" },
          token,
        );
      } else if (resource === "message" && operation === "delete") {
        await patchRow(
          "email_messages",
          id,
          { delivery_state: "discarded" },
          token,
        );
      } else if (resource === "invoice" && operation === "toggle") {
        await patchRow(
          "invoices",
          id,
          {
            state: body.completed ? "paid" : "issued",
            paid: body.completed ? Number(body.amount ?? 0) : 0,
          },
          token,
        );
      } else if (resource === "invoice" && operation === "refund") {
        // What was collected stays on the record -- a refund reverses the
        // money, not the history of what was actually paid.
        await patchRow("invoices", id, { state: "refunded" }, token);
        await insert(
          "payments",
          {
            id: crypto.randomUUID(),
            organisation_id: org,
            invoice_id: id,
            amount: -Math.abs(Number(body.amount ?? 0)),
            currency: nullable(body.currency) || "AUD",
            method: nullable(body.method),
            reference: nullable(body.reason) ?? "Refund",
            recorded_by: actor,
          },
          token,
        );
      } else if (resource === "invoice" && operation === "credit") {
        // Forgiving part of what is owed, not a refund of money already
        // collected -- its own ledger entry, checked against the invoice at
        // read time rather than folded into the payments total.
        await insert(
          "credit_notes",
          {
            id: crypto.randomUUID(),
            organisation_id: org,
            invoice_id: id,
            amount: Math.abs(Number(body.amount ?? 0)),
            reason: nullable(body.reason),
            issued_by: actor,
          },
          token,
        );
      } else if (resource === "invoice" && operation === "delete") {
        await patchRow("invoices", id, { state: "void" }, token);
      } else if (resource === "template" && operation === "delete") {
        await deleteRow("content_templates", id, token);
      } else if (resource === "workflow" && operation === "toggle") {
        await patchRow(
          "workflow_templates",
          id,
          { active: Boolean(body.active) },
          token,
        );
      } else {
        return Response.json(
          { ok: false, error: "Unsupported record update." },
          { status: 400 },
        );
      }
      await auditEvent(
        org,
        actor,
        `${resource}.${operation}`,
        resource,
        id,
        session.identity.branchId,
        `${operation} ${resource}`,
        token,
      );
      return Response.json({ ok: true });
    }

    return Response.json(
      { ok: false, error: "Unsupported CRM action." },
      { status: 400 },
    );
  } catch (error) {
    return apiError(error);
  }
}

/**
 * The org's wording for one of the three system emails, or null if this
 * organisation's row is missing (shouldn't happen -- seeded on every
 * organisation -- but the request that triggered this must not fail either
 * way).
 */
async function emailTemplateFor(
  org: string,
  kind: "document_request" | "invoice_request" | "portal_welcome",
  token: string,
): Promise<{ subject: string; body: string } | null> {
  const rows = await rest<Json[]>(
    `email_templates?select=subject,body&organisation_id=eq.${org}&kind=eq.${kind}&limit=1`,
    token,
  );
  const row = rows[0];
  return row ? { subject: String(row.subject), body: String(row.body) } : null;
}

/**
 * Tells a client something was requested or raised on their file. Never lets
 * a delivery failure -- or email being unconfigured on this deployment --
 * fail the write it rides along with; the record exists whether or not the
 * notice about it does.
 */
async function notifyClient(
  org: string,
  token: string,
  kind: "document_request" | "invoice_request" | "portal_welcome",
  to: string | null | undefined,
  values: Record<string, string>,
): Promise<void> {
  if (!to || !emailConfigured()) return;
  try {
    const template = await emailTemplateFor(org, kind, token);
    if (!template) return;
    const subject = renderTemplate(template.subject, values);
    const rendered = renderTemplate(template.body, values);
    await sendEmail({
      to,
      subject,
      text: rendered,
      html: rendered.replace(/\n/g, "<br>"),
    });
  } catch (error) {
    console.error(`Could not send ${kind} email to ${to}`, error);
  }
}

async function ownClientId(profileId: string, token: string) {
  const rows = await rest<Array<{ client_id: string }>>(
    `client_user_links?select=client_id&profile_id=eq.${profileId}&limit=1`,
    token,
  );
  return rows[0]?.client_id ?? null;
}

async function rest<T>(query: string, token: string): Promise<T> {
  return await supabaseRequest<T>(
    `/rest/v1/${query}`,
    { method: "GET" },
    token,
  );
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
/**
 * Updates one row and insists that it actually happened.
 *
 * PostgREST answers 204 when row-level security hid every row the filter
 * matched, so a write somebody was not allowed to make came back as success
 * and silently changed nothing. Asking for the row back turns that into the
 * refusal it always was.
 */
async function patchRow(table: string, id: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(value),
    },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(
      403,
      "That record is not yours to change. If it should be, ask a manager to reassign it to you.",
    );
}
async function deleteRow(table: string, id: string, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

/** Reads the owner's own Calendar connection, if they have one turned on. */
async function ownerCalendarConnection(
  ownerId: string,
  token: string,
): Promise<{ token_reference: string | null; active: boolean } | undefined> {
  const connections = await rest<
    { token_reference: string | null; active: boolean }[]
  >(
    `mailbox_connections?select=token_reference,active&profile_id=eq.${ownerId}&provider=eq.google_calendar&limit=1`,
    token,
  );
  return connections[0];
}

async function syncAppointmentToCalendar(
  ownerId: string | null,
  appointmentId: string,
  title: string,
  startsAt: string,
  endsAt: string,
  token: string,
): Promise<void> {
  if (!ownerId) return;
  try {
    const connection = await ownerCalendarConnection(ownerId, token);
    if (!connection?.active || !connection.token_reference) return;
    const refreshToken = await reveal(connection.token_reference);
    const fresh = await calendarRefreshAccessToken(refreshToken);
    const event = await createCalendarEvent({
      accessToken: fresh.access_token,
      title,
      startsAt,
      endsAt,
    });
    await patchRow(
      "appointments",
      appointmentId,
      { google_calendar_event_id: event.id },
      token,
    );
    if (fresh.refresh_token)
      await supabaseRequest(
        `/rest/v1/mailbox_connections?profile_id=eq.${ownerId}&provider=eq.google_calendar`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ token_reference: await protect(fresh.refresh_token) }),
        },
        token,
      );
  } catch (error) {
    console.error("calendar sync failed", error);
  }
}

async function cancelAppointmentOnCalendar(
  ownerId: string | null,
  eventId: string | null,
  token: string,
): Promise<void> {
  if (!ownerId || !eventId) return;
  try {
    const connection = await ownerCalendarConnection(ownerId, token);
    if (!connection?.active || !connection.token_reference) return;
    const refreshToken = await reveal(connection.token_reference);
    const fresh = await calendarRefreshAccessToken(refreshToken);
    await deleteCalendarEvent({ accessToken: fresh.access_token, eventId });
  } catch (error) {
    console.error("calendar cancel failed", error);
  }
}
async function auditEvent(
  organisationId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  branchId: unknown,
  summary: string,
  token: string,
) {
  await insert(
    "audit_events",
    {
      organisation_id: organisationId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      summary,
      after_data: { branch_id: branchId },
    },
    token,
  );
}
async function resolveBranchId(
  value: unknown,
  fallback: string | null,
  sourceLevel: string,
  token: string,
): Promise<string | null> {
  if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) return value;
  if (fallback) return fallback;
  // A branch-scoped user with no branch assignment may create an unassigned
  // record, but must never be silently placed into a branch they cannot access.
  if (sourceLevel !== "super_admin" && sourceLevel !== "platform_owner")
    return null;
  const branches = await rest<Array<{ id: string }>>(
    "branches?select=id&active=eq.true&order=name.asc&limit=1",
    token,
  );
  if (!branches[0])
    throw new Error("Create an active branch before adding CRM records.");
  return branches[0].id;
}
function nullableDay(value: unknown): string | null {
  const parsed = nullable(value);
  if (!parsed) return null;
  const date = new Date(`${parsed}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new InputError("Date is invalid.");
  return parsed.slice(0, 10);
}
function intakeFields(body: Json, excluded: string[]): Json {
  const result: Json = {};
  for (const [key, value] of Object.entries(body)) {
    if (excluded.includes(key) || typeof value !== "string") continue;
    const clean = value.trim();
    if (clean) result[key] = clean;
  }
  return result;
}
// Email and visa expiry are mandatory on the intake form: a case cannot be
// worked without a contact address, and the visa stage is meaningless without
// the expiry it is worked against.
function requiredEmail(value: unknown): string {
  const parsed = required(value, "Email address").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed))
    throw new InputError("Enter a valid email address.");
  return parsed;
}
function moneyAmount(value: unknown, label: string, allowZero = false): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0))
    throw new InputError(`${label} must be a valid amount greater than zero.`);
  return Math.round(amount * 100) / 100;
}
function invoiceCurrency(value: unknown): string {
  const currency = String(value || "AUD").trim().toUpperCase();
  if (!["AUD", "USD", "NZD", "GBP", "EUR", "CAD", "INR", "LKR"].includes(currency))
    throw new InputError("That invoice currency is not supported.");
  return currency;
}
function invoiceTypeValue(value: unknown): string {
  const parsed = String(value || "professional_fee").trim().toLowerCase();
  if (![
    "professional_fee",
    "service_fee",
    "tuition",
    "application_fee",
    "visa_fee",
    "disbursement",
  ].includes(parsed))
    throw new InputError("That invoice type is not recognised.");
  return parsed;
}
function requiredDay(value: unknown, label: string): string {
  const parsed = required(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(Date.parse(parsed)))
    throw new InputError(`${label} must be a valid date.`);
  return parsed;
}
function required(value: unknown, label: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
function nullable(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function nullableDate(value: unknown): string | null {
  const parsed = nullable(value);
  return parsed ? new Date(`${parsed}T12:00:00Z`).toISOString() : null;
}
function normalHealth(value: unknown): "healthy" | "attention" | "critical" {
  return value === "critical" || value === "attention" ? value : "healthy";
}
// due_at, completed_at, submitted_at and the like are timestamptz: read as
// UTC, they need converting to the organisation's timezone or the calendar
// date shown can be a day off the one the event actually happened on.
function dateOnly(value: unknown): string {
  return orgDate(value);
}
function timeOnly(value: unknown): string {
  return orgTime(value);
}
// visa_expiry_on and current_visa_expiry are plain `date` columns with no
// time component -- there is no UTC-to-local conversion to make, so the
// string PostgREST returns is the date, unchanged.
function plainDate(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}
function fullClientName(value?: Json): string {
  return value
    ? [value.first_name, value.last_name].filter(Boolean).join(" ")
    : "";
}

// Some server adapters expose the internal worker URL as localhost even when
// the browser is on the public Netlify site. Client emails and Supabase action
// links must always return to the address the client can actually open.
function publicOrigin(request: Request): string {
  for (const configured of [process.env.NEXT_PUBLIC_APP_URL, process.env.URL]) {
    if (!configured) continue;
    try {
      return new URL(configured).origin;
    } catch {
      // Continue to the proxy headers when an optional value is malformed.
    }
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) return `${forwardedProtocol || "https"}://${host}`;
  return new URL(request.url).origin;
}
// invoices, content_templates and workflow_templates are all writable only by
// manager level and above (migration 0005). Check it here so the CRM can say
// so plainly instead of surfacing a row-level security rejection.
// The service stream is chosen explicitly on the form. Matching on the matter
// label is only a fallback for records created before the two were separated.
function serviceStream(workspace: unknown, matterType: unknown): string {
  const chosen = String(workspace ?? "").toLowerCase();
  if (chosen.includes("direct") || chosen.includes("visa") || chosen.includes("migration"))
    return "direct_visa";
  if (chosen.includes("study")) return "study_abroad";
  return /visa|migration|skill|eoi|subclass|\b\d{3}\b/i.test(String(matterType ?? ""))
    ? "direct_visa"
    : "study_abroad";
}

/**
 * Resolves the staff member a case should belong to. Intake used to show a free
 * text box, so a typed name assigned nothing; the case silently stayed with
 * whoever created it.
 */
async function resolveOwnerId(
  requested: unknown,
  fallback: string,
  token: string,
): Promise<string> {
  const asked = typeof requested === "string" ? requested.trim() : "";
  if (!asked) return fallback;
  const rows = await rest<Json[]>(
    `profiles?select=id,level,active&id=eq.${encodeURIComponent(asked)}&limit=1`,
    token,
  );
  const candidate = rows[0];
  if (!candidate) throw new InputError("That staff member is not in this organisation.");
  if (candidate.active !== true) throw new InputError("That account is deactivated.");
  if (candidate.level === "student")
    throw new InputError("A case cannot be assigned to a portal account.");
  return String(candidate.id);
}

function requireManager(role: string, action: string): void {
  if (role !== "super_admin" && role !== "admin")
    throw new LiveAccessError(
      403,
      `Only a manager or administrator can ${action}.`,
    );
}

class InputError extends Error {}

// PostgREST wraps a raised exception as {"code":…,"message":…}. Those messages
// are written for the person using the CRM, so pass them through rather than
// replacing them with a generic failure.
function databaseMessage(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail) as { message?: unknown };
    return typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message
      : null;
  } catch {
    return null;
  }
}
/** Turns a raised-exception SupabaseError into the InputError apiError shows
 * the user, falling back to a generic message for anything else. */
function databaseError(error: unknown, fallback: string): Error {
  if (error instanceof SupabaseError) {
    const message = databaseMessage(error.message);
    if (message) return new InputError(message);
  }
  return error instanceof Error ? error : new Error(fallback);
}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  if (error instanceof SupabaseError) {
    console.error(error.message);
    return Response.json(
      {
        ok: false,
        error:
          "The database rejected this action. Check the account role and required fields.",
      },
      {
        status: error.status >= 400 && error.status < 500 ? error.status : 503,
      },
    );
  }
  console.error(error);
  return Response.json(
    { ok: false, error: "The CRM could not complete this action." },
    { status: 500 },
  );
}
