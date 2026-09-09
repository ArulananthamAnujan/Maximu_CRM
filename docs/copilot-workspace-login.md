# Copilot and connected staff workspace

The old assistant UI is replaced by Copilot in the Workspace navigation and at `/copilot`. Every case has an **Ask Copilot** link that opens the page with its case ID selected.

Staff can search the production directory, summarise a permitted case, ask about recorded requirements and next actions, draft detailed emails or short messages, and improve or translate their own text. General writing works without a case. Results have editable subjects and bodies, source links, and limitations. Saving uses the existing audited case-note and email-draft endpoints. No Copilot endpoint sends mail or changes case details automatically.

Case context is fetched using the caller's Supabase token and includes the case, applications, visa matter, notes, imported activity history, document metadata, checklist, tasks and CRM-linked email excerpts. Context limits and unavailable datasets are disclosed. Document contents, the full mailbox, live policy research and finance records are not included. AI history reads now verify access to the case before reading interactions, including for administrators.

## Staff sign-in

After a successful staff password login, Google sign-in or invitation/password setup, the browser checks the person's Gmail and Calendar connections. Existing active connections for the same profile and email are reused. Staff who need setup enter one Google consent flow for Gmail read/send and Calendar events; the existing Gmail callback URL is reused. A declined or failed consent returns to the CRM with a connection message. It does not invalidate the CRM login.

The callback binds OAuth state to the authenticated profile, checks the Google email against the CRM email, inspects granted scopes and stores encrypted refresh tokens only in that profile's provider rows. Partial consent is reported accurately. Tokens are refreshed by the existing Gmail and Calendar operations when used. Revoked Google grants require reconnection; a matching email alone never grants mailbox access.

Shared Drive continues using the organisation's existing service-account integration and the CRM's document permissions. CRM login does not create a Google website/browser session or grant access to arbitrary external services.

## Deployment requirements

- Existing Google OAuth client and encryption settings: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `FIELD_ENCRYPTION_KEY`.
- Keep `https://maximus-crm-next.netlify.app/api/auth/gmail/callback` authorised on that Google client. Allow Gmail read/send, user email and Calendar events scopes in the Google consent configuration.
- AI uses the existing Anthropic integration. `ANTHROPIC_BASE_URL` is now recognised for Netlify AI Gateway in addition to the existing direct API/test override. Default model is `claude-sonnet-4-5-20250929`; an explicit `ANTHROPIC_MODEL` remains authoritative and must be supported by the configured provider.
- No new database migration is required. Existing mailbox connections, AI interactions, case tables and RLS are reused.

## Verification

- TypeScript and changed-file ESLint pass.
- Vinext build and the production Next.js build pass.
- All 172 existing and new Node tests pass, including seven new tests covering staff/client boundaries, hidden cases, citation filtering, missing context, malformed responses, login handoff, consent reuse, encrypted token storage, account mismatch, forged state and partial consent.
- Provider calls were tested against controlled stand-ins. Live Google consent, real AI output quality and production deployment have not been verified in this change.

References: [Google offline authorisation](https://developers.google.com/identity/protocols/oauth2/web-server), [Netlify AI Gateway](https://docs.netlify.com/build/ai-gateway/overview/).
