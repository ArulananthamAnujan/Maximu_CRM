import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "staff@maximus.test" };
const PROFILE = {
  id: USER.id,
  organisation_id: "22222222-2222-4222-8222-222222222222",
  branch_id: "33333333-3333-4333-8333-333333333333",
  display_name: "Case Officer",
  email: USER.email,
  level: "staff",
  department: "Operations",
  active: true,
};
const DOCUMENT_ID = "66666666-6666-4666-8666-666666666666";

async function startStub(replacementMode) {
  const events = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/token") return send(200, {access_token:"test-google-token",expires_in:3600});
      if (url.pathname.startsWith("/upload/drive/v3/files")) { events.push("upload"); return send(200,{id:"new-file",mimeType:"text/plain",size:"4"}); }
      if (url.pathname === "/drive/v3/files/old-file" && req.method === "PATCH") {events.push("trash-old");return send(200,{id:"old-file"});}
      if (url.pathname === "/drive/v3/files") return send(200,{files:[{id:"folder"}],id:"folder"});
      if (url.pathname === "/rest/v1/documents" && req.method === "PATCH") {
        events.push("save-document");
        if (replacementMode === "save-failed") return send(403,{message:"Save denied"});
        if (replacementMode === "zero-rows") return send(200,[]);
        return send(200,[{id:DOCUMENT_ID}]);
      }
      if (url.pathname === "/auth/v1/user") return send(200, USER);
      if (url.pathname === "/rest/v1/profiles") return send(200, [PROFILE]);
      if (url.pathname === "/rest/v1/documents")
        return send(200, [
          {
            id: DOCUMENT_ID,
            client_id: "77777777-7777-4777-8777-777777777777",
            display_name: "Passport",
            state: "requested",
            drive_file_id: replacementMode ? "old-file" : null,
            version: 1,
          },
        ]);
      if (url.pathname === "/rest/v1/clients")
        return send(200, [
          {
            id: "77777777-7777-4777-8777-777777777777",
            first_name: "Test",
            last_name: "Client",
            crm_id: "MAX-1",
            drive_folder_id: replacementMode ? "root-folder" : null,
          },
        ]);
      return send(200, []);
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, events, url: `http://127.0.0.1:${server.address().port}` };
}

async function callWorker(path, init, driveEnv = {}, replacementMode) {
  const stub = await startStub(replacementMode);
  const oldBase = process.env.GOOGLE_API_BASE, oldTokenBase = process.env.GOOGLE_TOKEN_BASE;
  if (replacementMode) { process.env.GOOGLE_API_BASE = stub.url; process.env.GOOGLE_TOKEN_BASE = stub.url; }
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("storage", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request(`https://crm.test${path}`, init),
      {
        SUPABASE_URL: stub.url,
        SUPABASE_PUBLISHABLE_KEY: "stub-key",
        ASSETS: { fetch: async () => new Response("", { status: 404 }) },
        ...driveEnv,
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: response.status, json, text, events:stub.events };
  } finally {
    if (oldBase === undefined) delete process.env.GOOGLE_API_BASE; else process.env.GOOGLE_API_BASE = oldBase;
    if (oldTokenBase === undefined) delete process.env.GOOGLE_TOKEN_BASE; else process.env.GOOGLE_TOKEN_BASE = oldTokenBase;
    stub.server.close();
  }
}

// The CRM must say what is missing rather than failing obscurely, and must
// never imply a file was stored when no storage is connected.
test("uploading without Drive configured explains what to set", async () => {
  const body = new FormData();
  body.append("documentId", DOCUMENT_ID);
  body.append("file", new File([new Uint8Array([1, 2, 3])], "p.pdf", { type: "application/pdf" }));
  const result = await callWorker("/api/crm/documents", {
    method: "POST",
    headers: { cookie: "maximus_access=token" },
    body,
  });
  assert.equal(result.status, 503);
  assert.match(result.json.error, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.match(result.json.error, /GOOGLE_SHARED_DRIVE_ID/);
});

test("the workspace reports document storage as unavailable when unset", async () => {
  const result = await callWorker("/api/crm/workspace", {
    headers: { cookie: "maximus_access=token" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.capabilities.documentStorage, false);
});

test("downloading a document that has no stored file says so", async () => {
  const result = await callWorker(
    `/api/crm/documents?documentId=${DOCUMENT_ID}`,
    { headers: { cookie: "maximus_access=token" } },
  );
  assert.equal(result.status, 400);
  assert.match(result.json.error, /no file has been stored/i);
});

test("an unauthenticated upload is refused", async () => {
  const body = new FormData();
  body.append("documentId", DOCUMENT_ID);
  body.append("file", new File([new Uint8Array([1])], "p.pdf", { type: "application/pdf" }));
  const result = await callWorker("/api/crm/documents", { method: "POST", body });
  assert.equal(result.status, 401);
});

for (const outcome of ["save-failed", "zero-rows", "success"]) test(`replacement preserves the old file until a confirmed save: ${outcome}`, async () => {
  const {privateKey} = generateKeyPairSync("rsa", {modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
  const body = new FormData();
  body.append("documentId",DOCUMENT_ID);
  body.append("file",new File(["test"],"test.txt",{type:"text/plain"}));
  const result = await callWorker("/api/crm/documents",{method:"POST",headers:{cookie:"maximus_access=token"},body},{GOOGLE_SERVICE_ACCOUNT_EMAIL:"test@service.test",GOOGLE_PRIVATE_KEY:privateKey,GOOGLE_SHARED_DRIVE_ID:"drive"},outcome);
  assert.deepEqual(result.events,outcome === "success" ? ["upload","save-document","trash-old"] : ["upload","save-document"]);
  assert.equal(result.status === 200,outcome === "success");
});
