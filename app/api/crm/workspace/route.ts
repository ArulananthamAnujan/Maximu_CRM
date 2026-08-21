import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const token = session.accessToken;
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
    ] = await Promise.all([
      safeRest(
        "clients?select=*&archived_at=is.null&order=updated_at.desc&limit=200",
        token,
      ),
      safeRest("cases?select=*&order=opened_at.desc&limit=200", token),
      safeRest("workflow_stages?select=*&order=position.asc", token),
      safeRest("tasks?select=*&order=created_at.desc&limit=300", token),
      safeRest(
        "appointments?select=*&order=starts_at.asc&limit=300",
        token,
      ),
      safeRest("documents?select=*&order=created_at.desc&limit=300", token),
      safeRest(
        "email_threads?select=*&order=last_message_at.desc&limit=200",
        token,
      ),
      safeRest(
        "email_messages?select=*&order=created_at.desc&limit=300",
        token,
      ),
      safeRest("invoices?select=*&order=issued_on.desc&limit=300", token),
      safeRest(
        "content_templates?select=*&order=updated_at.desc&limit=200",
        token,
      ),
      safeRest(
        "workflow_templates?select=*&order=created_at.desc&limit=100",
        token,
      ),
      safeRest(
        "audit_events?select=*&order=occurred_at.desc&limit=100",
        token,
      ),
      safeRest(
        "branches?select=id,name,code,country_code&active=eq.true&order=name.asc",
        token,
      ),
      safeRest(
        "profiles?select=id,display_name,email,branch_id,level,active&active=eq.true&order=display_name.asc",
        token,
      ),
      safeRest(
        "roles?select=id,name,data_scope,system_role&system_role=eq.false&order=name.asc",
        token,
      ),
    ]);

    const clientById = new Map(clients.map((row) => [String(row.id), row]));
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
          type: row.service_type,
          target: row.target ?? "",
          stage: stage.name ?? client.current_lifecycle ?? "Enquiry",
          owner: owner.display_name ?? "",
          branch: branch.name ?? "",
          branchId: row.branch_id,
          due: dateOnly(row.due_at),
          health: row.health === "closed" ? "healthy" : row.health,
          progress: Number(row.progress ?? 0),
          status: row.closed_at
            ? "completed"
            : row.health === "attention"
              ? "waiting"
              : "active",
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
          createdAt: row.created_at,
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
    };
    return appendRefreshCookies(
      Response.json({ ok: true, ...payload }),
      session.refreshed,
    );
  } catch (error) {
    return apiError(error);
  }
}

async function safeRest(path: string, token: string): Promise<Json[]> {
  try {
    return await rest<Json[]>(path, token);
  } catch (error) {
    console.error(`Workspace dataset unavailable: ${path.split("?")[0]}`, error);
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
    if (session.identity.role === "client" && action !== "message")
      throw new LiveAccessError(
        403,
        "This action is not available in the client portal.",
      );

    if (action === "update_case") {
      const displayName = required(body.name, "Client name");
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
          email: nullable(body.email),
          mobile: nullable(body.phone),
          updated_at: new Date().toISOString(),
        },
        token,
      );
      await patchRow(
        "cases",
        caseId,
        {
          service_type: /visa|migration|skill|eoi/i.test(
            String(body.type ?? ""),
          )
            ? "direct_visa"
            : "study_abroad",
          target: nullable(body.target),
          next_action: nullable(body.stage),
          due_at: nullableDate(body.due),
          health: normalHealth(body.health),
          progress: Number(body.progress ?? 0),
        },
        token,
      );
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
      const parts = displayName.split(/\s+/);
      const firstName = parts.shift() || displayName;
      const lastName = parts.join(" ") || "—";
      const branchId = await resolveBranchId(
        body.branchId,
        session.identity.branchId,
        token,
      );
      const clientId = crypto.randomUUID();
      const caseId = crypto.randomUUID();
      const now = new Date().toISOString();
      const kind = /visa|migration|skill|eoi/i.test(String(body.type ?? ""))
        ? "direct_visa"
        : "study_abroad";
      const client = {
        id: clientId,
        organisation_id: org,
        branch_id: branchId,
        crm_id: `MAX-${new Date().getUTCFullYear()}-${clientId.slice(0, 8).toUpperCase()}`,
        first_name: firstName,
        last_name: lastName,
        email: nullable(body.email),
        mobile: nullable(body.phone),
        owner_id: actor,
        current_lifecycle: "enquiry",
        custom_fields: {},
        updated_at: now,
      };
      await insert("clients", client, token);
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
            owner_id: actor,
            health: normalHealth(body.health),
            priority: "medium",
            progress: Number(body.progress ?? 0),
            target: nullable(body.target),
            next_action: nullable(body.stage),
            due_at: nullableDate(body.due),
            custom_fields: { intake_type: nullable(body.type) },
          },
          token,
        );
      } catch (error) {
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
        `Created ${kind === "study_abroad" ? "student" : "migration"} case for ${displayName}`,
        token,
      );
      return Response.json({ ok: true });
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
          metadata: { upload_pending: true },
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

    if (action === "mutate") {
      if (session.identity.role === "client")
        throw new LiveAccessError(
          403,
          "Client records can only be changed through approved portal actions.",
        );
      const resource = required(body.resource, "Resource");
      const id = required(body.id, "Record id");
      const operation = required(body.operation, "Operation");
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
  token: string,
): Promise<string> {
  if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) return value;
  if (fallback) return fallback;
  const branches = await rest<Array<{ id: string }>>(
    "branches?select=id&active=eq.true&order=name.asc&limit=1",
    token,
  );
  if (!branches[0])
    throw new Error("Create an active branch before adding CRM records.");
  return branches[0].id;
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
class InputError extends Error {}
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
