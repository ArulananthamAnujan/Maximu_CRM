import assert from "node:assert/strict";
import test from "node:test";
import { legacyDateLabel, timelineOrder } from "../server/legacy-timeline.ts";
test("retains source date without inventing a UTC occurrence",()=>{
  const row={occurred_at:null,metadata:{source_created_at:"19/09/2024 06:24 pm"}};
  assert.equal(legacyDateLabel(row),"19/09/2024 06:24 pm");
  assert.ok(timelineOrder({at:"",dateLabel:legacyDateLabel(row)})>0);
  assert.equal(row.occurred_at,null);
});
test("sorts original day-first dates and AM/PM",()=>{
  assert.ok(timelineOrder({at:"",dateLabel:"01/02/2025 12:01 pm"})>timelineOrder({at:"",dateLabel:"01/02/2025 12:01 am"}));
  assert.ok(timelineOrder({at:"",dateLabel:"01/02/2025"})>timelineOrder({at:"",dateLabel:"31/01/2025"}));
  assert.equal(timelineOrder({at:""}),0);
});
