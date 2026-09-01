import { createHash } from "node:crypto";

const TABLES = [
  "organisations", "branches", "profiles", "clients", "cases", "case_collaborators",
  "education_applications", "visa_matters", "tasks", "appointments", "documents",
  "email_threads", "email_messages", "invoices", "payments", "payment_receipts",
  "credit_notes", "invoice_reminders", "reconciliation_runs", "audit_events",
  "organisation_settings", "course_source_registry",
];
const env = (name) => globalThis.Netlify?.env?.get(name) ?? "";
const base = () => String(env("SUPABASE_URL")).replace(/\/$/, "");
const key = () => env("SUPABASE_SERVICE_ROLE_KEY");

async function request(path, { method = "GET", body, headers = {} } = {}) {
  if (!base() || !key()) throw new Error("Supabase production-operation credentials are missing.");
  const response = await fetch(`${base()}${path}`, {
    method,
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}
const rest = (query, options) => request(`/rest/v1/${query}`, options);

async function allRows(table, organisationId) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const orgFilter = table === "organisations" ? `id=eq.${organisationId}` : `organisation_id=eq.${organisationId}`;
    const page = await rest(`${table}?select=*&${orgFilter}&limit=1000&offset=${offset}`).catch((error) => {
      if (/404|does not exist/i.test(String(error.message))) return [];
      throw error;
    });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function upload(path, content) {
  const response = await fetch(`${base()}/storage/v1/object/crm-backups/${path}`, {
    method: "POST",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "x-upsert": "true" },
    body: content,
  });
  if (!response.ok) throw new Error(`Backup upload failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
}

async function backupOrganisation(org) {
  const run = (await rest("backup_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: { organisation_id: org.id, status: "running" } }))[0];
  try {
    const entries = await Promise.all(TABLES.map(async (table) => [table, await allRows(table, org.id)]));
    const data = Object.fromEntries(entries);
    const payload = JSON.stringify({ format: "maximus-crm-backup-v1", organisationId: org.id, createdAt: new Date().toISOString(), tables: data });
    const checksum = createHash("sha256").update(payload).digest("hex");
    const path = `${org.id}/${new Date().toISOString().slice(0, 10)}/${run.id}.json`;
    await upload(path, payload);
    const counts = Object.fromEntries(entries.map(([table, rows]) => [table, rows.length]));
    await rest(`backup_runs?id=eq.${run.id}`, { method: "PATCH", body: { status: "completed", object_path: path, table_counts: counts, checksum, bytes: Buffer.byteLength(payload), completed_at: new Date().toISOString() } });
    return { runId: run.id, path, checksum, payload, counts };
  } catch (error) {
    await rest(`backup_runs?id=eq.${run.id}`, { method: "PATCH", body: { status: "failed", error_message: String(error.message).slice(0, 1000), completed_at: new Date().toISOString() } }).catch(() => null);
    throw error;
  }
}

async function restoreDrill(org, backup) {
  const drill = (await rest("restore_drills", { method: "POST", headers: { Prefer: "return=representation" }, body: { organisation_id: org.id, backup_run_id: backup.runId, status: "running" } }))[0];
  try {
    const parsed = JSON.parse(backup.payload);
    const checksum = createHash("sha256").update(backup.payload).digest("hex");
    const checks = {
      format: parsed.format === "maximus-crm-backup-v1",
      organisation: parsed.organisationId === org.id,
      checksum: checksum === backup.checksum,
      coreTables: ["clients", "cases", "documents", "invoices", "audit_events"].every((table) => Array.isArray(parsed.tables?.[table])),
      foreignKeys: (parsed.tables.cases || []).every((row) => (parsed.tables.clients || []).some((client) => client.id === row.client_id)),
    };
    if (Object.values(checks).some((value) => !value)) throw new Error("Restore archive validation failed.");
    await rest(`restore_drills?id=eq.${drill.id}`, { method: "PATCH", body: { status: "passed", checks, completed_at: new Date().toISOString() } });
    return checks;
  } catch (error) {
    await rest(`restore_drills?id=eq.${drill.id}`, { method: "PATCH", body: { status: "failed", error_message: String(error.message).slice(0, 1000), completed_at: new Date().toISOString() } }).catch(() => null);
    throw error;
  }
}

async function probe(org, component, task) {
  const started = Date.now();
  try {
    const details = await task();
    await rest("operational_checks", { method: "POST", body: { organisation_id: org.id, component, status: "healthy", latency_ms: Date.now() - started, details } });
    return { component, status: "healthy" };
  } catch (error) {
    const message = String(error.message || error).slice(0, 1000);
    await rest("operational_checks", { method: "POST", body: { organisation_id: org.id, component, status: "failed", latency_ms: Date.now() - started, details: { error: message } } }).catch(() => null);
    const open = await rest(`operational_incidents?select=id&organisation_id=eq.${org.id}&component=eq.${encodeURIComponent(component)}&status=neq.resolved&limit=1`).catch(() => []);
    if (!open.length) {
      await rest("operational_incidents", { method: "POST", body: { organisation_id: org.id, severity: component === "database" || component === "backup_restore" ? "critical" : "high", component, summary: message, status: "open", details: { automatic: true } } }).catch(() => null);
      if (env("INCIDENT_ALERT_WEBHOOK_URL")) await fetch(env("INCIDENT_ALERT_WEBHOOK_URL"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Maximus CRM ${component} failed: ${message}`, organisationId: org.id }) }).catch(() => null);
    }
    return { component, status: "failed", error: message };
  }
}

async function recoverJobs(org) {
  const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await rest(`integration_jobs?organisation_id=eq.${org.id}&status=eq.processing&locked_at=lt.${encodeURIComponent(stale)}`, { method: "PATCH", body: { status: "queued", locked_at: null, available_at: new Date().toISOString(), last_error: "Recovered after processing timeout" } });
  const failed = await rest(`integration_jobs?select=id,attempts&organisation_id=eq.${org.id}&status=eq.failed&attempts=lt.5&limit=100`);
  for (const job of failed) {
    const delayMinutes = Math.min(240, 2 ** Math.max(1, Number(job.attempts || 1)));
    await rest(`integration_jobs?id=eq.${job.id}`, { method: "PATCH", body: { status: "queued", available_at: new Date(Date.now() + delayMinutes * 60000).toISOString(), locked_at: null } });
  }
  return { recovered: failed.length };
}

async function processInvoiceReminders(org) {
  const [settings] = await rest(`organisation_settings?select=overdue_reminders_enabled&organisation_id=eq.${org.id}&limit=1`);
  if (settings?.overdue_reminders_enabled) {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await rest(`invoices?select=id&organisation_id=eq.${org.id}&due_on=lt.${today}&state=in.(issued,part_paid,overdue)&limit=500`);
    for (const invoice of overdue) {
      const existing = await rest(`invoice_reminders?select=id&invoice_id=eq.${invoice.id}&reminder_type=eq.overdue&scheduled_for=gte.${today}T00:00:00Z&limit=1`);
      if (!existing.length) await rest("invoice_reminders", { method: "POST", body: { organisation_id: org.id, invoice_id: invoice.id, reminder_type: "overdue", status: "queued" } });
    }
  }
  const queued = await rest(`invoice_reminders?select=id,invoice_id,reminder_type&organisation_id=eq.${org.id}&status=eq.queued&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&limit=100`);
  if (!queued.length) return { queued: 0, sent: 0 };
  if (!env("RESEND_API_KEY") || !env("RESEND_FROM_EMAIL")) throw new Error("Overdue reminders are queued but client email delivery is not configured.");
  let sent = 0;
  for (const reminder of queued) {
    try {
      const [invoice] = await rest(`invoices?select=id,invoice_number,total,paid,currency,due_on,client_id,case_id&id=eq.${reminder.invoice_id}&limit=1`);
      if (!invoice) throw new Error("Invoice no longer exists.");
      const [client] = await rest(`clients?select=email,first_name,last_name&id=eq.${invoice.client_id}&limit=1`);
      if (!client?.email) throw new Error("Client has no email address.");
      const balance = Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0));
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env("RESEND_FROM_EMAIL"),
          to: [client.email],
          subject: `Payment reminder — ${invoice.invoice_number}`,
          text: `Hello ${client.first_name || ""},\n\nThis is a reminder that ${invoice.currency} ${balance.toFixed(2)} remains outstanding on ${invoice.invoice_number}, due ${invoice.due_on || "now"}. Please contact your Maximus case team if you have already paid or need assistance.\n\nMaximus Education and Migration`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Email provider rejected the reminder (${response.status}).`);
      await rest(`invoice_reminders?id=eq.${reminder.id}`, { method: "PATCH", body: { status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.id || null } });
      await rest("audit_events", { method: "POST", body: { organisation_id: org.id, action: "invoice.reminder_sent", resource_type: "invoice", resource_id: invoice.id, case_id: invoice.case_id, summary: `Sent ${reminder.reminder_type} reminder for ${invoice.invoice_number}` } });
      sent += 1;
    } catch (error) {
      await rest(`invoice_reminders?id=eq.${reminder.id}`, { method: "PATCH", body: { status: "failed", error_message: String(error.message).slice(0, 1000) } }).catch(() => null);
    }
  }
  return { queued: queued.length, sent };
}

async function verifySecurityHeaders() {
  const site = env("URL") || env("PRODUCTION_URL");
  if (!site) throw new Error("Production URL is not available to the monitor.");
  const response = await fetch(site, { redirect: "follow" });
  if (!response.ok) throw new Error(`Production returned HTTP ${response.status}.`);
  const required = ["strict-transport-security", "x-content-type-options", "x-frame-options", "content-security-policy", "referrer-policy"];
  const missing = required.filter((name) => !response.headers.get(name));
  if (missing.length) throw new Error(`Security headers missing: ${missing.join(", ")}`);
  return { httpStatus: response.status, headers: required };
}

export default async function handler(request) {
  if (!env("OPERATIONS_JOB_SECRET") || request.headers.get("x-operations-secret") !== env("OPERATIONS_JOB_SECRET"))
    return new Response(null, { status: 401 });
  const organisations = await rest("organisations?select=id,name&order=created_at.asc");
  const results = [];
  for (const org of organisations) {
    const backup = await probe(org, "backup_restore", async () => {
      const created = await backupOrganisation(org);
      const drill = await restoreDrill(org, created);
      return { backupRunId: created.runId, objectPath: created.path, checks: drill };
    });
    const checks = await Promise.all([
      probe(org, "database", async () => ({ organisations: (await rest(`organisations?select=id&id=eq.${org.id}`)).length })),
      probe(org, "security_headers", verifySecurityHeaders),
      probe(org, "integration_recovery", () => recoverJobs(org)),
      probe(org, "invoice_reminders", () => processInvoiceReminders(org)),
      probe(org, "gmail_configuration", async () => {
        if (!env("GOOGLE_OAUTH_CLIENT_ID") || !env("GOOGLE_OAUTH_CLIENT_SECRET")) throw new Error("Gmail OAuth is not configured.");
        return { configured: true };
      }),
      probe(org, "drive_configuration", async () => {
        if (!env("GOOGLE_SERVICE_ACCOUNT_EMAIL") || !env("GOOGLE_PRIVATE_KEY") || !env("GOOGLE_SHARED_DRIVE_ID")) throw new Error("Google Shared Drive is not configured.");
        return { configured: true };
      }),
    ]);
    results.push({ organisationId: org.id, checks: [backup, ...checks] });
  }
  return new Response(JSON.stringify({ ok: results.every((item) => item.checks.every((check) => check.status === "healthy")), results }), { status: 200, headers: { "Content-Type": "application/json" } });
}
