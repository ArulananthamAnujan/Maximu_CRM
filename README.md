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

Cases move through an explicit pipeline -- enquiry, student, application, visa
and completed. Cases move forward or back between the active stages, a case is
completed only from the visa stage once the visa is approved, and a completed
case can be reopened into whichever stage the work resumes at. Those rules are
enforced in the database by `public.move_case_lifecycle`, not only in the
interface.

The assistant is a safe UI demonstration until a chosen AI provider is
connected. Real Google credentials, mailboxes and student records are
deliberately not included.

## Run in VS Code

Requirements: Node.js 22+, npm, Docker Desktop and Supabase CLI.

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Database migrations

The schema lives in Supabase and is migrated separately from this code, so a
deployment can be ahead of the database. When that happens the CRM shows a
banner naming the migration to apply rather than failing with a PostgREST
error, and case creation keeps working.

**Applying migrations to a hosted Supabase project.** Generate the SQL and paste
it into the Supabase dashboard under SQL Editor -> New query:

```bash
scripts/print-migrations.sh          # every migration
scripts/print-migrations.sh 0008     # 0008 and everything after it
```

Every migration is written to be safe to run more than once, so re-applying the
whole set against a database that already has part of it is harmless. Running
them in order is what matters.

**Locally**, with Docker Desktop and the Supabase CLI:

```bash
supabase start
supabase db reset
```

Copy the local Supabase URL and keys into `.env.local`.

**Checking row-level security.** `scripts/verify-rls.sh` applies every migration
to a throwaway PostgreSQL cluster and asserts that a client portal account
cannot read or write another client's records, that the case lifecycle rules
hold, and that case reassignment notifies only the new owner. It needs
`postgresql-16` and a `postgres` system user.

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
