"use client";
import { useEffect, useState } from "react";
import { Download, Eye, X } from "lucide-react";
import { saveDownload } from "@/lib/mobile-platform";
import styles from "./document-actions.module.css";

export function DocumentActions({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; type: string; text?: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function retrieve(view: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/documents?documentId=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The document could not be retrieved. Please try again.");
      }
      const blob = await response.blob();
      if (!view) { saveDownload(blob, name); return; }
      const type = blob.type.split(";")[0];
      if (!["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"].includes(type)) {
        throw new Error("Preview is unavailable for this file type. Use Download to open it.");
      }
      setPreview({ url: URL.createObjectURL(blob), type, ...(type === "text/plain" ? { text: await blob.text() } : {}) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be retrieved.");
    } finally { setBusy(false); }
  }
  return <div className={styles.actions}>
    <button type="button" className="ghostButton" disabled={busy} onClick={() => void retrieve(true)}><Eye size={14} />View</button>
    <button type="button" className="ghostButton" disabled={busy} onClick={() => void retrieve(false)}><Download size={14} />{busy ? "Loading…" : "Download"}</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && <div className={styles.backdrop} onClick={() => setPreview(null)}>
      <section role="dialog" aria-modal="true" aria-label={`Document preview: ${name}`} className={styles.preview} onClick={event => event.stopPropagation()}>
        <header><strong>{name}</strong><button type="button" className="ghostButton" onClick={() => setPreview(null)} autoFocus><X size={16} />Close document</button></header>
        {preview.type === "text/plain" ? <pre>{preview.text}</pre> : <iframe title={name} src={preview.url} />}
      </section>
    </div>}
  </div>;
}
