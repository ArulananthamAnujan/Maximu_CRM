# Maximus CRM Next

A local-first, case-centric CRM foundation for education and migration agencies.

## Included

- Operations control centre with case health, deadlines and management visibility
- Enquiry, student, application and visa work queues
- Unified case drawer with checklist, activity and next-best action
- Google Shared Drive document-centre design
- Gmail and internal communication workspace
- Invoices, payments and commission reporting surfaces
- Dynamic workflow studio
- Role, branch and integration administration
- Responsive desktop and mobile layouts
- Supabase/PostgreSQL schema with tenant isolation and core domain entities
- Google Drive folder plan and queued integration contract
- AI-native case copilot with sourced summaries and human approval boundaries
- Premium colourful operations dashboard and customer-facing portal experience
- Proactive case-risk and document-intelligence workspace
- Team calendar, approved template library and compliance centre
- Database records for AI citations, action proposals, consent and appointments

The interface currently uses demonstration data. The assistant is a safe UI
demonstration until a chosen AI provider is connected. Real Google credentials,
mailboxes and student records are deliberately not included.

## Run in VS Code

Requirements: Node.js 22+, npm, Docker Desktop and Supabase CLI.

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Local Supabase

```bash
supabase start
supabase db reset
```

Copy the local Supabase URL and keys into `.env.local`. The initial migration is
`supabase/migrations/0001_core.sql`.

## Safe Google rollout

1. Create a Google Cloud project controlled by Maximus.
2. Restrict the OAuth consent screen to the Workspace organisation.
3. Enable Gmail and Drive APIs.
4. Create an organisation-owned Shared Drive for CRM documents.
5. Add the application service identity only to that Shared Drive.
6. Configure individual Gmail OAuth for staff and shared mailbox connections.
7. Test with dummy accounts and documents before enabling real client data.

Never commit `.env.local`, OAuth secrets, service-account credentials or real
student data. Production requires privacy, migration-agent workflow and
security review before launch.
