import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { AIProviderError, askCopilot, redact } from "@/server/ai";
import { copilotContext } from "@/server/copilot-context";

class InputError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client") throw new LiveAccessError(403, "Copilot is available to staff only.");
    const raw = await request.text();
    if (raw.length > 24000) throw new InputError(413, "This request is too long.");
    let body;
    try { body = JSON.parse(raw); } catch { throw new InputError(400, "Enter a valid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError(400, "Enter a valid request.");
    const { caseId, instruction, draft = "", mode = "answer", tone = "Professional", language = "English" } = body;
    if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 4000 || typeof draft !== "string" || draft.length > 12000)
      throw new InputError(400, "Enter an instruction of up to 4,000 characters and a draft of up to 12,000 characters.");
    if (!["answer", "email", "message", "rewrite"].includes(mode) || !["Professional", "Friendly", "Formal"].includes(tone) || typeof language !== "string" || language.length > 60)
      throw new InputError(400, "Check the writing options.");
    if (caseId && (typeof caseId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId)))
      throw new InputError(400, "Choose a valid case.");
    const context = caseId ? await copilotContext(caseId, session.accessToken) : null;
    const result = await askCopilot({ context, instruction, draft, mode, tone, language });
    const allowed = new Set(context?.sources.map(source => source.id) ?? []);
    const sourceIds = result.sourceIds.filter(id => allowed.has(id));
    const warnings = [...(context?.warnings ?? ["No case selected. This draft uses only the information you provided."]), ...result.warnings];
    if (context && !sourceIds.length) warnings.push("The response did not cite a case source. Verify any factual claims before use.");
    if (caseId) {
      try {
        await supabaseRequest("/rest/v1/ai_interactions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ organisation_id: session.identity.organisationId, profile_id: session.identity.profileId, case_id: caseId, purpose: "case_draft", prompt_redacted: redact(instruction), response_redacted: redact([result.subject, result.text].filter(Boolean).join("\n\n")), model_provider: "anthropic", model_name: result.model, status: "completed" }) }, session.accessToken);
      } catch { warnings.push("The response is ready, but Copilot history could not be saved."); }
    }
    return appendRefreshCookies(Response.json({ ok: true, response: result.text, subject: result.subject, client: context?.client ?? null, sources: context?.sources.filter(source => sourceIds.includes(source.id)).map(({ id, label, href }) => ({ id, label, href })) ?? [], warnings }, { headers: { "Cache-Control": "private, no-store" } }), session.refreshed, request);
  } catch (error) {
    const status = error instanceof InputError || error instanceof LiveAccessError || error instanceof AIProviderError ? error.status : error instanceof SupabaseError ? 503 : 500;
    return Response.json({ ok: false, error: error instanceof InputError || error instanceof LiveAccessError || error instanceof AIProviderError ? error.message : "Copilot could not complete this request. Please try again." }, { status });
  }
}
