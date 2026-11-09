"use client";

import { useId, useState } from "react";

export function CaseBranchTransfer({ caseId, branchId, branchName, branches, onTransferred, open, onClose }: {
  caseId: string;
  branchId: string | null;
  branchName: string;
  branches: { id: string; name: string }[];
  onTransferred: (transfer: { branchId: string; branch: string }) => void | Promise<void>;
  /** Opened from the "Transfer branch" action in the case header. */
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const setOpen = (next: boolean) => { if (!next) onClose(); };
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const destinationName = branches.find(branch => branch.id === destination)?.name;

  if (!open && !notice) return null;
  return (
    <section className="caseBranchTransfer" aria-label="Branch transfer">
      {open && <div className="caseBranchTransferHead">
        <div><strong>Transfer this case to another branch</strong><p>Today every Admin and Staff account in {branchName || "the assigned branch"} can work on it.</p></div>
      </div>}
      {notice && <p role="status">{notice} <button type="button" className="textButton" onClick={() => setNotice("")}>Dismiss</button></p>}
      {open && <form onSubmit={async event => {
        event.preventDefault();
        if (busy || !destination || !reason.trim()) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/crm/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "transfer_branch", caseId, destinationBranchId: destination, expectedBranchId: branchId, reason: reason.trim() }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "The case could not be transferred.");
          onClose();
          setDestination("");
          setReason("");
          setNotice(`Transferred to ${result.transfer.branch}. Its Admin and Staff accounts now have access.`);
          // The mutation is complete. A refresh failure must never be shown
          // as a failed transfer or invite the user to submit it twice.
          try { await onTransferred(result.transfer); }
          catch { setNotice(`Transferred to ${result.transfer.branch}. Refresh the register to see the updated branch.`); }
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "The case could not be transferred.");
        } finally { setBusy(false); }
      }}>
        <div className="caseBranchTransferFields">
          <div><label htmlFor={`${formId}-branch`}>Destination branch</label><select id={`${formId}-branch`} required value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a branch</option>
            {branches.filter(branch => branch.id !== branchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></div>
          <div><label htmlFor={`${formId}-reason`}>Transfer reason</label><textarea id={`${formId}-reason`} required maxLength={2000} rows={2} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Explain the branch handover" /></div>
        </div>
        <p>The complete case history stays attached. {destinationName || "The destination branch"} will receive access; the previous branch will lose access to this case. Other cases for this client stay in their current branches.</p>
        {error && <p role="alert" className="formError">{error}</p>}
        <div className="caseBranchTransferActions">
          <button type="button" className="ghostButton" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
          <button type="submit" className="primaryButton" disabled={busy || !destination || !reason.trim()}>{busy ? "Transferring…" : "Confirm branch transfer"}</button>
        </div>
      </form>}
    </section>
  );
}
