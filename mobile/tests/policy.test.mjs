import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { apiTarget, AUTH_REDIRECT, createProofKey, safeFilename, validAuthCallback } from "../src/policy.ts";

test("CRM requests retain paths and query values without accepting foreign origins", () => {
  assert.equal(apiTarget("/api/crm/enquiries?q=A%26B", "https://localhost"), "https://maximus-crm-next.netlify.app/api/crm/enquiries?q=A%26B");
  assert.equal(apiTarget("https://localhost/api/auth/session", "https://localhost"), "https://maximus-crm-next.netlify.app/api/auth/session");
  assert.equal(apiTarget("capacitor://localhost/api/auth/session", "capacitor://localhost"), "https://maximus-crm-next.netlify.app/api/auth/session");
  assert.equal(apiTarget("malicious://outside/api/auth/session", "capacitor://localhost"), null);
  for (const path of ["//evil.example/api/crm", "https://maximus-crm-next.netlify.app.evil.example/api/auth", "/assets/logo.svg", "/api/../private", "https://user:pass@localhost/api/auth"]) {
    assert.equal(apiTarget(path, "https://localhost"), null, path);
  }
});

test("OAuth accepts only the exact app callback with no fragment or credentials", () => {
  assert.equal(validAuthCallback(`${AUTH_REDIRECT}?code=verified-by-pkce`), true);
  for (const value of ["https://evil.example/auth/callback?code=a", `${AUTH_REDIRECT}/extra?code=a`, `${AUTH_REDIRECT}#access_token=a`, "au.com.maximuseducation.crm://user@auth/callback?code=a"]) assert.equal(validAuthCallback(value), false);
});

test("PKCE challenges prove a random verifier without exposing it", async () => {
  const first = await createProofKey(); const second = await createProofKey();
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.challenge, createHash("sha256").update(first.verifier).digest("base64url"));
  assert.notEqual(first.verifier, second.verifier);
});

test("shared filenames cannot escape their temporary directory", () => {
  assert.equal(safeFilename("../../passport.pdf"), "_.._passport.pdf");
  assert.equal(safeFilename("a\\b\n.pdf"), "a_b_.pdf");
  assert.equal(safeFilename("..."), "maximus-document");
  assert.equal(safeFilename("a".repeat(500)).length, 140);
});
