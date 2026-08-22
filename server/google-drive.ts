/**
 * Google Drive access for the organisation's Shared Drive.
 *
 * Files live in a Shared Drive owned by the agency, not in this application.
 * A service account is added as a member of that drive and nothing else, so the
 * CRM can only ever reach the documents it is meant to.
 *
 * This runs on Cloudflare Workers, which has no Node crypto and cannot load the
 * googleapis SDK, so the service-account assertion is signed with Web Crypto and
 * the Drive REST API is called directly.
 */

export type DriveConfig = {
  clientEmail: string;
  privateKey: string;
  sharedDriveId: string;
};

declare global {
  // Populated by the Worker entry point at request time.
  var __MAXIMUS_DRIVE__: Partial<DriveConfig> | undefined;
}

export class DriveNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Drive is not connected. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHARED_DRIVE_ID, and add the service account to the Shared Drive.",
    );
  }
}

export class DriveError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function driveConfig(): DriveConfig {
  const runtime = globalThis.__MAXIMUS_DRIVE__;
  const clientEmail =
    runtime?.clientEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  // A PEM in an environment variable usually carries escaped newlines.
  const privateKey = (
    runtime?.privateKey ||
    process.env.GOOGLE_PRIVATE_KEY ||
    ""
  ).replace(/\\n/g, "\n");
  const sharedDriveId =
    runtime?.sharedDriveId || process.env.GOOGLE_SHARED_DRIVE_ID || "";
  if (!clientEmail || !privateKey || !sharedDriveId)
    throw new DriveNotConfiguredError();
  return { clientEmail, privateKey, sharedDriveId };
}

export function driveConfigured(): boolean {
  try {
    driveConfig();
    return true;
  } catch {
    return false;
  }
}

// Where the Drive API lives. Overridable so the flow can be exercised against a
// stand-in server in tests.
function driveBase(): string {
  return (
    globalThis.__MAXIMUS_DRIVE__ as { apiBase?: string } | undefined
  )?.apiBase ||
    process.env.GOOGLE_API_BASE ||
    "https://www.googleapis.com";
}
function tokenBase(): string {
  return (
    globalThis.__MAXIMUS_DRIVE__ as { tokenBase?: string } | undefined
  )?.tokenBase ||
    process.env.GOOGLE_TOKEN_BASE ||
    "https://oauth2.googleapis.com";
}

const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

// One access token is good for an hour; keep it rather than re-signing per call.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function driveAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.value;

  const { clientEmail, privateKey } = driveConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/drive",
        aud: `${tokenBase()}/token`,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64url(signature)}`;

  const response = await fetch(`${tokenBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok)
    throw new DriveError(
      response.status,
      `Google refused the service account: ${await response.text()}`,
    );
  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(60, token.expires_in) * 1000,
  };
  return cachedToken.value;
}

/** Only used by tests, which need each case to start without a cached token. */
export function resetDriveToken(): void {
  cachedToken = null;
}

async function driveFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await driveAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${driveBase()}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new DriveError(
      response.status,
      detail || response.statusText || "Google Drive rejected the request.",
    );
  }
  return response;
}

const escapeQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * Finds a folder by name under a parent, creating it if absent. Shared Drives
 * need supportsAllDrives on every call, and the drive itself as the corpus.
 */
export async function ensureFolder(
  name: string,
  parentId: string,
): Promise<string> {
  const { sharedDriveId } = driveConfig();
  const query = [
    `name = '${escapeQuery(name)}'`,
    `'${escapeQuery(parentId)}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");
  const search = await driveFetch(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      `&corpora=drive&driveId=${encodeURIComponent(sharedDriveId)}&pageSize=1`,
  );
  const found = (await search.json()) as { files?: { id: string }[] };
  if (found.files?.[0]?.id) return found.files[0].id;

  const created = await driveFetch(
    "/drive/v3/files?fields=id&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  return ((await created.json()) as { id: string }).id;
}

/**
 * The client's own folder in the Shared Drive. Subfolders are created when a
 * document is first filed into one: provisioning the whole plan up front cost
 * about twenty-six Drive calls on every upload whose folder was not yet stored.
 */
export async function ensureClientFolder(folderName: string): Promise<string> {
  const { sharedDriveId } = driveConfig();
  return ensureFolder(folderName, sharedDriveId);
}

export type UploadedFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string | null;
};

/**
 * Uploads bytes into a folder with a multipart/related request, which sends the
 * metadata and the content in one call.
 */
export async function uploadFile(options: {
  folderId: string;
  name: string;
  mimeType: string;
  content: ArrayBuffer;
}): Promise<UploadedFile> {
  const boundary = `maximus-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: options.name,
    parents: [options.folderId],
  });
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(
    head.length + options.content.byteLength + tail.length,
  );
  body.set(head, 0);
  body.set(new Uint8Array(options.content), head.length);
  body.set(tail, head.length + options.content.byteLength);

  const response = await driveFetch(
    "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true" +
      "&fields=id,name,mimeType,size,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const file = (await response.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  };
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size ?? options.content.byteLength),
    webViewLink: file.webViewLink ?? null,
  };
}

/** Streams a file back. Access is decided by this application, not by Drive. */
export async function downloadFile(fileId: string): Promise<Response> {
  return driveFetch(
    `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
}

/** Moves a file to the drive's bin rather than destroying it. */
export async function trashFile(fileId: string): Promise<void> {
  await driveFetch(
    `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
}

/** SHA-256 of the uploaded bytes, so a stored document can be shown to be intact. */
export async function checksum(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
