import test from "node:test";
import assert from "node:assert/strict";
import { parseCatalogueCsv } from "../netlify/functions/course-catalog-sync.mjs";

test("official catalogue sync parser preserves quoted course data", () => {
  const rows = parseCatalogueCsv('Provider Name,Course Name,Campus,Tuition Fee\n"Example University","Business, Advanced",Melbourne,"45,000"\n');
  assert.deepEqual(rows, [{
    "Provider Name": "Example University",
    "Course Name": "Business, Advanced",
    Campus: "Melbourne",
    "Tuition Fee": "45,000",
  }]);
});
