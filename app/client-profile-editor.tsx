"use client";

import { useState } from "react";
import { ComboBox } from "./combo-box";
import { COUNTRIES, LANGUAGES, stateOptions } from "@/lib/reference-lists";

type Row = Record<string, unknown>;
type Field = [string, string, string?];
const groups: { title: string; fields: Field[] }[] = [
  { title: "Identity and contact", fields: [["firstName", "First name"], ["lastName", "Last name"], ["preferredName", "Preferred name"], ["dateOfBirth", "Date of birth", "date"], ["email", "Email", "email"], ["mobile", "Mobile", "tel"], ["alternatePhone", "Alternate mobile", "tel"], ["nationality", "Nationality"]] },
  { title: "Personal details", fields: [["gender", "Gender"], ["marital_status", "Marital status"], ["country_of_birth", "Country of birth"], ["current_country", "Current country"], ["preferred_language", "Preferred language"]] },
  { title: "Passport", fields: [["passport_country", "Passport country"], ["passportNumber", "New or corrected passport number"], ["passportIssueDate", "Passport issue date", "date"], ["passportExpiry", "Passport expiry date", "date"]] },
  { title: "Address", fields: [["line1", "Street address"], ["city", "City"], ["state", "State / province"], ["postcode", "Postcode"]] },
  { title: "Travel, refusals and history gaps", fields: [["visitedOtherCountry", "Visited another country"], ["travelCountry", "Travel country"], ["travelDate", "Travel date", "date"], ["travelPurpose", "Travel purpose"], ["hasVisaRefusal", "Visa refusal"], ["refusalDetails", "Refusal details"], ["gapFrom", "Gap from", "date"], ["gapTo", "Gap to", "date"], ["gapReason", "Gap reason"]] },
];
// Fields with a fixed set of answers are dropdowns, as they are on the intake
// form. Each choice is [stored value, label].
const choices: Record<string, [string, string][]> = {
  gender: [["Male", "Male"], ["Female", "Female"], ["Other", "Other"], ["Prefer not to say", "Prefer not to say"]],
  marital_status: [["single", "Single"], ["married", "Married"], ["divorced", "Divorced"], ["widowed", "Widowed"], ["separated", "Separated"]],
  visitedOtherCountry: [["yes", "Yes"], ["no", "No"]],
  hasVisaRefusal: [["yes", "Yes"], ["no", "No"]],
};
// The value on file is always one of the choices, exactly as recorded: wording
// imported from the old CRM stays selectable instead of the dropdown showing
// blank and the save wiping it.
const choicesFor = (name: string, recorded: string): [string, string][] => {
  const key = recorded.trim().toLowerCase();
  if (!key) return choices[name];
  if (choices[name].some(([stored]) => stored.toLowerCase() === key))
    return choices[name].map(([stored, label]) => stored.toLowerCase() === key ? [recorded, label] : [stored, label]);
  return [...choices[name], [recorded, recorded]];
};
// Countries, states and languages are picked from a list, with typing to
// narrow it; what is already on file stays even when it is not in the list.
const countryFields = ["nationality", "country_of_birth", "current_country", "passport_country", "travelCountry"];
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const value = (v: unknown) => typeof v === "string" ? v : "";

export function ClientProfileEditor({ client, canModify, onSave }: {
  client: Row; canModify: boolean; onSave: (body: Row) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [country, setCountry] = useState(value(client.current_country));
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
          {choices[name] ? <select name={name} defaultValue={initial[name] ?? ""}>
            <option value="">Not recorded</option>
            {choicesFor(name, initial[name] ?? "").map(([stored, text]) => <option key={stored} value={stored}>{text}</option>)}
          </select> : name === "current_country" ? <ComboBox name={name} value={country} onChange={setCountry} options={COUNTRIES} placeholder="Select country" />
            : countryFields.includes(name) ? <ComboBox name={name} defaultValue={initial[name] ?? ""} options={COUNTRIES} placeholder="Select country" />
            : name === "preferred_language" ? <ComboBox name={name} defaultValue={initial[name] ?? ""} options={LANGUAGES} placeholder="Select language" />
            : name === "state" ? <ComboBox name={name} defaultValue={initial[name] ?? ""} options={stateOptions(country)} placeholder="Select state or province" />
            : <input name={name} type={type} defaultValue={initial[name] ?? ""} required={name === "firstName"} autoComplete={name === "passportNumber" ? "off" : undefined} maxLength={type === "date" ? undefined : 250} />}
        </label>)}</div>
      </fieldset>)}
      <div className="formActions"><button className="primaryButton" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button><span role="status">{message}</span></div>
    </form>
  </details>;
}
