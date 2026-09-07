"use client";

import { useState } from "react";

type Row = Record<string, unknown>;
type Field = [string, string, string?];
const groups: { title: string; fields: Field[] }[] = [
  { title: "Identity and contact", fields: [["firstName", "First name"], ["lastName", "Last name"], ["preferredName", "Preferred name"], ["dateOfBirth", "Date of birth", "date"], ["email", "Email", "email"], ["mobile", "Mobile", "tel"], ["alternatePhone", "Alternate mobile", "tel"], ["nationality", "Nationality"]] },
  { title: "Personal details", fields: [["gender", "Gender"], ["marital_status", "Marital status"], ["country_of_birth", "Country of birth"], ["current_country", "Current country"], ["preferred_language", "Preferred language"]] },
  { title: "Passport", fields: [["passport_country", "Passport country"], ["passportNumber", "New or corrected passport number"], ["passportIssueDate", "Passport issue date", "date"], ["passportExpiry", "Passport expiry date", "date"]] },
  { title: "Address", fields: [["line1", "Street address"], ["city", "City"], ["state", "State / province"], ["postcode", "Postcode"]] },
  { title: "Travel, refusals and history gaps", fields: [["visitedOtherCountry", "Visited another country"], ["travelCountry", "Travel country"], ["travelDate", "Travel date", "date"], ["travelPurpose", "Travel purpose"], ["hasVisaRefusal", "Visa refusal"], ["refusalDetails", "Refusal details"], ["gapFrom", "Gap from", "date"], ["gapTo", "Gap to", "date"], ["gapReason", "Gap reason"]] },
];
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const value = (v: unknown) => typeof v === "string" ? v : "";

export function ClientProfileEditor({ client, canModify, onSave }: {
  client: Row; canModify: boolean; onSave: (body: Row) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const custom = object(client.custom_fields);
  const address = object(client.address);
  const initial: Record<string, string> = {
    ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, value(v)])),
    ...Object.fromEntries(["visitedOtherCountry", "travelCountry", "travelDate", "travelPurpose", "hasVisaRefusal", "refusalDetails", "gapFrom", "gapTo", "gapReason"].map(k => [k, value(custom[k])])),
    ...Object.fromEntries(["line1", "city", "state", "postcode"].map(k => [k, value(address[k])])),
    firstName: value(client.first_name), lastName: value(client.last_name), preferredName: value(client.preferred_name),
    dateOfBirth: value(client.date_of_birth), passportExpiry: value(client.passport_expiry),
    alternatePhone: value(custom.alternatePhone), passportIssueDate: value(custom.passportIssueDate ?? custom.passportIssue), passportNumber: "",
  };
  if (!canModify) return null;
  return <details className="panel caseProfileEditor">
    <summary>Edit client profile</summary>
    <form onChange={() => setMessage("")} onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const changes: Row = { action: "personal", clientId: client.id };
      const addressChanges: Row = {};
      for (const { fields } of groups) for (const [name] of fields) {
        const next = String(data.get(name) ?? "");
        if (next === (initial[name] ?? "")) continue;
        if (["line1", "city", "state", "postcode"].includes(name)) addressChanges[name] = next;
        else changes[name] = next;
      }
      if (Object.keys(addressChanges).length) changes.address = addressChanges;
      if (Object.keys(changes).length === 2) { setMessage("No changes to save."); return; }
      setSaving(true);
      try {
        if (await onSave(changes)) {
          setMessage("Client profile saved.");
          const passport = form.elements.namedItem("passportNumber") as HTMLInputElement | null;
          if (passport) passport.value = "";
        }
      } finally { setSaving(false); }
    }}>
      {groups.map(group => <fieldset key={group.title} disabled={saving}>
        <legend>{group.title}</legend>
        {group.title === "Passport" && <p className="coverageIntro">Current number: {value(client.passport_masked) || "Not recorded"}. Leave the number blank to keep it unchanged. New values are encrypted.</p>}
        <div className="caseProfileFields">{group.fields.map(([name, label, type = "text"]) => <label key={name}>
          {label}
          <input name={name} type={type} defaultValue={initial[name] ?? ""} required={name === "firstName"} autoComplete={name === "passportNumber" ? "off" : undefined} maxLength={type === "date" ? undefined : 250} />
        </label>)}</div>
      </fieldset>)}
      <div className="formActions"><button className="primaryButton" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button><span role="status">{message}</span></div>
    </form>
  </details>;
}
