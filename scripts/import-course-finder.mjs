#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function parseCsv(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim() || null;
const number = (value) => {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[$,£€\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const validUrl = (value) => {
  const text = clean(value);
  if (!text) return null;
  try { const url = new URL(text); return /^https?:$/.test(url.protocol) ? text : null; } catch { return null; }
};
const timestamp = (value) => {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? "" : "Z"));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

export function normaliseLegacyRow(row, organisationId, institutionId) {
  const country = clean(row.countryName) || clean(row.country) || "Unknown";
  const institution = clean(row.universityName) || "Unknown institution";
  const institutionSourceKey = `${clean(row.country) || country}:${clean(row.university) || institution}`;
  return {
    institution: {
      organisation_id: organisationId,
      source_system: "maximus_legacy",
      source_key: institutionSourceKey,
      name: institution,
      country,
      website: validUrl(row.website),
      active: row.isActive !== "0",
    },
    course: {
      organisation_id: organisationId,
      institution_id: institutionId,
      source_system: "maximus_legacy",
      source_key: clean(row.id),
      name: clean(row.course) || "Unnamed course",
      level: clean(row.course_level) || clean(row.level),
      duration_months: number(row.duration),
      tuition_fee: number(row.tutionFee),
      currency: clean(row.currencyName) || "AUD",
      intake_months: clean(row.intake),
      campus: clean(row.campus),
      website: validUrl(row.website),
      application_fee: number(row.applicationFee),
      expected_commission: clean(row.expected_commission),
      ielts_overall: number(row.ielts_score),
      ielts_band: clean(row.ielts_band),
      toefl_overall: number(row.TOEFLScore),
      toefl_band: clean(row.TOEFLBand),
      pte_overall: number(row.PTEScore),
      pte_band: clean(row.PTEBand),
      duolingo_score: number(row.DuolingoScore),
      gpa_score: clean(row.gpa_score),
      application_deadline: clean(row.AppDeadline),
      entry_requirements: clean(row.entry),
      scholarship: clean(row.Scholarship),
      source_updated_at: timestamp(row.updated_date),
      active: row.isActive !== "0",
      legacy_data: {
        legacy_country_id: clean(row.country), legacy_university_id: clean(row.university),
        raw_duration: clean(row.duration), raw_tuition_fee: clean(row.tutionFee),
        raw_application_fee: clean(row.applicationFee), raw_website: clean(row.website),
        created_by: clean(row.created_by), updated_by: clean(row.updated_by),
      },
    },
  };
}

async function rest(url, key, path, { method = "GET", body } = {}) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
async function batches(values, size, task) {
  for (let at = 0; at < values.length; at += size) {
    await task(values.slice(at, at + size));
    process.stdout.write(`\rImported ${Math.min(at + size, values.length).toLocaleString()} / ${values.length.toLocaleString()}`);
  }
  process.stdout.write("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!file) throw new Error("Usage: npm run import:courses -- <csv-file> [--dry-run]");
  const organisationId = process.env.COURSE_FINDER_ORGANISATION_ID || "00000000-0000-0000-0000-000000000000";
  const rows = parseCsv(await readFile(file, "utf8"));
  const uniqueRows = [...new Map(rows.map((row) => [clean(row.id) || JSON.stringify(row), row])).values()];
  const institutionMap = new Map();
  for (const row of uniqueRows) {
    const normalised = normaliseLegacyRow(row, organisationId, null);
    institutionMap.set(normalised.institution.source_key, normalised.institution);
  }
  console.log(`${rows.length.toLocaleString()} rows; ${uniqueRows.length.toLocaleString()} unique courses; ${institutionMap.size.toLocaleString()} institutions.`);
  if (dryRun) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || organisationId.startsWith("00000000")) throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and COURSE_FINDER_ORGANISATION_ID.");
  await batches([...institutionMap.values()], 250, (body) => rest(url, key, "institutions?on_conflict=organisation_id,source_system,source_key", { method: "POST", body }));
  const institutions = await rest(url, key, `institutions?organisation_id=eq.${organisationId}&source_system=eq.maximus_legacy&select=id,source_key&limit=2000`);
  const ids = new Map(institutions.map((item) => [item.source_key, item.id]));
  const courses = uniqueRows.map((row) => {
    const base = normaliseLegacyRow(row, organisationId, null);
    base.course.institution_id = ids.get(base.institution.source_key);
    if (!base.course.institution_id) throw new Error(`Institution was not imported: ${base.institution.name}`);
    return base.course;
  });
  await batches(courses, 200, (body) => rest(url, key, "courses?on_conflict=organisation_id,source_system,source_key", { method: "POST", body }));
  console.log("Course Finder import complete.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
