import test from "node:test";
import assert from "node:assert/strict";
import { canUse, canEdit, canEditAny, permissionKeys, validatedAccess, editableFunctions } from "../lib/function-access.ts";

const staff = (functionAccess, serviceMode = "study") => ({ role: "staff", functionAccess, serviceMode });

test("an account with no edit keys keeps full edit access to everything it can see", () => {
  const person = staff({ finance: false });
  assert.equal(canEdit(person, "enquiries"), true);
  assert.equal(canEdit(person, "work"), true);
  assert.equal(canEdit(person, "finance"), false, "edit never exceeds view");
});

test("view-only on a section allows reading but not editing, in that workspace only", () => {
  const person = staff({ "study.edit.enquiries": false });
  assert.equal(canUse(person, "enquiries"), true);
  assert.equal(canEdit(person, "enquiries"), false);
  assert.equal(canEdit(person, "enquiries", "direct_visa"), true, "the other workspace is unaffected");
  assert.equal(canEdit(staff({ "edit.enquiries": false }), "enquiries", "direct_visa"), false, "the unscoped key denies both");
});

test("edit keys are understood as permission keys and resolve through canUse", () => {
  const person = staff({ "edit.work": false });
  assert.equal(canUse(person, "edit.work"), false);
  assert.equal(canUse(person, "study.edit.work"), false);
  assert.equal(canUse(person, "work"), true);
  assert.ok(permissionKeys.includes("edit.work"));
  assert.ok(permissionKeys.includes("direct_visa.edit.finance"));
  assert.deepEqual(validatedAccess({ "edit.work": false, "study.edit.finance": true }), { "edit.work": false, "study.edit.finance": true });
  assert.throws(() => validatedAccess({ "edit.dashboard": false }), /valid function access/);
});

test("detail permissions follow the section they belong to", () => {
  const person = staff({ "edit.documents": false, "edit.communications": false });
  assert.equal(canEdit(person, "student_documents"), false);
  assert.equal(canEdit(person, "whatsapp"), false);
  assert.equal(canUse(person, "student_documents"), true);
});

test("sections that are read-only by nature are editable whenever visible, and super admins always edit", () => {
  assert.ok(!editableFunctions.includes("reports"));
  assert.equal(canEdit(staff({}), "reports"), true);
  assert.equal(canEdit({ role: "super_admin", functionAccess: { "edit.enquiries": false } }, "enquiries"), true);
  assert.equal(canEditAny(staff({ "edit.enquiries": false, "edit.students": false }), ["enquiries", "students"]), false);
  assert.equal(canEditAny(staff({ "edit.enquiries": false }), ["enquiries", "students"]), true);
});
