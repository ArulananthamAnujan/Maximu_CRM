/**
 * Serves the built Worker over a real HTTP socket so a browser can drive it.
 *
 * The feature audit calls worker.fetch in process; an end-to-end test needs the
 * application on a port. This is the same Worker with the same environment, put
 * behind node:http.
 *
 * Static assets are served here, ahead of the Worker, because that is what
 * Cloudflare does: files in the assets binding are returned before the Worker
 * runs and never reach it. Without that the Worker answers 404 for its own
 * JavaScript and the page never leaves its loading state.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const clientDir = path.join(root, "dist", "client");

const CONTENT_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

const contentType = (file) =>
  CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";

/** Resolves a request path to a built client file, or null. */
function staticFile(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative) return null;
  const target = path.resolve(clientDir, relative);
  // Never serve outside the built client directory.
  if (!target.startsWith(clientDir + path.sep)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

// The binding itself, for the image-optimisation path that does consult it.
const ASSETS = {
  async fetch(request) {
    const target = staticFile(new URL(request.url).pathname);
    if (!target) return new Response("Not found", { status: 404 });
    return new Response(fs.readFileSync(target), {
      status: 200,
      headers: { "Content-Type": contentType(target) },
    });
  },
};

const { default: worker } = await import(
  new URL("../../dist/server/index.js", import.meta.url).href
);

const env = {
  ASSETS,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "e2e-key",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY_FILE
    ? fs.readFileSync(process.env.GOOGLE_PRIVATE_KEY_FILE, "utf8")
    : undefined,
  GOOGLE_SHARED_DRIVE_ID: process.env.GOOGLE_SHARED_DRIVE_ID,
  FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_API_BASE: process.env.ANTHROPIC_API_BASE,
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const server = http.createServer((req, res) => {
  const asset = req.method === "GET" ? staticFile(req.url.split("?")[0]) : null;
  if (asset) {
    res.writeHead(200, {
      "Content-Type": contentType(asset),
      "Cache-Control": "no-store",
    });
    res.end(fs.readFileSync(asset));
    req.resume();
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    try {
      const response = await worker.fetch(request, env, ctx);
      const headers = {};
      for (const [key, value] of response.headers) {
        // node:http needs every Set-Cookie separately.
        if (key.toLowerCase() === "set-cookie") continue;
        headers[key] = value;
      }
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) headers["set-cookie"] = cookies;
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("worker-server:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("worker error");
    }
  });
});

const port = Number(process.env.WORKER_PORT || 8100);
server.listen(port, "127.0.0.1", () =>
  console.log(`worker on http://127.0.0.1:${port}`),
);
