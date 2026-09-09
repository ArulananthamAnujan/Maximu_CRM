"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Copy, FileText, Mail, Search, Sparkles } from "lucide-react";
import { WorkspaceConnection } from "./workspace-connection";

type Match = { caseId: string | null; title: string; reference: string };
type Result = { response: string; subject: string; client: { id: string; name: string; email: string } | null; sources: { id: string; label: string; href: string }[]; warnings: string[] };
const starters = ["Summarise this case and the next recorded actions.", "What documents are still outstanding?", "Draft a detailed progress update email.", "Write a friendly follow-up message."];

export function CopilotPanel({ initialCaseId = "", standalone = false }: { initialCaseId?: string; standalone?: boolean }) {
  const [caseId, setCaseId] = useState(initialCaseId);
  const [caseLabel, setCaseLabel] = useState(initialCaseId ? "Selected case" : "General writing");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mode, setMode] = useState("answer");
  const [tone, setTone] = useState("Professional");
  const [language, setLanguage] = useState("English");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<{ id: string; response: string; at: string }[]>([]);
  const generation = useRef(0);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true); setSearchError("");
      void fetch(`/api/crm/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Search is unavailable.");
        if (!controller.signal.aborted) setMatches(body.results ?? []);
      }).catch(reason => { if (!controller.signal.aborted) { setMatches([]); setSearchError(reason.message); } }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => {
    if (!caseId) return;
    const controller = new AbortController();
    void fetch(`/api/crm/ai?caseId=${encodeURIComponent(caseId)}`, { signal: controller.signal, cache: "no-store" }).then(async response => { const body = await response.json(); if (response.ok && !controller.signal.aborted) setHistory(body.interactions ?? []); }).catch(() => {});
    return () => controller.abort();
  }, [caseId, result]);
  const choose = (id: string, label: string) => {
    generation.current++; setCaseId(id); setCaseLabel(label); setQuery(""); setMatches([]); setResult(null); setText(""); setSubject(""); setHistory([]); setInstruction(""); setDraft(""); setError(""); setNotice(""); setBusy(false);
  };
  const ask = async () => {
    const current = ++generation.current; setBusy(true); setError(""); setNotice(""); setResult(null); setText(""); setSubject("");
    try {
      const response = await fetch("/api/crm/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ caseId: caseId || null, instruction, draft, mode, tone, language }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Copilot could not respond.");
      if (generation.current !== current) return;
      setResult(body); setSubject(body.subject); setText(body.response); if (body.client) setCaseLabel(body.client.name);
    } catch (reason) { if (generation.current === current) setError(reason instanceof Error ? reason.message : "Please try again."); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const save = async (kind: "note" | "email") => {
    if (!caseId || !text || !result) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(kind === "note" ? "/api/crm/operations" : "/api/crm/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "note" ? { action: "case_note", caseId, body: text, visibility: "case_team" } : { action: "message", caseId, clientId: result.client?.id, to: result.client?.email, subject, body: text }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The draft could not be saved.");
      setNotice(kind === "note" ? "Saved to the case notes." : "Email draft saved to the shared case conversation. It has not been sent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setSaving(false); }
  };
  return <section className={`copilotPage ${standalone ? "copilotStandalone" : ""}`}>
    <header className="copilotHeader"><div>{standalone && <Link href="/" className="copilotBack"><ArrowLeft size={16} />Back to CRM</Link>}<h1><Sparkles size={28} />Copilot</h1><p>Understand a case. Find the details. Write with confidence.</p></div><span className="copilotReview">Drafts for staff review</span></header>
    <WorkspaceConnection />
    <div className="copilotGrid"><aside className="copilotContext">
      <h2>Working with</h2><div className="copilotCase"><strong>{caseLabel}</strong>{caseId ? <><a href={`/?case=${caseId}`} target="_blank" rel="noreferrer">Open case <ArrowUpRight size={15} /></a><button disabled={busy || saving} onClick={() => choose("", "General writing")}>Clear case</button></> : <p>Select a client for answers from their records.</p>}</div>
      <label className="copilotSearch"><span>Find a client or case</span><span><Search size={17} /><input value={query} maxLength={100} disabled={busy || saving} onChange={event => { setQuery(event.target.value); setSearching(event.target.value.trim().length >= 2); setMatches([]); setSearchError(""); }} placeholder="Name, email or case number" /></span></label>
      {query.trim().length >= 2 && <div className="copilotMatches" aria-live="polite">{searching ? <p>Searching…</p> : searchError ? <p role="alert">{searchError}</p> : matches.length ? matches.map((match, i) => <button key={`${match.caseId}-${i}`} disabled={!match.caseId || busy || saving} onClick={() => choose(match.caseId!, `${match.title} · ${match.reference}`)}><strong>{match.title}</strong><span>{match.reference}{!match.caseId ? " · No case linked" : ""}</span></button>) : <p>No matching cases.</p>}</div>}
      <h2>Try asking</h2><div className="copilotStarters">{starters.map((prompt, i) => <button key={prompt} disabled={busy || saving} onClick={() => { setInstruction(prompt); setMode(i === 2 ? "email" : i === 3 ? "message" : "answer"); }}>{prompt}</button>)}</div>
      {history.length > 0 && <details className="copilotHistory"><summary>Earlier work on this case ({history.length})</summary>{history.map(item => <details key={item.id}><summary>{new Date(item.at).toLocaleString()}</summary><p>{item.response}</p></details>)}</details>}
    </aside><main className="copilotWork">
      <form onSubmit={event => { event.preventDefault(); void ask(); }}>
        <div className="copilotOptions"><label>Help me with<select value={mode} disabled={busy || saving} onChange={event => setMode(event.target.value)}><option value="answer">Find information</option><option value="email">Detailed email</option><option value="message">Short message</option><option value="rewrite">Improve or translate a draft</option></select></label><label>Tone<select value={tone} disabled={busy || saving} onChange={event => setTone(event.target.value)}>{["Professional", "Friendly", "Formal"].map(item => <option key={item}>{item}</option>)}</select></label><label>Language<input value={language} maxLength={60} required disabled={busy || saving} onChange={event => setLanguage(event.target.value)} /></label></div>
        <label className="copilotPrompt">What would you like help with?<textarea value={instruction} maxLength={4000} required rows={4} disabled={busy || saving} onChange={event => setInstruction(event.target.value)} placeholder="Explain what you need, who the message is for, and any details to include." /></label>
        <details open={mode === "rewrite" ? true : undefined}><summary>Add text to improve or extra background</summary><textarea aria-label="Existing draft or background" value={draft} maxLength={12000} rows={5} disabled={busy || saving} onChange={event => setDraft(event.target.value)} /></details>
        <div className="copilotAsk"><span>{caseId ? "Uses records you can access." : "General writing · no client records selected"}</span><button className="primaryButton" disabled={busy || saving || !instruction.trim()}><Sparkles size={18} />{busy ? "Preparing your response…" : "Ask Copilot"}</button></div>
      </form>
      {error && <p role="alert" className="caseWorkError">{error}</p>}{notice && <p role="status" className="copilotNotice">{notice}</p>}
      {busy && <div className="copilotPending" role="status">Reviewing the available information and preparing your response…</div>}
      {result && <article className="copilotResult"><header><h2>{subject ? "Email draft" : "Your response"}</h2><button onClick={() => { void navigator.clipboard.writeText([subject, text].filter(Boolean).join("\n\n")).then(() => setNotice("Copied."), () => setError("Copy failed. Select and copy the text below.")); }}><Copy size={16} />Copy</button></header>
        {(subject || mode === "email") && <label>Subject<input value={subject} maxLength={500} onChange={event => setSubject(event.target.value)} /></label>}
        <label>{subject ? "Email body — review and edit" : "Response — review and edit"}<textarea value={text} rows={14} maxLength={12000} onChange={event => setText(event.target.value)} /></label>
        <div className="copilotSources">{result.sources.length > 0 && <><strong>Sources used</strong>{result.sources.map(source => <a key={source.id} href={source.href} target="_blank" rel="noreferrer">[{source.id}] {source.label}<ArrowUpRight size={14} /></a>)}</>}</div>
        {result.warnings.length > 0 && <details className="copilotLimits"><summary>Context and items to check ({result.warnings.length})</summary><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
        <footer><button disabled={!caseId || saving || !text.trim()} onClick={() => void save("note")}><FileText size={17} />Save as case note</button><button className="primaryButton" disabled={!caseId || !result.client?.email || !subject.trim() || saving || !text.trim()} onClick={() => void save("email")}><Mail size={17} />{saving ? "Saving…" : "Save email draft"}</button></footer>
        {caseId && !result.client?.email && <p>Add the client’s email address to their case to save an email draft.</p>}
      </article>}
    </main></div>
  </section>;
}
