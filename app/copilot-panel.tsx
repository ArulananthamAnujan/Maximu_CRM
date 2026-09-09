"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Copy, FileText, Mail, Plus, Search, Sparkles, X } from "lucide-react";

export type Match = { caseId: string | null; title: string; reference: string; subtitle?: string };
export type CopilotContext = { key: string; label: string; caseId?: string; email?: { subject: string; from: string; body: string } };
type Result = { response: string; subject: string; client: { id: string; name: string; email: string } | null; sources: { id: string; label: string; href: string }[]; warnings: string[] };
const starters = ["Summarise this case", "What needs attention?", "Draft a progress email"];

export function CopilotPanel({ context, onClose, onChooseCase }: { context: CopilotContext; onClose: () => void; onChooseCase: (match: Match) => void }) {
  const caseId = context.caseId || "";
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, { at: number; results: Match[] }>());
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
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<{ prompt: string; text: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; at: string; response: string }[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" }); }, [busy, result]);
  useEffect(() => {
    if (!caseId || !historyOpen) return;
    const controller = new AbortController();
    void fetch(`/api/crm/ai?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Earlier work could not be loaded.");
      if (!controller.signal.aborted) { setHistory(body.interactions ?? []); setHistoryError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setHistoryError(reason.message); });
    return () => controller.abort();
  }, [caseId, historyOpen, result]);
  useEffect(() => {
    if (!picker || query.trim().length === 1) return;
    const key = query.trim().toLowerCase();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchError("");
      const saved = cache.current.get(key);
      if (saved && Date.now() - saved.at < 30000) { setMatches(saved.results); setSearching(false); return; }
      setSearching(true);
      void fetch(`/api/crm/search?scope=cases&q=${encodeURIComponent(query.trim())}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: "no-store" }).then(async response => {
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Search is unavailable.");
        if (!controller.signal.aborted) {
          const rows = body.results ?? []; setMatches(rows);
          if (!key) setRecent(rows);
          cache.current.set(key, { at: Date.now(), results: rows });
          if (cache.current.size > 25) cache.current.delete(cache.current.keys().next().value!);
        }
      }).catch(reason => { if (!controller.signal.aborted) setSearchError(reason.name === "TimeoutError" ? "Search is taking longer than expected. Try a full name or case number." : reason.message); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, key ? 180 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, picker, retry]);
  const changeQuery = (value: string) => {
    setQuery(value); setSearchError(""); setSearching(value.trim().length !== 1);
    const key = value.trim().toLowerCase();
    setMatches(cache.current.get(key)?.results ?? recent.filter(row => `${row.title} ${row.reference} ${row.subtitle}`.toLowerCase().includes(key)));
  };
  const ask = async () => {
    if (!instruction.trim() || busy || saving) return;
    const controller = new AbortController(); request.current = controller;
    const previous = [...turns, ...(result ? [{ prompt, text: [subject, text].filter(Boolean).join("\n\n") }] : [])].slice(-3);
    setTurns(previous); setPrompt(instruction); setBusy(true); setError(""); setNotice(""); setResult(null); setText(""); setSubject(""); setInstruction("");
    const background = [context.email ? `Open email (staff-provided context):\nSubject: ${context.email.subject}\nFrom: ${context.email.from}\n${context.email.body.slice(0, 7000)}` : "", previous.length ? `Earlier conversation:\n${previous.map(turn => `Staff: ${turn.prompt}\nCopilot: ${turn.text}`).join("\n\n").slice(-3000)}` : "", draft ? `Selected text or background:\n${draft.slice(0, 1500)}` : ""].filter(Boolean).join("\n\n").slice(0, 12000);
    try {
      const response = await fetch("/api/crm/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]), body: JSON.stringify({ caseId: caseId || null, instruction, draft: background, mode, tone, language }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Copilot could not respond.");
      if (!controller.signal.aborted) { setResult(body); setSubject(body.subject || ""); setText(body.response); }
    } catch (reason) { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Please try again."); setInstruction(instruction); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const save = async (kind: "note" | "email") => {
    if (!caseId || !text || !result) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(kind === "note" ? "/api/crm/operations" : "/api/crm/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "note" ? { action: "case_note", caseId, body: text, visibility: "case_team" } : { action: "message", caseId, clientId: result.client?.id, to: result.client?.email, subject, body: text }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The draft could not be saved.");
      setNotice(kind === "note" ? "Saved to case notes." : "Saved to the shared case conversation as an unsent email draft.");
      window.dispatchEvent(new CustomEvent("maximus:copilot-saved", { detail: { caseId } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setSaving(false); }
  };
  const attachSelection = () => {
    const selection = window.getSelection();
    if (selection?.anchorNode?.parentElement?.closest(".copilotDock")) { setNotice("Select text in the case or email, then choose Use selected text."); return; }
    const selected = selection?.toString().trim();
    if (selected) { setDraft(selected.slice(0, 1500)); setNotice(selected.length > 1500 ? "Added the first 1,500 characters of your selection." : "Selected text added."); }
    else setNotice("Select text in the case or email, then choose Use selected text.");
  };
  return <section className="copilotPanel">
    <header className="copilotDockHeader"><h2><Sparkles size={21} />Copilot</h2><button type="button" onClick={onClose} aria-label="Close Copilot"><X size={20} /></button></header>
    <div className="copilotContextBar"><span title={context.label}>{context.email ? <Mail size={16} /> : <FileText size={16} />}<strong>{context.label}</strong></span><button type="button" disabled={busy || saving} onClick={() => setPicker(value => !value)} aria-expanded={picker} aria-label="Find a case"><Search size={17} /></button></div>
    {picker && <div className="copilotPicker"><label>Find a case<input type="search" value={query} maxLength={100} onChange={event => changeQuery(event.target.value)} placeholder="Name, email or case number" /></label><div className="copilotMatches" aria-live="polite">
      {!query && <small>Recent cases</small>}{searching && <small role="status">Searching…</small>}{searchError && <p role="alert">{searchError} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
      {matches.map(match => <button key={match.caseId} disabled={!match.caseId || busy || saving} onClick={() => { setPicker(false); onChooseCase(match); }}><strong>{match.title}</strong><small>{match.reference} · {match.subtitle}</small></button>)}
      {query.length === 1 && <small>Type at least two characters.</small>}{!searching && !searchError && !matches.length && query.length !== 1 && <p>No matching cases.</p>}
    </div></div>}
    <div className="copilotFeed" ref={feed}>
      {caseId && <details className="copilotEarlierWork" open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Earlier Copilot work on this case</summary>{historyError ? <p role="alert">{historyError}</p> : history === null ? <p role="status">Loading earlier work…</p> : history.length ? history.map(item => <details key={item.id}><summary>{new Date(item.at).toLocaleString()}</summary><p className="copilotAnswerText">{item.response}</p></details>) : <p>No earlier work saved.</p>}</details>}
      {!prompt && <div className="copilotWelcome"><Sparkles size={25} /><h3>How can I help?</h3><p>{context.email ? "Ask about this email or draft a reply." : caseId ? "Ask about this case, check the next steps or draft a message." : "Open a case or email to use its information here."}</p><div className="copilotStarters">{(context.email ? ["Summarise this email", "Draft a reply", "What do I need to do?"] : starters).map((starter, i) => <button key={starter} onClick={() => { setInstruction(starter); setMode((context.email ? i === 1 : i === 2) ? "email" : "answer"); input.current?.focus(); }}>{starter}</button>)}</div></div>}
      {turns.map((turn, i) => <div key={i} className="copilotPastTurn"><p className="copilotUserMessage">{turn.prompt}</p><p className="copilotAnswerText">{turn.text}</p></div>)}
      {prompt && <p className="copilotUserMessage">{prompt}</p>}
      {busy && <div className="copilotPending" role="status">Preparing your response…</div>}
      {error && <p role="alert" className="copilotError">{error}</p>}
      {result && <article className="copilotResult">
        {subject && <label>Subject<input value={subject} maxLength={500} onChange={event => setSubject(event.target.value)} /></label>}
        <label>{subject ? "Email draft" : "Response"}<textarea value={text} rows={Math.min(20, Math.max(6, Math.ceil(text.length / 48)))} maxLength={12000} onChange={event => setText(event.target.value)} /></label>
        <div className="copilotResultActions"><button onClick={() => { void navigator.clipboard.writeText([subject, text].filter(Boolean).join("\n\n")).then(() => setNotice("Copied."), () => setError("Copy failed. Select and copy the response.")); }}><Copy size={15} />Copy</button>{caseId && <><button disabled={saving || !text.trim()} onClick={() => void save("note")}><FileText size={15} />Save note</button><button disabled={!result.client?.email || !subject.trim() || saving || !text.trim()} onClick={() => void save("email")}><Mail size={15} />Save email draft</button></>}</div>
        {result.sources.length > 0 && <details className="copilotSources"><summary>Sources ({result.sources.length})</summary>{result.sources.map(source => <a key={source.id} href={source.href} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13} /></a>)}</details>}
        {result.warnings.length > 0 && <details className="copilotLimits"><summary>Items to check ({result.warnings.length})</summary><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      </article>}
      {notice && <p role="status" className="copilotNotice">{notice}</p>}
    </div>
    <form className="copilotComposer" onSubmit={event => { event.preventDefault(); void ask(); }}>
      {draft && <div className="copilotAttachment"><span>{draft}</span><button type="button" onClick={() => setDraft("")} aria-label="Remove selected text"><X size={14} /></button></div>}
      <textarea ref={input} value={instruction} maxLength={4000} rows={3} disabled={busy || saving} onChange={event => setInstruction(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Message Copilot…" aria-label="Message Copilot" />
      <div className="copilotComposerTools"><button type="button" onMouseDown={event => event.preventDefault()} onClick={attachSelection} title="Use selected text"><Plus size={18} /><span>Use selected text</span></button>{busy ? <button type="button" onClick={() => { request.current?.abort(); setBusy(false); setNotice("Stopped. You can ask again."); }} aria-label="Stop response">Stop</button> : <button type="submit" className="copilotSend" disabled={saving || !instruction.trim()} aria-label="Send to Copilot"><ArrowUp size={19} /></button>}</div>
      <details className="copilotWritingOptions"><summary>Writing options</summary><div><label>Task<select value={mode} onChange={event => setMode(event.target.value)}><option value="answer">Find information</option><option value="email">Email draft</option><option value="message">Short message</option><option value="rewrite">Improve writing</option></select></label><label>Tone<select value={tone} onChange={event => setTone(event.target.value)}><option>Professional</option><option>Friendly</option><option>Formal</option></select></label><label>Language<input value={language} maxLength={60} onChange={event => setLanguage(event.target.value)} /></label></div></details>
      <small className="copilotReview">Review drafts before using them. Enter to send · Shift+Enter for a new line.</small>
    </form>
  </section>;
}
