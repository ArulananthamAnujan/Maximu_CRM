import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { mask } from "@/server/protected-fields";

/**
 * Looks for the person about to be entered before a second record is made for
 * them. Two files for one client is the expensive mistake in an agency CRM:
 * documents, invoices and advice end up split across both.
 *
 * The matching itself is public.find_duplicate_clients, which runs as the
 * caller, so this reports only clients that person is already allowed to see.
 */
export const dynamic = "force-dynamic";

type Match = {
  id: string;
  crm_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  passport_masked: string | null;
  date_of_birth: string | null;
  current_lifecycle: string | null;
  case_count: number;
  match_reasons: string[];
};

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(
        403,
        "This check is not available in the client portal.",
      );
    const body = (await request.json()) as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    // The stored passport number is encrypted, so it is the mask that is
    // compared. mask() is deterministic, which is what makes that possible.
    const passport = text(body.passport);
    const [firstName, ...rest] = (text(body.name) ?? "").split(/\s+/);
    const day = text(body.dateOfBirth);

    const matches = await supabaseRequest<Match[]>(
      "/rest/v1/rpc/find_duplicate_clients",
      {
        method: "POST",
        body: JSON.stringify({
          p_email: text(body.email)?.toLowerCase() ?? null,
          p_mobile: text(body.phone),
          p_passport_masked: passport ? mask(passport) : null,
          p_first_name: text(body.firstName) ?? firstName ?? null,
          p_last_name: text(body.lastName) ?? rest.join(" ") ?? null,
          p_date_of_birth: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
        }),
      },
      session.accessToken,
    );

    return appendRefreshCookies(
      Response.json({
        ok: true,
        matches: (matches ?? []).map((row) => ({
          id: row.id,
          reference: row.crm_id ?? "",
          name: [row.first_name, row.last_name].filter(Boolean).join(" "),
          email: row.email ?? "",
          phone: row.mobile ?? "",
          passport: row.passport_masked ?? "",
          dateOfBirth: row.date_of_birth ?? "",
          stage: row.current_lifecycle ?? "",
          caseCount: Number(row.case_count ?? 0),
          reasons: row.match_reasons ?? [],
        })),
      }),
      session.refreshed,
      request,
    );
  } catch (error) {
    if (error instanceof LiveAccessError)
      return Response.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    if (error instanceof SupabaseError)
      // A database that has not had the migration applied must not silently
      // report "no duplicates" — that is the answer that creates one.
      return Response.json(
        {
          ok: false,
          error:
            "The duplicate check is unavailable. Apply supabase/migrations/0015_duplicate_clients.sql to your Supabase project.",
        },
        { status: 503 },
      );
    console.error(error);
    return Response.json(
      { ok: false, error: "The duplicate check could not be run." },
      { status: 500 },
    );
  }
}
