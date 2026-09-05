import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import {
  SupabaseError,
  supabaseRequest,
} from "@/server/supabase";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

// Enquiries are intentionally loaded separately from the full CRM workspace.
// A large legacy import can contain thousands of enquiry-stage cases, while
// the full workspace also contains documents, messages and finance records.
// Keeping this response narrow prevents Netlify's buffered response limit from
// turning a valid branch into a misleading empty enquiry screen.
const PAGE_SIZE = 500;
const MAX_ROWS = 10_000;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "This view is available to staff only.");

    const token = session.accessToken;
    const [cases, clients, enquiries, branches, profiles] = await Promise.all([
      restAll(
        "cases?select=id,client_id,branch_id,case_number,service_type,matter_type,owner_id,health,priority,progress,target,due_at,lifecycle_stage,visa_expiry_on,opened_at&lifecycle_stage=eq.enquiry&order=opened_at.desc.nullslast,id.asc",
        token,
      ),
      restAll(
        "clients?select=id,first_name,last_name,email,mobile,source,passport_masked&archived_at=is.null&order=updated_at.desc.nullslast,id.asc",
        token,
      ),
      restAll(
        "enquiries?select=id,case_id,client_id,source,campaign,priority,score,lost_reason,created_at&order=created_at.desc.nullslast,id.asc",
        token,
      ),
      restAll(
        "branches?select=id,name&active=eq.true&order=name.asc,id.asc",
        token,
      ),
      restAll(
        "profiles?select=id,display_name&active=eq.true&order=display_name.asc,id.asc",
        token,
      ),
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

    const records = cases.map((row) => {
      const client = clientById.get(String(row.client_id)) ?? {};
      const enquiry =
        enquiryByCase.get(String(row.id)) ??
        enquiryByClient.get(String(row.client_id)) ??
        {};
      const name = [client.first_name, client.last_name]
        .filter(Boolean)
        .join(" ");
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
        intake: "",
        source: enquiry.source ?? client.source ?? "",
        campaign: enquiry.campaign ?? "",
        priority: row.priority ?? enquiry.priority ?? "medium",
        passportMasked: client.passport_masked ?? "",
        partner: "",
        documentSummary: "Open the case for documents",
        deferReason: "",
        leadScore: Number(enquiry.score ?? 0),
        lostReason: enquiry.lost_reason ?? "",
        applicationStatus: "",
        visaCategory: row.matter_type ?? "",
        latestNote: "",
        latestNoteAt: "",
        latestNoteAuthor: "",
      };
    });

    return appendRefreshCookies(
      Response.json(
        { ok: true, records, count: records.length },
        { headers: { "Cache-Control": "no-store" } },
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

async function restAll(path: string, token: string): Promise<Json[]> {
  const rows: Json[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const page = await supabaseRequest<Json[]>(
      `/rest/v1/${path}&limit=${PAGE_SIZE}&offset=${offset}`,
      { method: "GET" },
      token,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error("The enquiry directory exceeds the supported page window.");
}

function plainDate(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}
