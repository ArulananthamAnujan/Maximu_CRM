"use client";

import { useId, useRef, useState } from "react";
import { useOverlayFocus } from "./use-overlay-focus";

type Person = { id: string; display_name: string; email: string; branch_id: string | null; active: boolean; level: string };

export function StaffDeleteDialog({ person, profiles, onDelete, onClose }: {
  person: Person;
  profiles: Person[];
  onDelete: (replacement: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const isClient = person.level === "student";
  const panel = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const [replacement, setReplacement] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) onClose(); };
  useOverlayFocus(true, panel, close);
  return <div className="modalBackdrop staffDeleteBackdrop" ref={panel} role="dialog" aria-modal="true" aria-label={isClient ? "Delete client login" : "Delete staff account"} tabIndex={-1}>
    <section className="staffDeleteDialog">
      <header><div><span className="kicker">{isClient ? "CLIENT LOGIN" : "STAFF ACCOUNT"}</span><h2>Delete {person.display_name}?</h2></div><button type="button" className="ghostButton" disabled={busy} onClick={close}>Cancel</button></header>
      <p className="staffDeleteIdentity">{person.email}</p>
      <p>This permanently removes their login and takes them out of the account list. You can then create a fresh account with the same email.</p>
      <p>Their past notes, documents, messages and audit entries stay in the CRM with their name. Branch cases remain available to your team.</p>
      {!isClient && <><label htmlFor={`${fieldId}-replacement`}>Hand over open responsibilities</label>
      <select id={`${fieldId}-replacement`} value={replacement} disabled={busy} onChange={event => setReplacement(event.target.value)}>
        <option value="">No open responsibilities to hand over</option>
        {profiles.filter(candidate => candidate.active && candidate.id !== person.id && candidate.level !== "student" && candidate.branch_id === person.branch_id).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>)}
      </select>
      <p className="fieldHint">If they have open case assignments, choose an active colleague in the same branch.</p></>}
      <label className="staffDeleteConfirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I understand this account cannot be reactivated after deletion.</label>
      {error && <p role="alert" className="formError">{error}</p>}
      <footer><button type="button" className="primaryButton staffDeleteButton" disabled={busy || !confirmed} onClick={async () => {
        setBusy(true); setError("");
        try { if (await onDelete(replacement || null)) onClose(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "The account could not be deleted. Please retry."); }
        finally { setBusy(false); }
      }}>{busy ? "Deleting account…" : "Permanently delete account"}</button></footer>
    </section>
  </div>;
}
