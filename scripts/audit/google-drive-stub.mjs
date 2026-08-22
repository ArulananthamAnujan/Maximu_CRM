/**
 * A stand-in for Google's token service and the Drive API, covering the calls
 * this CRM makes against a Shared Drive.
 *
 * It verifies the RS256 service-account assertion with the matching public key,
 * so the signing path is genuinely exercised rather than assumed, and it holds
 * uploaded bytes in memory so a download can be compared with what went in.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

const publicKey = fs.readFileSync(process.env.DRIVE_STUB_PUBLIC_KEY, "utf8");
const SHARED_DRIVE_ID = process.env.DRIVE_STUB_SHARED_DRIVE_ID || "shared-drive-root";

const folders = new Map(); // id -> { name, parent }
const files = new Map(); // id -> { name, mimeType, parents, content, trashed }
let counter = 0;
const nextId = (prefix) => `${prefix}-${++counter}`;

const fromBase64Url = (value) =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function verifyAssertion(assertion) {
  const [header, claims, signature] = String(assertion).split(".");
  if (!header || !claims || !signature) throw new Error("malformed assertion");
  const decodedHeader = JSON.parse(fromBase64Url(header).toString("utf8"));
  if (decodedHeader.alg !== "RS256") throw new Error(`unexpected alg ${decodedHeader.alg}`);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  if (!verifier.verify(publicKey, fromBase64Url(signature)))
    throw new Error("signature does not verify");
  const payload = JSON.parse(fromBase64Url(claims).toString("utf8"));
  if (!payload.iss) throw new Error("no issuer");
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("expired assertion");
  return payload;
}

// Pulls the two parts out of a multipart/related upload body.
function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let index = buffer.indexOf(delimiter);
  while (index !== -1) {
    const start = index + delimiter.length;
    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    const chunk = buffer.subarray(start, next);
    const split = chunk.indexOf("\r\n\r\n");
    if (split !== -1)
      parts.push({
        headers: chunk.subarray(0, split).toString("utf8"),
        body: chunk.subarray(split + 4, chunk.length - 2),
      });
    index = next;
  }
  return parts;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, "http://drive-stub");
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };

    if (url.pathname === "/token") {
      try {
        const params = new URLSearchParams(raw.toString("utf8"));
        verifyAssertion(params.get("assertion"));
        return send(200, { access_token: "stub-access-token", expires_in: 3600 });
      } catch (error) {
        return send(400, { error: "invalid_grant", error_description: String(error.message) });
      }
    }

    // A small window into the stub's state, for assertions.
    if (url.pathname === "/__state")
      return send(200, {
        folders: [...folders.entries()].map(([id, f]) => ({ id, ...f })),
        files: [...files.entries()].map(([id, f]) => ({
          id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.content.length,
          trashed: f.trashed,
        })),
      });

    const authorised = (req.headers.authorization || "").includes("stub-access-token");
    if (!authorised) return send(401, { error: { message: "missing token" } });

    // Folder search.
    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      const query = url.searchParams.get("q") || "";
      if (url.searchParams.get("supportsAllDrives") !== "true")
        return send(400, { error: { message: "supportsAllDrives is required on a Shared Drive" } });
      const name = /name = '([^']*)'/.exec(query)?.[1];
      const parent = /'([^']*)' in parents/.exec(query)?.[1];
      const match = [...folders.entries()].find(
        ([, folder]) => folder.name === name && folder.parent === parent,
      );
      return send(200, { files: match ? [{ id: match[0], name }] : [] });
    }

    // Folder creation.
    if (req.method === "POST" && url.pathname === "/drive/v3/files") {
      if (url.searchParams.get("supportsAllDrives") !== "true")
        return send(400, { error: { message: "supportsAllDrives is required" } });
      const body = JSON.parse(raw.toString("utf8"));
      const id = nextId("folder");
      folders.set(id, { name: body.name, parent: body.parents?.[0] ?? SHARED_DRIVE_ID });
      return send(200, { id, name: body.name });
    }

    // Multipart upload.
    if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
      if (url.searchParams.get("uploadType") !== "multipart")
        return send(400, { error: { message: "expected uploadType=multipart" } });
      const boundary = /boundary=([^;]+)/.exec(req.headers["content-type"] || "")?.[1];
      if (!boundary) return send(400, { error: { message: "no multipart boundary" } });
      const parts = parseMultipart(raw, boundary);
      if (parts.length !== 2)
        return send(400, { error: { message: `expected 2 parts, got ${parts.length}` } });
      const metadata = JSON.parse(parts[0].body.toString("utf8"));
      const mimeType = /Content-Type:\s*([^\r\n]+)/i.exec(parts[1].headers)?.[1] ?? "application/octet-stream";
      const id = nextId("file");
      files.set(id, {
        name: metadata.name,
        mimeType,
        parents: metadata.parents,
        content: parts[1].body,
        trashed: false,
      });
      return send(200, {
        id,
        name: metadata.name,
        mimeType,
        size: String(parts[1].body.length),
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
      });
    }

    const fileMatch = /^\/drive\/v3\/files\/([^/?]+)$/.exec(url.pathname);
    if (fileMatch) {
      const id = decodeURIComponent(fileMatch[1]);
      const file = files.get(id);
      if (!file) return send(404, { error: { message: "file not found" } });
      if (req.method === "GET" && url.searchParams.get("alt") === "media") {
        res.writeHead(200, { "Content-Type": file.mimeType });
        return res.end(file.content);
      }
      if (req.method === "PATCH") {
        const body = JSON.parse(raw.toString("utf8"));
        if (body.trashed) file.trashed = true;
        return send(200, { id, trashed: file.trashed });
      }
    }

    return send(404, { error: { message: `unhandled ${req.method} ${url.pathname}` } });
  });
});

const port = Number(process.env.DRIVE_STUB_PORT || 8098);
server.listen(port, "127.0.0.1", () =>
  console.log(`google drive stub on http://127.0.0.1:${port}`),
);
