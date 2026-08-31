const OFFICIAL_CATALOGUES = [
  {
    source: "au_cricos",
    country: "Australia",
    discovery: "https://data.gov.au/data/api/3/action/package_show?id=cricos",
  },
];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const first = (row, aliases) => {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([key]) => clean(key).toLowerCase().replace(/[^a-z0-9]/g, "") === alias);
    if (found && clean(found[1])) return clean(found[1]);
  }
  return "";
};
const number = (value) => {
  const parsed = Number(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const safeUrl = (value) => {
  try { const parsed = new URL(clean(value)); return /^https?:$/.test(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
};

export function parseCatalogueCsv(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let at = 0; at < input.length; at += 1) {
    const char = input[at];
    if (quoted) {
      if (char === '"' && input[at + 1] === '"') { field += '"'; at += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some((value) => clean(value))).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

async function supabase(path, { method = "GET", body } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase catalogue sync credentials are not configured.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Catalogue database request failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function organisationId() {
  if (process.env.COURSE_FINDER_ORGANISATION_ID) return process.env.COURSE_FINDER_ORGANISATION_ID;
  const organisations = await supabase("organisations?select=id&order=created_at.asc&limit=2");
  if (organisations.length !== 1) throw new Error("COURSE_FINDER_ORGANISATION_ID is required when more than one organisation exists.");
  return organisations[0].id;
}

async function discoverFeeds(definition) {
  const response = await fetch(definition.discovery, { headers: { Accept: "application/json", "User-Agent": "Maximus-CRM-Course-Catalog/1.0" } });
  if (!response.ok) throw new Error(`${definition.source} discovery failed (${response.status}).`);
  const result = await response.json();
  return (result?.result?.resources || [])
    .filter((resource) => /csv/i.test(`${resource.format || ""} ${resource.mimetype || ""} ${resource.url || ""}`))
    .map((resource) => ({ ...definition, url: resource.url, sourceUrl: resource.url, resourceName: resource.name || "Official catalogue" }));
}

async function normaliseFeed(feed, org, verifiedAt) {
  const response = await fetch(feed.url, { headers: { Accept: "text/csv,*/*", "User-Agent": "Maximus-CRM-Course-Catalog/1.0" } });
  if (!response.ok) throw new Error(`${feed.source} download failed (${response.status}).`);
  const rows = parseCatalogueCsv(await response.text());
  const institutions = new Map();
  const courses = [];
  for (const row of rows) {
    const institutionName = first(row, ["providername", "institutionname", "universityname", "provider"]);
    const courseName = first(row, ["coursename", "course", "qualificationname", "programname"]);
    if (!institutionName || !courseName) continue;
    const providerCode = first(row, ["providercode", "cricosprovidercode", "institutioncode"]);
    const courseCode = first(row, ["coursecode", "cricoscoursecode", "programcode"]);
    const institutionKey = providerCode || institutionName.toLowerCase();
    institutions.set(institutionKey, {
      organisation_id: org,
      source_system: feed.source,
      source_key: institutionKey,
      external_code: providerCode || null,
      name: institutionName,
      country: feed.country,
      country_code: feed.country === "Australia" ? "AU" : feed.countryCode || null,
      city: first(row, ["city", "location", "town"]) || null,
      website: safeUrl(first(row, ["providerwebsite", "institutionwebsite", "website"])),
      source_url: feed.sourceUrl,
      source_updated_at: verifiedAt,
      last_verified_at: verifiedAt,
      active: true,
    });
    courses.push({ row, institutionKey, courseName, courseCode });
  }
  return { institutions: [...institutions.values()], courses };
}

async function inBatches(values, size, task) {
  for (let at = 0; at < values.length; at += size) await task(values.slice(at, at + size));
}

async function syncFeed(feed, org) {
  const verifiedAt = new Date().toISOString();
  const run = await supabase("course_catalog_sync_runs", { method: "POST", body: { organisation_id: org, source_system: feed.source, status: "running" } });
  const runId = run[0]?.id;
  try {
    const normalised = await normaliseFeed(feed, org, verifiedAt);
    await inBatches(normalised.institutions, 200, (body) => supabase("institutions?on_conflict=organisation_id,source_system,source_key", { method: "POST", body }));
    const stored = await supabase(`institutions?organisation_id=eq.${org}&source_system=eq.${encodeURIComponent(feed.source)}&select=id,source_key&limit=10000`);
    const ids = new Map(stored.map((item) => [item.source_key, item.id]));
    const courses = normalised.courses.flatMap(({ row, institutionKey, courseName, courseCode }) => {
      const institutionId = ids.get(institutionKey);
      if (!institutionId) return [];
      return [{
        organisation_id: org,
        institution_id: institutionId,
        source_system: feed.source,
        source_key: courseCode || `${institutionKey}:${courseName.toLowerCase()}`,
        external_code: courseCode || null,
        name: courseName,
        level: first(row, ["courselevel", "qualificationlevel", "level"]) || null,
        field_of_study: first(row, ["fieldofstudy", "broadareaofstudy", "studyarea"]) || null,
        duration_months: number(first(row, ["durationmonths", "duration"])),
        tuition_fee: number(first(row, ["tuitionfee", "annualtuitionfee", "fee"])),
        currency: first(row, ["currency", "currencycode"]) || (feed.country === "Australia" ? "AUD" : ""),
        intake_months: first(row, ["intakemonths", "intake", "commencementdates"]) || null,
        campus: first(row, ["campus", "locationname", "deliverylocation"]) || null,
        website: safeUrl(first(row, ["coursewebsite", "courseurl", "website"])),
        source_url: feed.sourceUrl,
        source_updated_at: verifiedAt,
        last_verified_at: verifiedAt,
        active: true,
        legacy_data: { official_resource: feed.resourceName },
      }];
    });
    await inBatches(courses, 200, (body) => supabase("courses?on_conflict=organisation_id,source_system,source_key", { method: "POST", body }));
    if (runId) await supabase(`course_catalog_sync_runs?id=eq.${runId}`, { method: "PATCH", body: { status: "completed", institutions_seen: normalised.institutions.length, courses_seen: courses.length, completed_at: new Date().toISOString() } });
    return { source: feed.source, institutions: normalised.institutions.length, courses: courses.length };
  } catch (error) {
    if (runId) await supabase(`course_catalog_sync_runs?id=eq.${runId}`, { method: "PATCH", body: { status: "failed", error_message: String(error?.message || error).slice(0, 1000), completed_at: new Date().toISOString() } }).catch(() => null);
    throw error;
  }
}

export default async function handler() {
  try {
    const org = await organisationId();
    const configured = process.env.COURSE_CATALOG_FEEDS ? JSON.parse(process.env.COURSE_CATALOG_FEEDS) : [];
    const discovery = await Promise.allSettled(OFFICIAL_CATALOGUES.map(discoverFeeds));
    const discovered = discovery.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const feeds = [...discovered, ...configured].filter((feed) => feed?.url && feed?.source && feed?.country);
    if (!feeds.length) {
      const errors = discovery.flatMap((result) => result.status === "rejected" ? [String(result.reason?.message || result.reason)] : []);
      throw new Error(errors.join("; ") || "No official CSV catalogue resources were available.");
    }
    const results = [];
    for (const feed of feeds) results.push(await syncFeed(feed, org));
    return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const config = { schedule: "17 3 * * *" };
