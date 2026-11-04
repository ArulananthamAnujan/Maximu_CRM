import { liveSession, appendRefreshCookies, LiveAccessError } from "@/server/supabase-session";
import { supabaseRequest } from "@/server/supabase";
import { downloadFile, checksum } from "@/server/google-drive";

export const dynamic = "force-dynamic";

/** Read back one existing Drive object per request. Never re-upload or infer verification. */
export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Super Admin access is required.");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const rows = await supabaseRequest<{ id: string; document_id: string; expected_checksum: string | null }[]>(
      `/rest/v1/legacy_file_manifests?select=id,document_id,expected_checksum&organisation_id=eq.${org}&status=neq.verified&order=id.asc&limit=1`, { method: "GET" }, token);
    const manifest = rows[0];
    if (!manifest) return appendRefreshCookies(Response.json({ ok: true, done: true }), session.refreshed, request);
    const [document] = await supabaseRequest<{ drive_file_id: string | null; checksum: string | null }[]>(
      `/rest/v1/documents?select=drive_file_id,checksum&id=eq.${manifest.document_id}&organisation_id=eq.${org}`, { method: "GET" }, token);
    if (!document?.drive_file_id || !document.checksum || !manifest.expected_checksum)
      return Response.json({ error: "This file needs its source checksum and stored Drive document before verification." }, { status: 409 });
    const file = await downloadFile(document.drive_file_id);
    const bytes = await file.arrayBuffer();
    const actual = await checksum(bytes);
    if (actual.toLowerCase() !== manifest.expected_checksum.toLowerCase() || actual.toLowerCase() !== document.checksum.toLowerCase())
      return Response.json({ error: "Stored Drive file checksum does not match the imported source. Nothing was marked verified." }, { status: 409 });
    await supabaseRequest(`/rest/v1/legacy_file_manifests?id=eq.${manifest.id}&organisation_id=eq.${org}`, {
      method: "PATCH", body: JSON.stringify({ drive_file_id: document.drive_file_id, copied_checksum: actual, size_bytes: bytes.byteLength, status: "verified", verified_at: new Date().toISOString(), error_message: null }),
    }, token);
    return appendRefreshCookies(Response.json({ ok: true, done: false, verified: 1 }), session.refreshed, request);
  } catch (error) {
    console.error("Legacy file readback failed", error instanceof Error ? error.name : "Error");
    return Response.json({ error: error instanceof LiveAccessError ? error.message : "The stored file could not be verified. Check Drive access and try again." }, { status: error instanceof LiveAccessError ? error.status : 503 });
  }
}
