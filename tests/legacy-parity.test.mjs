import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const workspace = await readFile(
  new URL("../app/api/crm/workspace/route.ts", import.meta.url),
  "utf8",
);
const casefile = await readFile(
  new URL("../app/api/crm/casefile/route.ts", import.meta.url),
  "utf8",
);

test("complete intake captures legacy study-abroad and migration information", () => {
  for (const field of [
    "alternatePhone",
    "passportNumber",
    "destinationCountry",
    "applicationInstitution",
    "educationInstitution",
    "testType",
    "employer",
    "spouseFullName",
    "childFullName",
    "previousVisaCountry",
    "refusalDetails",
    "gapReason",
  ]) assert.match(page, new RegExp(`name=["']${field}["']`));

  for (const category of [
    "ACS Skill Assessment",
    "PSA Registration",
    "JRP Registration",
    "JRWA Registration",
    "CPA Skill Assessment",
    "Engineers Australia Skill Assessment",
  ]) assert.match(page, new RegExp(category));
});

test("complete intake persists structured case-file records", () => {
  for (const table of [
    "dependants",
    "client_education_history",
    "client_employment_history",
    "english_tests",
    "study_preferences",
    "visa_history",
    "client_declarations",
    "education_applications",
    "visa_matters",
  ]) assert.match(workspace, new RegExp(`insert\\(\\s*["']${table}["']`));
  assert.match(workspace, /persistCompleteIntake/);
  assert.match(workspace, /maskPassport/);
});

test("dashboards expose role-correct filters, operational metrics, and cross-tab refresh", () => {
  for (const label of [
    "Filter dashboard by branch",
    "Filter dashboard by country",
    "Filter dashboard by visa category",
    "Filter dashboard by intake",
    "Total active",
    "New enquiries",
    "Overdue work",
    "Awaiting action",
    "Visa expiry risk",
    "Responsibility not set",
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /canViewAllBranches \? <select aria-label="Filter dashboard by branch"/);
  assert.doesNotMatch(page, /Filter dashboard by staff/);
  assert.match(page, /maximus\.workspaceRefresh/);
  assert.match(workspace, /applicationStatus/);
  assert.match(workspace, /visaCategory/);
  for (const field of ["nextAction", "lastActivity", "lastActivityBy", "pendingDocuments", "overdueTasks"])
    assert.match(workspace, new RegExp(field));
});

test("application entry stores partner, associate, notes and milestone dates", () => {
  for (const field of ["associate", "partner", "notes", "submittedOn", "offerOn", "coeOn"])
    assert.match(page, new RegExp(`name=["']${field}["']`));
  assert.match(casefile, /offer_received_at: optionalDate\(body\.offerOn\)/);
  assert.match(casefile, /coe_received_at: optionalDate\(body\.coeOn\)/);
});
