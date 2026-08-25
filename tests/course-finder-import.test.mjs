import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normaliseLegacyRow } from "../scripts/import-course-finder.mjs";

test("legacy course CSV parser preserves quoted commas and line breaks", () => {
  const rows = parseCsv('id,course,entry\n1,"Business, Advanced","Line one\nLine two"\n');
  assert.deepEqual(rows, [{ id: "1", course: "Business, Advanced", entry: "Line one\nLine two" }]);
});

test("legacy course rows retain requirements while unsafe values stay in legacy data", () => {
  const { course, institution } = normaliseLegacyRow({
    id: "91", country: "1", countryName: "Australia", university: "4",
    universityName: "Example University", course: "Master of IT", course_level: "Postgraduate",
    tutionFee: "45,000", applicationFee: "not supplied", website: "example dot com",
    ielts_score: "6.5", entry: "Bachelor degree", isActive: "1",
  }, "org", "institution");
  assert.equal(institution.source_key, "1:4");
  assert.equal(course.tuition_fee, 45000);
  assert.equal(course.application_fee, null);
  assert.equal(course.website, null);
  assert.equal(course.legacy_data.raw_website, "example dot com");
  assert.equal(course.ielts_overall, 6.5);
  assert.equal(course.entry_requirements, "Bachelor degree");
});
