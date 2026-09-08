"use client";

import { useState } from "react";

export function CaseBranchTransfer({ caseId, branchId, branchName, branches, onTransferred }: {
  caseId: string;
  branchId: string | null;
  branchName: string;
  branches: { id: string; name: string }[];
  onTransferred: (transfer: { branchId: string; branch: string }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const destinationName = branches.find(branch => branch.id === destination)?.name;

  return (
    <section className="caseBranchTransfer" aria-label="Branch transfer">
      <div className="caseBranchTransferHead">
        <div><strong>Branch access</strong><p>All Admin and Staff accounts in {branchName || "the assigned branch"} can work on this case.</p></div>
        {!open && <button type="button" className="ghostButton" onClick={() => { setOpen(true); setNotice(""); }}>Transfer branch</button>}
      </div>
      {notice && <p role="status">{notice}</p>}
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
          setOpen(false);
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
          <label>Destination branch<select required value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a branch</option>
            {branches.filter(branch => branch.id !== branchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Transfer reason<textarea required maxLength={2000} rows={2} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Explain the branch handover" /></label>
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
