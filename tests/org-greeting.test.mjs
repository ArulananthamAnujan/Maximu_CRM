import test from "node:test";
import assert from "node:assert/strict";
import { orgGreeting } from "../lib/timezone.ts";

// Melbourne is UTC+11 in November (daylight saving).
test("the dashboard greets by the organisation's clock, not the server's", () => {
  assert.equal(orgGreeting(new Date("2026-11-03T21:00:00Z")), "Good morning");   // 08:00 Melbourne
  assert.equal(orgGreeting(new Date("2026-11-03T03:00:00Z")), "Good afternoon"); // 14:00 Melbourne
  assert.equal(orgGreeting(new Date("2026-11-03T09:00:00Z")), "Good evening");   // 20:00 Melbourne
});
