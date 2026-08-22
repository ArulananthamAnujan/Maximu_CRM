import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import {
  checksum,
  downloadFile,
  driveConfigured,
  DriveError,
  DriveNotConfiguredError,
  ensureClientFolders,
  trashFile,
  uploadFile,
} from "@/server/google-drive";
import {
  STUDENT_FOLDER_TEMPLATE,
  studentFolderName,
} from "@/lib/google-drive-plan";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

// Workers hold the whole upload in memory, and a CRM stores passports and
// statements rather than video, so cap it well below the runtime limit.
// MAX_UPLOAD_MB can lower it for a deployment that wants a tighter bound.
function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_MB);
  const megabytes = Number.isFinite(configured) && configured > 0 ? configured : 25;
  return Math.floor(megabytes * 1024 * 1024);
}
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

/** Streams a stored document back, once this CRM agrees the caller may see it. */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const documentId = uuid(
      new URL(request.url).searchParams.get("documentId"),
      "Document",
    );
    // Row-level security decides visibility: a document the caller may not read
    // simply is not returned, so there is nothing to fetch from Drive.
    const rows = await rest<Json[]>(
      `documents?select=id,display_name,mime_type,drive_file_id,state&id=eq.${documentId}&limit=1`,
      session.accessToken,
    );
    const document = rows[0];
    if (!document)
      throw new LiveAccessError(403, "That document is not available to you.");
    if (!document.drive_file_id)
      throw new InputError(
        "That document has been requested but no file has been stored yet.",
      );

    const file = await downloadFile(String(document.drive_file_id));
    const headers = new Headers({
      "Content-Type": String(document.mime_type || "application/octet-stream"),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        String(document.display_name || "document"),
      )}"`,
      "Cache-Control": "private, no-store",
    });
    return new Response(file.body, { status: 200, headers });
  } catch (error) {
    return apiError(error);
  }
}

/** Uploads a file into the client's folder on the organisation's Shared Drive. */
export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    // Fail on a missing configuration before doing any work: with no storage
    // connected there is nothing useful to look up, and the caller needs to be
    // told what to set rather than shown an access error from further in.
    if (!driveConfigured()) throw new DriveNotConfiguredError();
    const token = session.accessToken;

    // Refuse an oversized upload from the declared length where it is given,
    // before the body is read: parsing first would buffer the whole file in the
    // Worker's memory, which is what the limit exists to prevent. A chunked
    // upload carries no Content-Length, so the check after parsing is the one
    // that always applies. Multipart framing adds a little, hence the margin.
    const limit = maxUploadBytes();
    const limitLabel =
      limit >= 1024 * 1024
        ? `${(limit / 1024 / 1024).toFixed(0)}MB`
        : `${Math.round(limit / 1024)}KB`;
    const describe = (bytes: number) =>
      bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
        : `${Math.round(bytes / 1024)}KB`;
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > limit + 64 * 1024) {
      // Discard the incoming body explicitly. Rejecting without draining it
      // leaves the stream open and the caller waiting.
      await request.body?.cancel().catch(() => undefined);
      throw new InputError(
        `That upload is ${describe(declaredLength)}. The limit is ${limitLabel}.`,
      );
    }

    const form = await request.formData();
    const documentId = uuid(form.get("documentId"), "Document");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new InputError("Choose a file to store.");
    if (file.size > limit)
      throw new InputError(
        `That file is ${describe(file.size)}. The limit is ${limitLabel}.`,
      );
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.includes(mimeType))
      throw new InputError(
        "That file type is not accepted. Use a PDF, an image, a Word or Excel document, or plain text.",
      );

    const documents = await rest<Json[]>(
      `documents?select=id,client_id,document_type,display_name,version,drive_file_id,state&id=eq.${documentId}&limit=1`,
      token,
    );
    const document = documents[0];
    if (!document)
      throw new LiveAccessError(403, "That document is not available to you.");
    // A client may supply a document that was asked of them, and nothing else.
    // Row-level security enforces the same rule; this states it plainly.
    if (
      session.identity.role === "client" &&
      !["requested", "rejected"].includes(String(document.state))
    )
      throw new LiveAccessError(
        403,
        "That document has already been provided. Ask your case officer if it needs to change.",
      );

    const clients = await rest<Json[]>(
      `clients?select=id,first_name,last_name,crm_id,drive_folder_id&id=eq.${document.client_id}&limit=1`,
      token,
    );
    const client = clients[0];
    if (!client)
      throw new LiveAccessError(403, "That client is not available to you.");

    // Provision the client's folder tree the first time something is stored.
    let folderId = client.drive_folder_id ? String(client.drive_folder_id) : "";
    if (!folderId) {
      folderId = await ensureClientFolders(
        studentFolderName(
          `${client.first_name ?? ""} ${client.last_name ?? ""}`,
          String(client.crm_id ?? ""),
        ),
        STUDENT_FOLDER_TEMPLATE,
      );
      await patch(
        "clients",
        String(client.id),
        { drive_folder_id: folderId, drive_sync_state: "ready" },
        token,
      );
    }

    const content = await file.arrayBuffer();
    const stored = await uploadFile({
      folderId,
      name: `${String(document.display_name ?? "document")} - ${file.name}`,
      mimeType,
      content,
    });

    // Replacing a stored file supersedes the previous one rather than orphaning
    // it in the drive.
    if (document.drive_file_id)
      await trashFile(String(document.drive_file_id)).catch((error) =>
        console.error("Could not bin the superseded Drive file", error),
      );

    await patch(
      "documents",
      String(document.id),
      {
        state: "uploaded",
        drive_file_id: stored.id,
        drive_folder_id: folderId,
        mime_type: stored.mimeType,
        size_bytes: stored.size,
        checksum: await checksum(content),
        uploaded_by: session.identity.profileId,
        version: Number(document.version ?? 1) + (document.drive_file_id ? 1 : 0),
        metadata: {
          storage: "google_shared_drive",
          original_name: file.name,
          web_view_link: stored.webViewLink,
        },
      },
      token,
    );

    await insert(
      "audit_events",
      {
        organisation_id: session.identity.organisationId,
        actor_id: session.identity.profileId,
        action: document.drive_file_id ? "document.replaced" : "document.uploaded",
        resource_type: "document",
        resource_id: String(document.id),
        summary: `Stored ${file.name} for ${String(document.display_name ?? "a document")}`,
      },
      token,
    );

    return appendRefreshCookies(
      Response.json({ ok: true, driveFileId: stored.id, size: stored.size }),
      session.refreshed,
      request,
    );
  } catch (error) {
    // Any path that returns without reading the upload must discard it, or the
    // request stream stays open and the caller waits for a response that has
    // already been decided.
    await request.body?.cancel().catch(() => undefined);
    return apiError(error);
  }
}

export function driveStatus() {
  return { connected: driveConfigured() };
}

async function rest<T>(query: string, token: string): Promise<T> {
  return supabaseRequest<T>(`/rest/v1/${query}`, { method: "GET" }, token);
}
async function patch(table: string, id: string, value: Json, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    },
    token,
  );
}
async function insert(table: string, value: Json, token: string) {
  await supabaseRequest(
    `/rest/v1/${table}`,
    {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    },
    token,
  );
}
function uuid(value: unknown, label: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      parsed,
    )
  )
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof DriveNotConfiguredError)
    return Response.json({ ok: false, error: error.message }, { status: 503 });
  if (error instanceof DriveError) {
    console.error("Google Drive:", error.status, error.message);
    return Response.json(
      {
        ok: false,
        error:
          error.status === 401 || error.status === 403
            ? "Google refused the request. Check the service account is a member of the Shared Drive."
            : "Google Drive could not complete that request.",
      },
      { status: 502 },
    );
  }
  if (error instanceof SupabaseError) {
    console.error(error.message);
    return Response.json(
      { ok: false, error: "The database rejected this document action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  }
  console.error(error);
  return Response.json(
    { ok: false, error: "The document action could not be completed." },
    { status: 500 },
  );
}
