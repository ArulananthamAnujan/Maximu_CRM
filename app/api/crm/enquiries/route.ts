import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import {
  SupabaseError,
  supabasePageRequest,
  supabaseRequest,
} from "@/server/supabase";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

// Enquiries are intentionally loaded separately from the full CRM workspace.
// A large legacy import can contain thousands of enquiry-stage cases, while
// the full workspace also contains documents, messages and finance records.
// Keeping this response narrow prevents Netlify's buffered response limit from
// turning a valid branch into a misleading empty enquiry screen.
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const RELATED_CHUNK_SIZE = 120;
const BULK_PAGE_SIZE = 1_000;
const FILTER_CACHE_MS = 30_000;
const CASE_SELECT = "id,client_id,branch_id,case_number,service_type,matter_type,owner_id,health,priority,progress,target,next_action,due_at,lifecycle_stage,visa_expiry_on,opened_at,custom_fields";

type CachedRows = { expiresAt: number; rows: Json[] };
const enquiryCaseCache = new Map<string, CachedRows>();
const relationCache = new Map<string, CachedRows>();

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "This view is available to staff only.");

    const token = session.accessToken;
    const url = new URL(request.url);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("limit")) || PAGE_SIZE),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const query = clean(url.searchParams.get("q"), 100);
    const caseId = uuidFilter(url.searchParams.get("caseId"));
    const branchId = uuidFilter(url.searchParams.get("branchId"));
    const destination = clean(url.searchParams.get("destination"), 80);
    const service = oneOf(url.searchParams.get("service"), ["study_abroad", "direct_visa"]);
    const priority = oneOf(url.searchParams.get("priority"), ["high", "medium", "low"]);
    const documentFilter = oneOf(url.searchParams.get("documents"), ["ready", "waiting", "missing"]);
    const followUp = oneOf(url.searchParams.get("followUp"), ["scheduled", "noted", "needed"]);
    const ownerId = uuidFilter(url.searchParams.get("ownerId"));
    const statusFilter = clean(url.searchParams.get("status"), 80);
    const sourceFilter = clean(url.searchParams.get("source"), 100);
    const intake = clean(url.searchParams.get("intake"), 80);
    const qualification = clean(url.searchParams.get("qualification"), 100);
    const testGiven = oneOf(url.searchParams.get("testGiven"), ["yes", "no"]);
    const spouse = oneOf(url.searchParams.get("spouse"), ["yes", "no"]);
    const createdFrom = dayFilter(url.searchParams.get("createdFrom"));
    const createdTo = dayFilter(url.searchParams.get("createdTo"));
    const updatedFrom = dayFilter(url.searchParams.get("updatedFrom"));
    const updatedTo = dayFilter(url.searchParams.get("updatedTo"));
    const accessKey = `${session.identity.organisationId}:${session.identity.profileId}`;

    // The normal directory path asks PostgREST for exactly one visible page.
    // The old implementation downloaded every enquiry and all its relations
    // into React, which made a 5,000-record organisation wait roughly 25s.
    // Search and relation-backed filters use a short-lived, RLS-scoped narrow
    // index; the large client/note/document payload is still fetched only for
    // the 50 records the person can currently see.
    const needsIndex = Boolean(
      query || documentFilter || followUp === "noted" || followUp === "needed" ||
      statusFilter || sourceFilter || intake || qualification || testGiven || spouse || updatedFrom || updatedTo,
    );
    const page = needsIndex
      ? await indexedPage({
          accessKey,
          token,
          offset,
          limit,
          query,
          caseId,
          branchId,
          destination,
          service,
          priority,
          documents: documentFilter,
          followUp,
          ownerId,
          statusFilter,
          sourceFilter,
          intake,
          qualification,
          testGiven,
          spouse,
          createdFrom,
          createdTo,
          updatedFrom,
          updatedTo,
        })
      : await directPage({ token, offset, limit, caseId, branchId, destination, service, priority, followUp, ownerId, createdFrom, createdTo, updatedFrom, updatedTo });
    const cases = page.data;
    const caseIds = uniqueIds(cases, "id");
    const clientIds = uniqueIds(cases, "client_id");
    const branchIds = uniqueIds(cases, "branch_id");
    const ownerIds = uniqueIds(cases, "owner_id");
    const [clients, enquiries, branches, profiles, notes, documents] = await Promise.all([
      restByIds("clients", "id,first_name,last_name,preferred_name,email,mobile,source,passport_masked,custom_fields", "id", clientIds, token),
      restByIds("enquiries", "id,case_id,client_id,source,campaign,priority,status,score,next_follow_up_at,lost_reason,created_at", "case_id", caseIds, token, "&order=created_at.desc.nullslast,id.asc"),
      restByIds("branches", "id,name", "id", branchIds, token),
      restByIds("profiles", "id,display_name", "id", ownerIds, token),
      restByIds("case_notes", "case_id,author_id,body,created_at", "case_id", caseIds, token, "&order=created_at.desc,id.asc").catch(() => [] as Json[]),
      restByIds("documents", "case_id,state", "case_id", caseIds, token, "&state=neq.archived&order=case_id.asc,id.asc").catch(() => [] as Json[]),
    ]);

    const clientById = new Map(
      clients.map((row) => [String(row.id), row]),
    );
    const enquiryByCase = new Map<string, Json>();
    const enquiryByClient = new Map<string, Json>();
    for (const enquiry of enquiries) {
      const caseId = enquiry.case_id ? String(enquiry.case_id) : "";
      if (caseId && !enquiryByCase.has(caseId))
        enquiryByCase.set(caseId, enquiry);
      const clientId = enquiry.client_id ? String(enquiry.client_id) : "";
      if (clientId && !enquiryByClient.has(clientId))
        enquiryByClient.set(clientId, enquiry);
    }
    const branchById = new Map(
      branches.map((row) => [String(row.id), row]),
    );
    const profileById = new Map(
      profiles.map((row) => [String(row.id), row]),
    );
    const latestNoteByCase = new Map<string, Json>();
    for (const note of notes) {
      const caseId = String(note.case_id ?? "");
      if (caseId && !latestNoteByCase.has(caseId)) latestNoteByCase.set(caseId, note);
    }
    const documentCountsByCase = new Map<string, { total: number; ready: number; waiting: number }>();
    for (const document of documents) {
      const caseId = String(document.case_id ?? "");
      if (!caseId) continue;
      const counts = documentCountsByCase.get(caseId) ?? { total: 0, ready: 0, waiting: 0 };
      counts.total += 1;
      if (["verified", "uploaded"].includes(String(document.state))) counts.ready += 1;
      else counts.waiting += 1;
      documentCountsByCase.set(caseId, counts);
    }

    const records = cases.map((row) => {
      const client = clientById.get(String(row.client_id)) ?? {};
      const enquiry =
        enquiryByCase.get(String(row.id)) ??
        enquiryByClient.get(String(row.client_id)) ??
        {};
      const name = String(client.preferred_name ?? "").trim() || [client.first_name, client.last_name]
        .filter(Boolean)
        .join(" ");
      const caseFields = objectValue(row.custom_fields);
      const clientFields = objectValue(client.custom_fields);
      const legacy = {
        ...objectValue(clientFields.legacy_data),
        ...objectValue(caseFields.legacy_data),
      };
      const latestNote = latestNoteByCase.get(String(row.id)) ?? {};
      const documentCounts = documentCountsByCase.get(String(row.id));
      const documentSummary = documentCounts
        ? `${documentCounts.ready}/${documentCounts.total} ready${documentCounts.waiting ? ` · ${documentCounts.waiting} waiting` : ""}`
        : "No documents";
      return {
        dbId: row.id,
        clientId: row.client_id,
        branchId: row.branch_id,
        id: row.case_number,
        name,
        email: client.email ?? "",
        phone: client.mobile ?? "",
        type: row.matter_type || row.service_type,
        serviceType: row.service_type ?? "study_abroad",
        matterType: row.matter_type ?? "",
        target: row.target ?? "",
        stage: "Enquiry",
        owner: profileById.get(String(row.owner_id))?.display_name ?? "",
        ownerId: row.owner_id ?? "",
        collaboratorIds: [],
        branch: branchById.get(String(row.branch_id))?.name ?? "",
        due: plainDate(row.due_at),
        health: row.health === "critical" ? "critical" : "healthy",
        progress: Number(row.progress ?? 0),
        status: "active",
        lifecycleStage: "enquiry",
        visaExpiry: plainDate(row.visa_expiry_on),
        deferredApplications: 0,
        completedAt: "",
        reopenedAt: "",
        createdAt: row.opened_at ?? enquiry.created_at ?? "",
        destinationCountry: row.target ?? "",
        intake: legacy.intake ?? legacy.suggested_intake ?? legacy.target_intake ?? "",
        source: enquiry.source ?? client.source ?? "",
        campaign: enquiry.campaign ?? "",
        priority: row.priority ?? enquiry.priority ?? "medium",
        passportMasked: client.passport_masked ?? "",
        partner: "",
        documentSummary,
        deferReason: "",
        leadScore: Number(enquiry.score ?? 0),
        lostReason: enquiry.lost_reason ?? "",
        applicationStatus: "",
        visaCategory: row.matter_type ?? "",
        latestNote: latestNote.body ?? "",
        latestNoteAt: latestNote.created_at ?? "",
        latestNoteAuthor: profileById.get(String(latestNote.author_id))?.display_name ?? "",
        enquiryStatus: enquiry.status ?? row.next_action ?? caseFields.mainStatus ?? "",
        detailedStatus: caseFields.subStatus ?? row.next_action ?? "",
        nextFollowUpAt: enquiry.next_follow_up_at ?? row.due_at ?? "",
        updatedAt: legacy.updated_at ?? legacy.updated_date ?? row.opened_at ?? "",
        alternatePhone: clientFields.alternatePhone ?? legacy.alternate_phone ?? "",
        highestQualification: legacy.highest_qualification ?? legacy.qualification ?? legacy.education_level ?? "",
        yearPassed: legacy.year_passed ?? legacy.year_of_passing ?? "",
        testGiven: legacy.test_given ?? legacy.english_test ?? legacy.proficiency_test ?? "",
        spouseIncluded: legacy.spouse ?? legacy.spouse_included ?? legacy.marital_status ?? "",
      };
    });

    return appendRefreshCookies(
      Response.json(
        {
          ok: true,
          records,
          count: page.count,
          offset,
          limit,
        },
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
            Vary: "Cookie",
          },
        },
      ),
      session.refreshed,
      request,
    );
  } catch (error) {
    console.error("Enquiry directory unavailable", error);
    const status =
      error instanceof LiveAccessError
        ? error.status
        : error instanceof SupabaseError && error.status === 401
          ? 401
          : 503;
    const message =
      error instanceof LiveAccessError
        ? error.message
        : "The enquiry directory could not be loaded. Please retry.";
    return Response.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function directPage(input: {
  token: string;
  offset: number;
  limit: number;
  caseId: string;
  branchId: string;
  destination: string;
  service: string;
  priority: string;
  followUp: string;
  ownerId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
}) {
  const filters = caseFilters(input);
  const path = `/rest/v1/cases?select=${CASE_SELECT}&${filters.join("&")}&order=opened_at.desc.nullslast,id.asc&limit=${input.limit}&offset=${input.offset}`;
  return input.offset === 0
    ? supabasePageRequest<Json[]>(path, { method: "GET" }, input.token)
    : {
        data: await supabaseRequest<Json[]>(path, { method: "GET" }, input.token),
        count: null,
      };
}

async function indexedPage(input: {
  accessKey: string;
  token: string;
  offset: number;
  limit: number;
  query: string;
  caseId: string;
  branchId: string;
  destination: string;
  service: string;
  priority: string;
  documents: string;
  followUp: string;
  ownerId: string;
  statusFilter: string;
  sourceFilter: string;
  intake: string;
  qualification: string;
  testGiven: string;
  spouse: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
}) {
  const needsEnquiries = Boolean(input.statusFilter || input.sourceFilter);
  const [allCases, queryIds, documentRows, notedRows, enquiryRows] = await Promise.all([
    cachedRows(enquiryCaseCache, `${input.accessKey}:cases`, () =>
      allRows(
        "cases",
        `${CASE_SELECT}&lifecycle_stage=eq.enquiry&order=opened_at.desc.nullslast,id.asc`,
        input.token,
      ),
    ),
    input.query ? matchingCaseIds(input.query, input.token) : Promise.resolve(null),
    input.documents
      ? cachedRows(relationCache, `${input.accessKey}:documents`, () =>
          allRows("documents", "case_id,state&state=neq.archived", input.token),
        )
      : Promise.resolve([]),
    input.followUp === "noted" || input.followUp === "needed"
      ? cachedRows(relationCache, `${input.accessKey}:notes`, () =>
          allRows("case_notes", "case_id", input.token),
        )
      : Promise.resolve([]),
    needsEnquiries
      ? cachedRows(relationCache, `${input.accessKey}:enquiries`, () =>
          allRows("enquiries", "case_id,status,source,campaign", input.token),
        )
      : Promise.resolve([]),
  ]);
  const querySet = queryIds ? new Set(queryIds) : null;
  const noted = new Set(notedRows.map((row) => String(row.case_id ?? "")).filter(Boolean));
  const documentsByCase = new Map<string, { total: number; waiting: number }>();
  const enquiryByCase = new Map(
    enquiryRows.map((row) => [String(row.case_id ?? ""), row]),
  );
  for (const row of documentRows) {
    const caseId = String(row.case_id ?? "");
    if (!caseId) continue;
    const state = String(row.state ?? "");
    const current = documentsByCase.get(caseId) ?? { total: 0, waiting: 0 };
    current.total += 1;
    if (!["verified", "uploaded"].includes(state)) current.waiting += 1;
    documentsByCase.set(caseId, current);
  }
  const filtered = allCases.filter((row) => {
    const id = String(row.id ?? "");
    const enquiry = enquiryByCase.get(id) ?? {};
    const caseFields = objectValue(row.custom_fields);
    const legacy = objectValue(caseFields.legacy_data);
    if (querySet && !querySet.has(id)) return false;
    if (input.caseId && id !== input.caseId) return false;
    if (input.branchId && String(row.branch_id ?? "") !== input.branchId) return false;
    if (input.destination && !String(row.target ?? "").toLowerCase().includes(input.destination.toLowerCase())) return false;
    if (input.service && String(row.service_type ?? "") !== input.service) return false;
    if (input.priority && String(row.priority ?? "") !== input.priority) return false;
    if (input.ownerId && String(row.owner_id ?? "") !== input.ownerId) return false;
    if (input.createdFrom && String(row.opened_at ?? "").slice(0, 10) < input.createdFrom) return false;
    if (input.createdTo && String(row.opened_at ?? "").slice(0, 10) > input.createdTo) return false;
    const legacyUpdated = legacyDate(legacy.updated_at ?? legacy.updated_date ?? row.opened_at);
    if ((input.updatedFrom || input.updatedTo) && !legacyUpdated) return false;
    if (input.updatedFrom && legacyUpdated < input.updatedFrom) return false;
    if (input.updatedTo && legacyUpdated > input.updatedTo) return false;
    if (input.followUp === "scheduled" && !row.due_at) return false;
    if (input.followUp === "noted" && !noted.has(id)) return false;
    if (input.followUp === "needed" && (row.due_at || noted.has(id))) return false;
    if (input.documents) {
      const states = documentsByCase.get(id) ?? { total: 0, waiting: 0 };
      if (input.documents === "ready" && !(states.total > 0 && states.waiting === 0)) return false;
      if (input.documents === "waiting" && states.waiting === 0) return false;
      if (input.documents === "missing" && states.total > 0) return false;
    }
    if (input.statusFilter && !containsAny(input.statusFilter, enquiry.status, row.next_action, caseFields.mainStatus, caseFields.subStatus)) return false;
    if (input.sourceFilter && !containsAny(input.sourceFilter, enquiry.source, enquiry.campaign, legacy.source, legacy.source_other, legacy.reference)) return false;
    if (input.intake && !containsAny(input.intake, legacy.intake, legacy.suggested_intake, legacy.target_intake)) return false;
    if (input.qualification && !containsAny(input.qualification, legacy.highest_qualification, legacy.qualification, legacy.education_level)) return false;
    const hasTest = Boolean(cleanUnknown(legacy.test_given) || cleanUnknown(legacy.english_test) || cleanUnknown(legacy.proficiency_test));
    if (input.testGiven === "yes" && !hasTest) return false;
    if (input.testGiven === "no" && hasTest) return false;
    const hasSpouse = /yes|true|married|spouse|partner|included/i.test([
      legacy.spouse,
      legacy.spouse_included,
      legacy.marital_status,
    ].map(cleanUnknown).join(" "));
    if (input.spouse === "yes" && !hasSpouse) return false;
    if (input.spouse === "no" && hasSpouse) return false;
    return true;
  });
  return {
    data: filtered.slice(input.offset, input.offset + input.limit),
    count: input.offset === 0 ? filtered.length : null,
  };
}

function caseFilters(input: {
  caseId: string;
  branchId: string;
  destination: string;
  service: string;
  priority: string;
  followUp: string;
  ownerId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
}) {
  const filters = ["lifecycle_stage=eq.enquiry"];
  if (input.caseId) filters.push(`id=eq.${input.caseId}`);
  if (input.branchId) filters.push(`branch_id=eq.${input.branchId}`);
  if (input.destination) filters.push(`target=ilike.*${escapeFilter(input.destination)}*`);
  if (input.service) filters.push(`service_type=eq.${encodeURIComponent(input.service)}`);
  if (input.priority) filters.push(`priority=eq.${encodeURIComponent(input.priority)}`);
  if (input.ownerId) filters.push(`owner_id=eq.${input.ownerId}`);
  if (input.createdFrom) filters.push(`opened_at=gte.${input.createdFrom}T00:00:00Z`);
  if (input.createdTo) filters.push(`opened_at=lte.${input.createdTo}T23:59:59Z`);
  if (input.followUp === "scheduled") filters.push("due_at=not.is.null");
  return filters;
}

async function matchingCaseIds(query: string, token: string): Promise<string[]> {
  const needle = escapeFilter(query);
  const clientFilter = ["first_name", "last_name", "preferred_name", "email", "mobile", "crm_id", "nationality"]
    .map((field) => `${field}.ilike.*${needle}*`).join(",");
  const enquiryFilter = ["source", "campaign", "status"]
    .map((field) => `${field}.ilike.*${needle}*`).join(",");
  const [clients, directCases, enquiries, branches] = await Promise.all([
    allRows("clients", `id&archived_at=is.null&or=(${clientFilter})`, token),
    allRows("cases", `id&lifecycle_stage=eq.enquiry&or=(case_number.ilike.*${needle}*,target.ilike.*${needle}*,matter_type.ilike.*${needle}*)`, token),
    allRows("enquiries", `case_id&or=(${enquiryFilter})`, token),
    allRows("branches", `id&name=ilike.*${needle}*`, token),
  ]);
  const clientIds = clients.map((row) => String(row.id ?? "")).filter(Boolean);
  const branchIds = branches.map((row) => String(row.id ?? "")).filter(Boolean);
  const [clientCases, branchCases] = await Promise.all([
    clientIds.length
      ? restByIds("cases", "id", "client_id", clientIds, token, "&lifecycle_stage=eq.enquiry")
      : Promise.resolve([]),
    branchIds.length
      ? restByIds("cases", "id", "branch_id", branchIds, token, "&lifecycle_stage=eq.enquiry")
      : Promise.resolve([]),
  ]);
  return Array.from(new Set([
    ...directCases.map((row) => row.id),
    ...clientCases.map((row) => row.id),
    ...branchCases.map((row) => row.id),
    ...enquiries.map((row) => row.case_id),
  ].map((value) => String(value ?? "")).filter(Boolean)));
}

async function allRows(table: string, selectAndFilters: string, token: string): Promise<Json[]> {
  const rows: Json[] = [];
  for (let offset = 0; offset < 20_000; offset += BULK_PAGE_SIZE) {
    const page = await supabaseRequest<Json[]>(
      `/rest/v1/${table}?select=${selectAndFilters}&limit=${BULK_PAGE_SIZE}&offset=${offset}`,
      { method: "GET" },
      token,
    );
    rows.push(...page);
    if (page.length < BULK_PAGE_SIZE) break;
  }
  return rows;
}

async function cachedRows(
  cache: Map<string, CachedRows>,
  key: string,
  load: () => Promise<Json[]>,
) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.rows;
  const rows = await load();
  cache.set(key, { expiresAt: Date.now() + FILTER_CACHE_MS, rows });
  return rows;
}

function clean(value: string | null, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function uuidFilter(value: string | null) {
  const cleanValue = clean(value, 36);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanValue)
    ? cleanValue
    : "";
}

function oneOf(value: string | null, allowed: string[]) {
  const cleanValue = clean(value, 40);
  return allowed.includes(cleanValue) ? cleanValue : "";
}

function dayFilter(value: string | null) {
  const cleanValue = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanValue) ? cleanValue : "";
}

function objectValue(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : {};
}

function cleanUnknown(value: unknown) {
  return String(value ?? "").trim();
}

function containsAny(needle: string, ...values: unknown[]) {
  const normalise = (value: unknown) => cleanUnknown(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const lower = normalise(needle);
  return values.some((value) => normalise(value).includes(lower));
}

function legacyDate(value: unknown) {
  const text = cleanUnknown(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  return local
    ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
    : "";
}

function escapeFilter(value: string) {
  return encodeURIComponent(value.replace(/[\\%_*(),.]/g, (character) => `\\${character}`));
}

function uniqueIds(rows: Json[], field: string): string[] {
  return Array.from(
    new Set(rows.map((row) => String(row[field] ?? "")).filter(Boolean)),
  );
}

async function restByIds(
  table: string,
  select: string,
  field: string,
  ids: string[],
  token: string,
  suffix = "",
): Promise<Json[]> {
  if (!ids.length) return [];
  const pages: Json[][] = [];
  for (let start = 0; start < ids.length; start += RELATED_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + RELATED_CHUNK_SIZE);
    pages.push(
      await supabaseRequest<Json[]>(
        `/rest/v1/${table}?select=${select}&${field}=in.(${chunk.join(",")})${suffix}`,
        { method: "GET" },
        token,
      ),
    );
  }
  return pages.flat();
}

function plainDate(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}
