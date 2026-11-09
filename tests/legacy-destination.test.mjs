import test from "node:test";
import assert from "node:assert/strict";
import { legacyDestination } from "../server/legacy-destination.ts";

const menu = '<option value="1">Canada</option><option value="2" selected>Australia</option><option value="44" selected>UK</option>';
test("recovers multiple actual selections instead of every option", () => {
  assert.equal(legacyDestination({ target: "", interested_country: "Canada | Australia | UK", legacy_dynamic_json: JSON.stringify({profile:{interestedCountryID:"2,44",interestedCountry:menu}})}), "Australia | UK");
});
test("empty selection stays empty even when the export contains menu text", () => {
  assert.equal(legacyDestination({interested_country:"Canada | Australia | UK",legacy_dynamic_json:JSON.stringify({profile:{interestedCountryID:"",interestedCountry:menu}})}),null);
});
test("blank aliases do not suppress a populated destination", () => {
  assert.equal(legacyDestination({target:"",interested_country:"",destination_country:"Australia"}),"Australia");
});
test("unresolvable selections fail validation", () => {
  assert.throws(()=>legacyDestination({legacy_dynamic_json:{profile:{interestedCountryID:"999",interestedCountry:menu}}}),/no matching/);
});
test("rejects the known flattened menu and raw HTML", () => {
  assert.throws(()=>legacyDestination({interested_country:"Canada | Australia | USA | Dubai | New Zealand | Ireland | Malta | Poland | France | UK | Singapore | Georgia | Bangladesh | Sri Lanka | Malaysia | South Korea | Sweden | China | Finland"}),/entire legacy/);
  assert.throws(()=>legacyDestination({interested_country:menu}),/dropdown HTML/);
});
test("retains ordinary exports and handles absent data", () => {
  assert.equal(legacyDestination({interested_country:"Australia | UK"}),"Australia | UK");
  assert.equal(legacyDestination({}),null);
});
