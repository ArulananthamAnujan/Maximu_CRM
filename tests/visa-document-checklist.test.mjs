import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = await readFile(
  new URL("../app/api/crm/workspace/route.ts", import.meta.url),
  "utf8",
);
const templates = await readFile(
  new URL("../lib/visa-document-checklist.ts", import.meta.url),
  "utf8",
);

test("visa checklist covers the principal evidence categories", () => {
  for (const category of [
    "Identity",
    "Family and relationships",
    "Immigration history",
    "Character and health",
    "Financial capacity",
    "Employment and skills",
    "Education and English",
    "Application support",
  ]) assert.match(templates, new RegExp(category));
});

test("only selected visa documents become client-visible requests", () => {
  assert.match(page, /visaDoc_\$\{item\.key\}/);
  assert.match(api, /client_visible: true/);
  assert.match(page, /x\.clientVisible !== false/);
});

test("unticking never removes received evidence", () => {
  assert.match(api, /!current\.drive_file_id/);
  assert.match(api, /state: "archived"/);
  assert.match(api, /withdrawn_at/);
});

