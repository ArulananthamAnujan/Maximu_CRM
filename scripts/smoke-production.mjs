#!/usr/bin/env node
// Checks a live deployment the way the go-live runbook asks, from the outside:
// the sign-in page and its security headers, an administrator sign-in, the
// health endpoint and the database schema version, the workspace, every
// integration's state, a report export, and (optionally) a client sign-in.
//
//   SMOKE_URL=https://crm.example.com \
//   SMOKE_EMAIL=admin@agency.example SMOKE_PASSWORD=... \
//   [SMOKE_CLIENT_EMAIL=... SMOKE_CLIENT_PASSWORD=...] \
//   npm run smoke:production
//
// Prints PASS / WARN / FAIL per check and exits 1 when anything FAILs.
// Credentials are read from the environment only and never written anywhere.

const url = (process.env.SMOKE_URL || process.argv[2] || "").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL || "";
const password = process.env.SMOKE_PASSWORD || "";
const clientEmail = process.env.SMOKE_CLIENT_EMAIL || "";
const clientPassword = process.env.SMOKE_CLIENT_PASSWORD || "";
if (!url || !email || !password) {
  console.error("Set SMOKE_URL, SMOKE_EMAIL and SMOKE_PASSWORD (an administrator account).");
  process.exit(2);
}

const results = [];
const record = (level, check, detail = "") => { results.push({ level, check, detail }); console.log(`${level.padEnd(4)} ${check}${detail ? ` — ${detail}` : ""}`); };
const pass = (c, d) => record("PASS", c, d), warn = (c, d) => record("WARN", c, d), fail = (c, d) => record("FAIL", c, d);

class Session {
  cookie = "";
  async fetch(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (this.cookie) headers.cookie = this.cookie;
    const response = await fetch(`${url}${path}`, { ...init, headers, redirect: "manual" });
    const set = response.headers.getSetCookie?.() ?? [];
    if (set.length) this.cookie = [this.cookie, ...set.map((c) => c.split(";")[0])].filter(Boolean).join("; ");
    return response;
  }
  async json(path, init) { const r = await this.fetch(path, init); let body = null; try { body = await r.json(); } catch { body = null; } return { status: r.status, ok: r.ok, body, headers: r.headers }; }
  async signIn(who, address, secret) {
    const r = await this.json("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address, password: secret }) });
    if (!r.ok || !this.cookie) { fail(`${who} sign-in`, `HTTP ${r.status} ${r.body?.error || ""}`.trim()); return false; }
    pass(`${who} sign-in`, address);
    return true;
  }
}

// 1. The sign-in page and the headers the deployment promises.
try {
  const r = await fetch(`${url}/`, { redirect: "manual" });
  const html = await r.text();
  if (r.status === 200 && /maximus/i.test(html)) pass("Sign-in page", `HTTP 200, ${Math.round(html.length / 1024)} KB`);
  else fail("Sign-in page", `HTTP ${r.status}`);
  const need = { "strict-transport-security": "HSTS", "content-security-policy": "CSP", "x-frame-options": "clickjacking", "x-content-type-options": "content type" };
  const missing = Object.entries(need).filter(([h]) => !r.headers.get(h)).map(([, n]) => n);
  if (missing.length) fail("Security headers", `missing ${missing.join(", ")}`); else pass("Security headers", "HSTS, CSP, X-Frame-Options, X-Content-Type-Options");
  if (!url.startsWith("https://")) fail("HTTPS", "the deployment URL is not https");
} catch (error) {
  fail("Sign-in page", String(error.message || error));
}

// 2. An administrator's view: health, schema, workspace, integrations, export.
const admin = new Session();
if (await admin.signIn("Administrator", email, password)) {
  const health = await admin.json("/api/crm/health");
  if (!health.ok) fail("Health endpoint", `HTTP ${health.status} ${health.body?.error || ""}`.trim());
  else {
    pass("Database", `${health.body.database}, ${health.body.latencyMs} ms`);
    const schema = health.body.schema;
    if (!schema) warn("Schema version", "this deployment does not report one; deploy the current build");
    else if (schema.upToDate) pass("Schema version", `${schema.found} matches the build`);
    else fail("Schema version", schema.hint);
    const r = health.body.readiness || {};
    const counts = ["active_branches", "active_internal_users", "retention_rules"].map((k) => `${k.replace(/_/g, " ")} ${r[k] ?? "?"}`).join(", ");
    (Number(r.active_branches) > 0 && Number(r.active_internal_users) > 0 ? pass : fail)("Readiness", counts);
    if (Number(r.retention_rules) === 0) fail("Retention rules", "none recorded; apply the case-file migration's seven-year defaults");
    if (Number(r.open_incidents) > 0) warn("Open incidents", String(r.open_incidents));
    if (Number(r.pending_import_rows) > 0) warn("Import rows to resolve", String(r.pending_import_rows));
  }

  const ws = await admin.json("/api/crm/workspace");
  if (!ws.ok) fail("Workspace", `HTTP ${ws.status} ${ws.body?.error || ""}`.trim());
  else {
    const b = ws.body;
    pass("Workspace", `${b.identity?.role} · ${b.branches?.length ?? 0} offices · ${b.profiles?.length ?? 0} staff · ${b.cases?.length ?? 0} cases loaded`);
    if (b.schemaWarning) fail("Lifecycle migration", b.schemaWarning);
    if (b.schemaUpdate) fail("Pending migration", b.schemaUpdate);
    if (Array.isArray(b.degraded) && b.degraded.length) warn("Degraded records", b.degraded.join(", "));
    if (!b.capabilities?.protectedFields) fail("Passport encryption", "FIELD_ENCRYPTION_KEY is not set; passport numbers cannot be stored");
    if (!b.capabilities?.documentStorage) fail("Shared Drive", "not configured; no file can be uploaded");
  }

  const integrations = await admin.json("/api/crm/integrations");
  if (!integrations.ok) fail("Integrations", `HTTP ${integrations.status}`);
  else {
    const required = { email: "client emails and document requests", drive: "document storage", field_encryption: "passport numbers", retention: "record retention", backup_restore: "backups", monitoring: "incident alerts", security_headers: "security headers", staff_logins: "creating staff logins" };
    for (const row of integrations.body.integrations ?? []) {
      const label = `Integration: ${row.name}`;
      if (row.state === "connected") pass(label, row.detail?.slice(0, 90));
      else if (row.state === "not_built") continue;
      else if (required[row.key]) fail(label, `${row.state.replace("_", " ")} — ${required[row.key]}${row.setup?.length ? `; set ${row.setup.join(", ")}` : ""}`);
      else warn(label, `${row.state.replace("_", " ")} (optional)${row.setup?.length ? `; set ${row.setup.join(", ")}` : ""}`);
    }
  }

  const exportResponse = await admin.json(`/api/crm/reports?export=true&from=2000-01-01&to=2100-12-31`);
  if (exportResponse.ok && exportResponse.body?.sheets) pass("Report export", `${exportResponse.body.sheets.length} sheets`);
  else fail("Report export", `HTTP ${exportResponse.status} ${exportResponse.body?.error || ""}`.trim());
  await admin.fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}

// 3. A client's view of the portal, when a test client account is given.
if (clientEmail && clientPassword) {
  const client = new Session();
  if (await client.signIn("Client", clientEmail, clientPassword)) {
    const ws = await client.json("/api/crm/workspace");
    if (!ws.ok) fail("Client portal", `HTTP ${ws.status}`);
    else if (ws.body.identity?.role !== "client") fail("Client portal", `signed in as ${ws.body.identity?.role}, not a client`);
    else if (!(ws.body.cases?.length)) warn("Client portal", "the account is not linked to a case yet");
    else pass("Client portal", `linked to ${ws.body.cases[0].id}`);
    await client.fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }
} else {
  warn("Client portal", "not checked; set SMOKE_CLIENT_EMAIL and SMOKE_CLIENT_PASSWORD for a test client");
}

const fails = results.filter((r) => r.level === "FAIL").length, warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${results.length} checks: ${results.length - fails - warns} passed, ${warns} warnings, ${fails} failed.`);
process.exit(fails ? 1 : 0);
