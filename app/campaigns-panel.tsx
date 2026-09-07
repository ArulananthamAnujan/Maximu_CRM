"use client";
import { useState } from "react";
import { Plus, Check, Send } from "lucide-react";
type CampaignRecord = {
  id: string;
  name: string;
  channel: "email" | "whatsapp" | "sms";
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};
type CaseRecord = { id: string; dbId?: string; name: string };
const humanise = (value: unknown) => String(value ?? "").replace(/_/g, " ");
export function CampaignsPanel({ items, cases, onChange }: {
  items: CampaignRecord[];
  cases: CaseRecord[];
  onChange: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const send = async (payload: Record<string, unknown>) => {
    setWorking(String(payload.campaignId || "create"));
    setError("");
    try {
      const response = await fetch("/api/crm/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The campaign action failed.");
      await onChange();
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign action failed.");
    } finally {
      setWorking("");
    }
  };
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div><span className="kicker">CAMPAIGNS</span><h2>Email, SMS and WhatsApp campaigns</h2></div>
        <button className="primaryButton" onClick={() => setCreating(!creating)}><Plus size={16} /> {creating ? "Close" : "New campaign"}</button>
      </div>
      <p className="coverageIntro">Build a reviewed recipient list from cases you can access. Each delivery is recorded against the campaign; free-form address uploads are not accepted.</p>
      {creating && (
        <form className="stackedForm" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void send({ action: "create", name: data.get("name"), channel: data.get("channel"), subject: data.get("subject"), body: data.get("body"), caseIds: data.getAll("caseIds") });
        }}>
          <label>Campaign name *<input name="name" required /></label>
          <label>Channel *<select name="channel" defaultValue="email"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
          <label>Subject (required for email)<input name="subject" /></label>
          <label>Recipients *<select name="caseIds" multiple required size={Math.min(8, Math.max(3, cases.length))}>{cases.map((item) => <option key={item.dbId || item.id} value={item.dbId || item.id}>{item.name} · {item.id}</option>)}</select><small className="fieldHint">Use Ctrl/Cmd to select multiple cases.</small></label>
          <label className="wide">Message *<textarea name="body" required placeholder="Use {{client_name}} and {{case_number}} where needed." /></label>
          <button className="primaryButton" disabled={Boolean(working)}><Check size={15} /> Save draft campaign</button>
        </form>
      )}
      {error && <p className="caseWorkError">{error}</p>}
      {items.length === 0 ? <p className="caseWorkEmpty">No campaigns have been created yet.</p> : items.map((item) => (
        <div className="functionalRow" key={item.id}>
          <div><strong>{item.name}</strong><span>{humanise(item.channel)} · {item.recipientCount} recipients · {item.sentCount} sent{item.failedCount ? ` · ${item.failedCount} failed` : ""}</span></div>
          <span className="status">{humanise(item.status)}</span>
          {["draft", "failed"].includes(item.status.toLowerCase()) ? <button className="primaryButton" disabled={working === item.id} onClick={() => {
            if (confirm(`Send “${item.name}” to ${item.recipientCount} selected case${item.recipientCount === 1 ? "" : "s"}?`)) void send({ action: "launch", campaignId: item.id });
          }}><Send size={14} /> {working === item.id ? "Sending…" : "Review & send"}</button> : null}
        </div>
      ))}
    </article>
  );
}
