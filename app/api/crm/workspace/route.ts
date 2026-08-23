import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { driveConfigured } from "@/server/google-drive";
import { protectionConfigured } from "@/server/protected-fields";

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
      templates,
      workflowTemplates,
      audit,
      branches,
      profiles,
      roles,
      applications,
      visaMatters,
      visaHistory,
    ] = await Promise.all([
      safeRest(
        "clients?select=*&archived_at=is.null&order=updated_at.desc&limit=200",
        token,
        degraded,
      ),
      safeRest("cases?select=*&order=opened_at.desc&limit=200", token, degraded),
      safeRest("workflow_stages?select=*&order=position.asc", token, degraded),
      safeRest("tasks?select=*&order=created_at.desc&limit=300", token, degraded),
      safeRest(
        "appointments?select=*&order=starts_at.asc&limit=300",
        token,
        degraded,
      ),
      safeRest("documents?select=*&order=created_at.desc&limit=300", token, degraded),
      safeRest(
        "email_threads?select=*&order=last_message_at.desc&limit=200",
        token,
        degraded,
      ),
      safeRest(
        "email_messages?select=*&order=sent_at.desc.nullslast&limit=300",
        token,
        degraded,
      ),
      safeRest("invoices?select=*&order=issued_on.desc&limit=300", token, degraded),
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
    ]);

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
    const branchById = new Map(branches.map((row) => [String(row.id), row]));
    const profileById = new Map(profiles.map((row) => [String(row.id), row]));
    const threadById = new Map(threads.map((row) => [String(row.id), row]));
    const workflowStages = new Map<string, Json[]>();
    for (const stage of stages) {
      const key = String(stage.template_id);
      workflowStages.set(key, [...(workflowStages.get(key) ?? []), stage]);
    }

    const payload = {
      identity: session.identity,
      degraded,
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
          branch: branch.name ?? "",
          branchId: row.branch_id,
          due: dateOnly(row.due_at),
          health: row.health === "closed" ? "healthy" : row.health,
          progress: Number(row.progress ?? 0),
          lifecycleStage: (row.lifecycle_stage as LifecycleStage) ?? "enquiry",
          visaExpiry: dateOnly(row.visa_expiry_on),
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
      invoices: invoices.map((row) => ({
        id: row.id,
        client: fullClientName(clientById.get(String(row.client_id))),
        amount: Number(row.total ?? 0),
        due: String(row.due_on ?? ""),
        status: row.state === "paid" ? "Paid" : "Unpaid",
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
          currentVisaExpiry: dateOnly(row.current_visa_expiry),
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
    const PORTAL_ACTIONS = ["message", "appointment_request"];
    if (
      session.identity.role === "client" &&
      !PORTAL_ACTIONS.includes(action)
    )
      throw new LiveAccessError(
        403,
        "This action is not available in the client portal.",
      );

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
      const startsAt = new Date(
        `${required(body.date, "Date")}T${String(body.time || "09:00")}:00`,
      ).toISOString();
      await insert(
        "appointments",
        {
          id,
          organisation_id: org,
          case_id: nullable(body.caseId),
          owner_id: actor,
          title: required(body.title, "Title"),
          appointment_type: String(body.appointmentType || "Consultation"),
          starts_at: startsAt,
          ends_at: new Date(
            new Date(startsAt).getTime() + 60 * 60 * 1000,
          ).toISOString(),
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
      return Response.json({ ok: true });
    }

    if (action === "document") {
      const id = crypto.randomUUID();
      const clientId = required(body.clientId, "Client");
      await insert(
        "documents",
        {
          id,
          organisation_id: org,
          client_id: clientId,
          case_id: nullable(body.caseId),
          document_type: String(body.folder || "General"),
          display_name: required(body.title, "Document title"),
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
      return Response.json({ ok: true });
    }

    if (action === "message") {
      const threadId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const recipient = required(body.to, "Recipient");
      await insert(
        "email_threads",
        {
          id: threadId,
          organisation_id: org,
          client_id: nullable(body.clientId),
          case_id: nullable(body.caseId),
          subject: required(body.subject, "Subject"),
          assigned_to: actor,
          status: "draft",
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
          direction: "outbound",
          body_preview: required(body.body, "Message"),
          delivery_state: "draft",
          created_by: actor,
        },
        token,
      );
      await auditEvent(
        org,
        actor,
        "message.drafted",
        "email_message",
        messageId,
        session.identity.branchId,
        `Saved message draft: ${String(body.subject)}`,
        token,
      );
      return Response.json({ ok: true });
    }

    if (action === "invoice") {
      requireManager(session.identity.role, "raise an invoice");
      const id = crypto.randomUUID();
      const total = Number(body.amount ?? 0);
      await insert(
        "invoices",
        {
          id,
          organisation_id: org,
          client_id: required(body.clientId, "Client"),
          case_id: nullable(body.caseId),
          invoice_number: `INV-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`,
          invoice_type: "professional_fee",
          currency: "AUD",
          subtotal: total,
          total,
          state: "issued",
          issued_on: new Date().toISOString().slice(0, 10),
          due_on: nullable(body.due),
          created_by: actor,
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
        `Created invoice for $${total.toFixed(2)}`,
        token,
      );
      return Response.json({ ok: true });
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

    if (action === "assign") {
      // Reassignment is a management action: it changes who is accountable for
      // the case and who sees it in their queue.
      if (
        session.identity.role !== "super_admin" &&
        session.identity.role !== "admin"
      )
        throw new LiveAccessError(
          403,
          "Only an administrator can reassign a case.",
        );
      const caseId = required(body.caseId, "Case");
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

      await patchRow("cases", caseId, { owner_id: ownerId }, token);
      await auditEvent(
        org,
        actor,
        "case.reassigned",
        "case",
        caseId,
        session.identity.branchId,
        `Reassigned case to ${String(candidate.display_name ?? "a colleague")}`,
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
        await deleteRow("appointments", id, token);
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
async function patchRow(table: string, id: string, value: Json, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    },
    token,
  );
}
async function deleteRow(table: string, id: string, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
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
function dateOnly(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}
function timeOnly(value: unknown): string {
  return typeof value === "string" ? value.slice(11, 16) : "";
}
function fullClientName(value?: Json): string {
  return value
    ? [value.first_name, value.last_name].filter(Boolean).join(" ")
    : "";
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
