import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { AIProviderError, askAssistant, redact } from "@/server/ai";
import type { CaseContext } from "@/server/ai";

/**
 * The case-file assistant: drafts and summarises against a case using only
 * facts already on that case file. It never writes anything itself -- the
 * text it returns is saved as a case note or a message draft through the same
 * audited endpoints a person types into by hand.
 */
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;
class InputError extends Error {}

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(
        403,
        "The assistant is not available in the client portal.",
      );
    const caseId = new URL(request.url).searchParams.get("caseId");
    if (!caseId) throw new InputError("Case is required.");
    // RLS answers this: a case the caller cannot access returns no rows and
    // no interactions, rather than a 403 that would confirm the case exists.
    const rows = await rest<Json[]>(
      `ai_interactions?select=id,purpose,response_redacted,created_at&case_id=eq.${encodeURIComponent(caseId)}&order=created_at.desc&limit=20`,
      session.accessToken,
    );
    return appendRefreshCookies(
      Response.json({
        ok: true,
        interactions: rows.map((row) => ({
          id: row.id,
          purpose: row.purpose,
          response: row.response_redacted,
          at: row.created_at,
        })),
      }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(
        403,
        "The assistant is not available in the client portal.",
      );
    const body = (await request.json()) as Json;
    const caseId = required(body.caseId, "Case");
    const instruction = required(body.instruction, "Instruction");
    if (instruction.length > 2000)
      throw new InputError("That instruction is too long.");
    const token = session.accessToken;

    // Built entirely from what the caller's own row-level security lets them
    // read. If the case is not theirs to see, every query below returns
    // nothing and the case lookup fails first, with the ordinary "not found"
    // rather than a message that would confirm somebody else's case exists.
    const cases = await rest<Json[]>(
      `cases?select=id,case_number,matter_type,lifecycle_stage,target,visa_expiry_on,client_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
      token,
    );
    const caseRow = cases[0];
    if (!caseRow) throw new InputError("That case is not available to you.");
    const [clients, applications, visaMatters, notes] = await Promise.all([
      rest<Json[]>(
        `clients?select=first_name&id=eq.${encodeURIComponent(String(caseRow.client_id))}&limit=1`,
        token,
      ),
      rest<Json[]>(
        `education_applications?select=institution,course,status&case_id=eq.${encodeURIComponent(caseId)}&archived_at=is.null&order=created_at.desc&limit=5`,
        token,
      ),
      rest<Json[]>(
        `visa_matters?select=visa_subclass,status,information_due_at&case_id=eq.${encodeURIComponent(caseId)}&limit=1`,
        token,
      ),
      // Internal case-team notes only. A client-visible note is already
      // something the client has read; an internal one is the working
      // context, which is what the assistant needs.
      rest<Json[]>(
        `case_notes?select=body&case_id=eq.${encodeURIComponent(caseId)}&visibility=eq.case_team&order=created_at.desc&limit=5`,
        token,
      ),
    ]);

    const context: CaseContext = {
      clientFirstName: String(clients[0]?.first_name ?? ""),
      caseNumber: String(caseRow.case_number ?? ""),
      matterType: String(caseRow.matter_type ?? ""),
      lifecycleStage: String(caseRow.lifecycle_stage ?? ""),
      target: String(caseRow.target ?? ""),
      visaExpiry: String(caseRow.visa_expiry_on ?? ""),
      applications: applications.map((row) => ({
        institution: String(row.institution ?? ""),
        course: String(row.course ?? ""),
        status: String(row.status ?? ""),
      })),
      visaMatter: visaMatters[0]
        ? {
            subclass: String(visaMatters[0].visa_subclass ?? ""),
            status: String(visaMatters[0].status ?? ""),
            informationDueOn: String(
              visaMatters[0].information_due_at ?? "",
            ).slice(0, 10),
          }
        : null,
      recentNotes: notes.map((row) => String(row.body ?? "")),
    };

    const result = await askAssistant(context, instruction);

    // Stored so the assistant's history stays reviewable, redacted a second
    // time in case a note the model was given, or the instruction itself,
    // carried something document-like.
    const interaction = await supabaseRequest<Json[]>(
      "/rest/v1/ai_interactions",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organisation_id: session.identity.organisationId,
          profile_id: session.identity.profileId,
          case_id: caseId,
          purpose: "case_draft",
          prompt_redacted: redact(instruction),
          response_redacted: redact(result.text),
          model_provider: "anthropic",
          model_name: result.model,
          status: "completed",
        }),
      },
      token,
    );

    return appendRefreshCookies(
      Response.json({
        ok: true,
        response: result.text,
        interactionId: interaction[0]?.id ?? null,
      }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

async function rest<T = unknown>(query: string, token: string): Promise<T> {
  return supabaseRequest<T>(`/rest/v1/${query}`, { method: "GET" }, token);
}
function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new InputError(`${label} is required.`);
  return value.trim();
}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  if (error instanceof AIProviderError)
    return Response.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  if (error instanceof SupabaseError)
    return Response.json(
      { ok: false, error: "The database rejected this request." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  console.error(error);
  return Response.json(
    { ok: false, error: "The assistant could not complete that request." },
    { status: 500 },
  );
}
