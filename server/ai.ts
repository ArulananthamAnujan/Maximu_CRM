/**
 * The case-file assistant: drafts and summarises against context the caller
 * already has read access to. It never acts on its own -- every output is
 * text a person chooses to save as a case note or a message draft through the
 * CRM's normal, audited write paths.
 *
 * The key lives with the application, the same pattern as
 * server/protected-fields.ts and server/google-drive.ts, so it works
 * unchanged on Cloudflare Workers.
 */

export class AIProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

declare global {
  // Populated by the Worker entry point at request time.
  var __MAXIMUS_AI__: { apiKey?: string; model?: string } | undefined;
}

function apiKey(): string {
  return (
    globalThis.__MAXIMUS_AI__?.apiKey || process.env.ANTHROPIC_API_KEY || ""
  );
}

function model(): string {
  return (
    globalThis.__MAXIMUS_AI__?.model ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-5"
  );
}

export function aiConfigured(): boolean {
  return apiKey().length > 0;
}

// Overridable for the same reason server/google-drive.ts overrides its API
// base: so the audit and browser suites can point this at a stand-in server
// instead of the real Anthropic API.
function apiBase(): string {
  return (
    (globalThis.__MAXIMUS_AI__ as { apiBase?: string } | undefined)
      ?.apiBase ||
    process.env.ANTHROPIC_API_BASE ||
    "https://api.anthropic.com"
  );
}

/**
 * A prompt built entirely from case data the caller's row-level security
 * already let them read, plus their own instruction. No file contents, no
 * passport numbers, no financial figures -- the assistant drafts and
 * summarises from the case narrative, not from everything the case holds.
 */
export type CaseContext = {
  clientFirstName: string;
  caseNumber: string;
  matterType: string;
  lifecycleStage: string;
  target: string;
  visaExpiry: string;
  applications: { institution: string; course: string; status: string }[];
  visaMatter: {
    subclass: string;
    status: string;
    informationDueOn: string;
  } | null;
  recentNotes: string[];
};

const SYSTEM_PROMPT = `You are a drafting assistant inside an education and migration agency's case management system. You help a staff member summarise a case or draft a message, using only the case context you are given.

Rules:
- Use only the facts in the provided case context. Never invent a date, a status, an amount or a name that is not given to you.
- If the context does not contain something the instruction asks about, say so plainly rather than guessing.
- Write in a professional, warm tone suitable for a message to a student or migration client, unless the instruction asks for something else (like an internal case note).
- Keep drafts concise. This is a starting point a human will review and send, not a finished communication.
- Never fabricate compliance advice, visa outcomes or legal conclusions. State facts from the case; leave judgement to the staff member.`;

function contextBlock(context: CaseContext): string {
  const lines = [
    `Case ${context.caseNumber} -- ${context.matterType || "matter type not set"}`,
    `Client: ${context.clientFirstName || "the client"}`,
    `Pipeline stage: ${context.lifecycleStage}`,
    context.target ? `Target: ${context.target}` : "",
    context.visaExpiry ? `Current visa expiry: ${context.visaExpiry}` : "",
  ];
  if (context.applications.length) {
    lines.push("Applications:");
    for (const app of context.applications)
      lines.push(`  - ${app.institution} / ${app.course}: ${app.status}`);
  }
  if (context.visaMatter) {
    lines.push(
      `Visa matter: subclass ${context.visaMatter.subclass || "not set"}, status ${context.visaMatter.status}` +
        (context.visaMatter.informationDueOn
          ? `, information due ${context.visaMatter.informationDueOn}`
          : ""),
    );
  }
  if (context.recentNotes.length) {
    lines.push("Recent case notes, most recent first:");
    for (const note of context.recentNotes) lines.push(`  - ${note}`);
  }
  return lines.filter(Boolean).join("\n");
}

/**
 * Patterns that look like a document or reference number: passport-style
 * alphanumerics, long digit runs (TRN, phone, account numbers). Redaction here
 * is a second layer, not the control -- the context sent to the model already
 * excludes passport numbers and full addresses -- but a note a staff member
 * typed by hand could still contain one, and it should not be stored back out
 * in a record meant to be reviewable.
 */
function redact(text: string): string {
  return text
    .replace(/\b[A-Za-z]{1,2}\d{6,9}\b/g, "[REDACTED]")
    .replace(/\b\d{9,}\b/g, "[REDACTED]");
}

export async function askAssistant(
  context: CaseContext,
  instruction: string,
): Promise<{ text: string; model: string }> {
  const key = apiKey();
  if (!key)
    throw new AIProviderError(
      501,
      "The AI assistant is not connected. Set ANTHROPIC_API_KEY in the deployment environment.",
    );
  const chosenModel = model();
  const response = await fetch(`${apiBase()}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: chosenModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Case context:\n${contextBlock(context)}\n\nInstruction: ${instruction}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AIProviderError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      response.status === 401 || response.status === 403
        ? "The AI assistant's key was rejected. Check ANTHROPIC_API_KEY."
        : `The AI assistant is unavailable: ${detail.slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text)
    throw new AIProviderError(502, "The AI assistant returned no text.");
  return { text, model: chosenModel };
}

export { redact };
