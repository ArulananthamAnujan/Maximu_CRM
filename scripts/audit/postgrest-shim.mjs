// A minimal PostgREST stand-in over a real PostgreSQL database, covering the
// query surface this CRM actually uses. Every request runs as the
// `authenticated` role with auth.uid() set, so real row-level security applies.
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";

const run = promisify(execFile);
// Local runs talk to a throwaway cluster over a unix socket owned by the
// `postgres` system user; CI talks to a service container over TCP. PG_SU=1
// selects the former.
const SOCK = process.env.PGSOCK || "";
const PORT = process.env.PGPORT || "5432";
const HOST = process.env.PGHOST || SOCK;
const USE_SU = process.env.PG_SU === "1";

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const ident = (v) => `"${String(v).replace(/"/g, '""')}"`;
// PostgREST filter columns can carry a JSON path, e.g. `metadata->>source`
// meaning the jsonb column `metadata`, key `source`, extracted as text.
const columnExpr = (v) => {
  const [base, ...path] = String(v).split("->>");
  return path.reduce((expr, key) => `${expr}->>${lit(key)}`, ident(base));
};

// `asAuth` false runs as the database owner, used only for the auth endpoints
// that Supabase itself would serve. Everything else runs as `authenticated`
// with auth.uid() set, so row-level security is genuinely exercised.
async function sql(text, uid, asAuth = true) {
  const user = asAuth ? "app_user" : (process.env.PGUSER || "postgres");
  const prelude = asAuth
    ? `set role authenticated; set test.uid = ${lit(uid || "")};`
    : "";
  const args = ["-h", HOST, "-p", PORT, "-U", user, "-d", process.env.PGDATABASE || "postgres",
                "-tA", "-v", "ON_ERROR_STOP=1", "-c", prelude + text];
  const invoke = () =>
    USE_SU
      ? run("su", ["postgres", "-c",
          `psql ${args.map((a) => (a.startsWith("-") ? a : JSON.stringify(a))).join(" ")}`],
          { maxBuffer: 32 * 1024 * 1024 })
      : run("psql", args, { maxBuffer: 32 * 1024 * 1024, env: process.env });

  // Every query is a process spawn, and a browser driving the application fires
  // dozens per page. A spawn that fails for want of resources is retried; a
  // statement the database rejected is not, so a real error is never masked.
  let stdout;
  for (let attempt = 0; ; attempt += 1) {
    try {
      ({ stdout } = await invoke());
      break;
    } catch (error) {
      const detail = String(error.stderr || error.message || error);
      if (attempt >= 2 || /ERROR:/.test(detail)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  // The `set role` / `set test.uid` prelude echoes "SET" lines; the result is
  // the final line.
  // json_agg pretty-prints across lines, and the `set` prelude echoes "SET".
  return stdout
    .split("\n")
    .filter((line) => line.trim() && line.trim() !== "SET")
    .join("")
    .trim();
}

// PostgREST knows each column's type from the schema cache; this shim looks it
// up so an array lands as jsonb or as a real array according to the column.
const columnTypes = new Map();
async function typesFor(table) {
  if (columnTypes.has(table)) return columnTypes.get(table);
  const out = await sql(
    `select coalesce(json_agg(json_build_object('c',column_name,'t',data_type))::text,'[]')` +
    ` from information_schema.columns where table_schema='public' and table_name=${lit(table)}`,
    null, false);
  const map = new Map(JSON.parse(out || "[]").map((row) => [row.c, row.t]));
  columnTypes.set(table, map);
  return map;
}

// value -> SQL literal, preserving JSON/array shapes Postgres understands.
function toSql(value, type) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (type === "ARRAY")
      return lit(`{${value.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")}}`);
    return `${lit(JSON.stringify(value))}::jsonb`;
  }
  if (typeof value === "object") return `${lit(JSON.stringify(value))}::jsonb`;
  return lit(value);
}

// PostgREST filter -> SQL predicate. Supports the operators this app sends.
function predicate(column, spec) {
  const [op, ...rest] = spec.split(".");
  const value = rest.join(".");
  const target = columnExpr(column);
  if (op === "eq") return `${target} = ${lit(value)}`;
  if (op === "neq") return `${target} <> ${lit(value)}`;
  if (op === "is") return `${target} is ${value === "null" ? "null" : value}`;
  if (op === "ilike") return `${target}::text ilike ${lit(value.replace(/\*/g, "%"))}`;
  if (op === "in") return `${target}::text = any(${lit(value.replace(/[()]/g, "").split(",").join("|"))}::text)`;
  if (op === "gte") return `${target} >= ${lit(value)}`;
  if (op === "lte") return `${target} <= ${lit(value)}`;
  throw new Error(`unsupported filter operator: ${op}`);
}

// `or=(a.ilike.*x*,b.ilike.*x*)` -> (a ilike '%x%' or b ilike '%x%')
function orPredicate(raw) {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  const parts = [];
  let depth = 0, current = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  if (current) parts.push(current);
  return `(${parts.map((p) => {
    const idx = p.indexOf(".");
    return predicate(p.slice(0, idx), p.slice(idx + 1));
  }).join(" or ")})`;
}

function buildWhere(params) {
  const clauses = [];
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    if (key === "or") { clauses.push(orPredicate(value)); continue; }
    clauses.push(predicate(key, value));
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function buildOrder(order) {
  if (!order) return "";
  const parts = order.split(",").map((piece) => {
    const bits = piece.split(".");
    const column = bits[0];
    const dir = bits[1] === "desc" ? "desc" : "asc";
    const nulls = bits[2] === "nullslast" ? " nulls last" : bits[2] === "nullsfirst" ? " nulls first" : "";
    return `${ident(column)} ${dir}${nulls}`;
  });
  return ` order by ${parts.join(", ")}`;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url, "http://pgrest");
    const uid = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || null;
    // Real Supabase's service-role key bypasses row-level security on every
    // endpoint, not only the /auth/v1/admin/* ones this shim special-cases --
    // exercised by an administrator sending a client their portal access,
    // which creates the profile and client_user_links row directly rather
    // than through row-level security a case officer never has on either.
    const isServiceRole =
      Boolean(process.env.SHIM_SERVICE_ROLE_KEY) &&
      req.headers.apikey === process.env.SHIM_SERVICE_ROLE_KEY;
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    try {
      if (url.pathname === "/auth/v1/token") {
        const { email } = JSON.parse(raw || "{}");
        const id = await sql(`select id::text from auth.users where email = ${lit(email)}`, null, false);
        if (!id) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        return send(200, { access_token: id, refresh_token: id, expires_in: 3600, token_type: "bearer", user: { id, email } });
      }
      if (url.pathname === "/auth/v1/user") {
        if (!uid) return send(401, { message: "invalid token" });
        const email = await sql(`select email from auth.users where id = ${lit(uid)}`, null, false);
        if (!email) return send(401, { message: "invalid token" });
        return send(200, { id: uid, email });
      }
      if (url.pathname === "/auth/v1/logout") return send(204, undefined);
      // The public settings endpoint GoTrue exposes so a client can tell
      // which social providers are switched on. Controlled by an env var so
      // the integration status test can exercise both answers.
      if (url.pathname === "/auth/v1/settings")
        return send(200, { external: { google: process.env.SHIM_GOOGLE_PROVIDER === "true" } });

      // The Supabase admin API, which the CRM uses on exactly one path: an
      // administrator creating the login for a member of staff. Real Supabase
      // requires the service-role key here, so the shim does too.
      const adminUser = /^\/auth\/v1\/admin\/users\/?([^/?]*)$/.exec(url.pathname);
      if (adminUser) {
        const key = req.headers.apikey || "";
        if (!process.env.SHIM_SERVICE_ROLE_KEY || key !== process.env.SHIM_SERVICE_ROLE_KEY)
          return send(401, { message: "service role key required" });
        if (req.method === "POST") {
          const { email } = JSON.parse(raw || "{}");
          const taken = await sql(
            `select id::text from auth.users where lower(email) = lower(${lit(email)})`, null, false);
          if (taken) return send(422, { msg: "email address already registered" });
          // Wrapped so psql prints the value alone: a bare INSERT ... RETURNING
          // also prints its "INSERT 0 1" tag, which would be read as part of it.
          const id = await sql(
            `with made as (insert into auth.users (id, email)` +
            ` values (gen_random_uuid(), lower(${lit(email)})) returning id)` +
            ` select id::text from made`,
            null, false);
          return send(200, { id, email });
        }
        if (req.method === "DELETE" && adminUser[1]) {
          await sql(`delete from auth.users where id = ${lit(adminUser[1])}`, null, false);
          return send(200, {});
        }
        if (req.method === "GET" && !adminUser[1]) {
          // Looks up an existing login by email so a demo account that predates
          // any CRM profile can be connected directly, without waiting for it
          // to sign in itself.
          const email = url.searchParams.get("email");
          const rows = await sql(
            `select json_agg(json_build_object('id', id::text, 'email', email)) from auth.users`
              + (email ? ` where lower(email) = lower(${lit(email)})` : ""),
            null, false);
          return send(200, { users: rows ? JSON.parse(rows) : [] });
        }
        return send(405, { message: "method not allowed" });
      }

      // A secure one-time sign-in link, used to set up client portal access
      // without ever handing over a password. Real Supabase requires the
      // service-role key here too.
      if (url.pathname === "/auth/v1/admin/generate_link" && req.method === "POST") {
        const key = req.headers.apikey || "";
        if (!process.env.SHIM_SERVICE_ROLE_KEY || key !== process.env.SHIM_SERVICE_ROLE_KEY)
          return send(401, { message: "service role key required" });
        const { email } = JSON.parse(raw || "{}");
        const id = await sql(`select id::text from auth.users where lower(email) = lower(${lit(email)})`, null, false);
        if (!id) return send(422, { msg: "user not found" });
        return send(200, { action_link: `http://127.0.0.1:${port}/verify?token=stub-${id}` });
      }

      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = url.pathname.replace("/rest/v1/rpc/", "");
        const args = JSON.parse(raw || "{}");
        const argList = Object.entries(args)
          .map(([k, v]) => `${ident(k)} => ${toSql(v)}`).join(", ");
        const out = await sql(
          `select coalesce(json_agg(t)::text,'[]') from (select * from public.${ident(fn)}(${argList}) ) t`, uid);
        const rows = JSON.parse(out || "[]");
        // PostgREST returns a bare value for a function returning a scalar.
        if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === fn)
          return send(200, rows[0][fn]);
        return send(200, rows);
      }

      const table = url.pathname.replace("/rest/v1/", "");
      const params = [...url.searchParams.entries()];
      const where = buildWhere(params);

      if (req.method === "GET") {
        const select = url.searchParams.get("select") || "*";
        const cols = select === "*" ? "*" : select.split(",").map((c) => ident(c.trim())).join(", ");
        const limit = url.searchParams.get("limit");
        const out = await sql(
          `select coalesce(json_agg(t)::text,'[]') from (select ${cols} from public.${ident(table)}${where}` +
          `${buildOrder(url.searchParams.get("order"))}${limit ? ` limit ${Number(limit)}` : ""}) t`,
          uid, !isServiceRole);
        return send(200, JSON.parse(out || "[]"));
      }

      if (req.method === "POST") {
        const body = JSON.parse(raw || "{}");
        const rows = Array.isArray(body) ? body : [body];
        const prefer = String(req.headers.prefer || "");
        const columns = Object.keys(rows[0]);
        const types = await typesFor(table);
        const values = rows
          .map((r) => `(${columns.map((c) => toSql(r[c], types.get(c))).join(",")})`)
          .join(",");
        const conflict = prefer.includes("merge-duplicates") ? " on conflict do nothing" : "";
        const statement = `insert into public.${ident(table)} (${columns.map(ident).join(",")}) values ${values}${conflict}`;
        // PostgREST only adds RETURNING when the caller asks for the row back.
        // That matters: RETURNING makes PostgreSQL apply the SELECT policy too.
        if (prefer.includes("return=minimal")) {
          await sql(statement, uid, !isServiceRole);
          return send(201, undefined);
        }
        const out = await sql(
          `with inserted as (${statement} returning *)` +
          ` select coalesce(json_agg(inserted)::text,'[]') from inserted`, uid, !isServiceRole);
        return send(201, JSON.parse(out || "[]"));
      }

      if (req.method === "PATCH") {
        const body = JSON.parse(raw || "{}");
        const patchTypes = await typesFor(table);
        const sets = Object.entries(body)
          .map(([k, v]) => `${ident(k)} = ${toSql(v, patchTypes.get(k))}`).join(", ");
        const statement = `update public.${ident(table)} set ${sets}${where}`;
        if (String(req.headers.prefer || "").includes("return=minimal")) {
          await sql(statement, uid, !isServiceRole);
          return send(204, undefined);
        }
        const out = await sql(
          `with updated as (${statement} returning *) select coalesce(json_agg(updated)::text,'[]') from updated`,
          uid, !isServiceRole);
        return send(200, JSON.parse(out || "[]"));
      }

      if (req.method === "DELETE") {
        await sql(`delete from public.${ident(table)}${where}`, uid, !isServiceRole);
        return send(204, undefined);
      }
      return send(405, { message: "method not allowed" });
    } catch (error) {
      const text = String(error.stderr || error.message || error);
      if (process.env.SHIM_DEBUG)
        console.error(`\n--- ${req.method} ${req.url}\n    uid=${uid}\n    body=${raw}\n    err=${text.split("\n").slice(0,3).join(" ")}`);
      // A database that could not be reached is not a rejected statement.
      // PostgREST would answer 503 there, and the difference matters: the
      // login route turns a 400 into "the password is incorrect", which is a
      // lie when the real cause is that psql could not start.
      if (!/ERROR:/.test(text)) {
        console.error(`shim: database unreachable -- ${text.split("\n")[0]}`);
        return send(503, { code: "PGRST001", message: text.trim(), details: null, hint: null });
      }
      const match = text.match(/ERROR:\s*(.+)/);
      const message = match ? match[1].trim() : text.trim();
      const missing = /does not exist|schema cache/i.test(message);
      return send(missing ? 404 : 400, { code: missing ? "PGRST202" : "P0001", message, details: null, hint: null });
    }
  });
});

const port = Number(process.env.SHIM_PORT || 8099);
server.listen(port, "127.0.0.1", () => console.log(`pgrest shim on http://127.0.0.1:${port}`));
