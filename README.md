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
- Course Finder: a searchable institution and course catalogue, importable from a legacy export
- Editable email templates and automatic client notices for document/invoice requests and new portal logins
- Client portal self-service: request access with a secure setup link, confirm a document or invoice request was received

New Enquiry is deliberately short: who the client is, the matter, the branch and
the staff member who will own it. Academic history, employment, English tests,
family and passport details are recorded in the case file afterwards, where each
becomes a proper record rather than a loose field. Nothing on a migration file is
deleted -- an application or a dependant is withdrawn or removed with a reason,
a date and a name, and stays on the file.

Every case opens as a full file: overview and pipeline, client details,
family and dependants, education and employment history, education
applications, the visa matter, documents and checklist, a chronological file
note and activity record, and finance. A case carries both a service stream
(study abroad or migration) and a matter type (Student Visa 500, 482, Partner
820/801), which are separate fields so a matter label can never reclassify the
case.

Client files are retained by default for seven years, matching the obligation
to keep communications, invoices and personal documents after the last action
on a file. The timeline exists so oral advice and client instructions can be
written up contemporaneously.

Documents are stored in the organisation's Google Shared Drive. A document is
first requested, then the file is attached when it arrives; the CRM records the
Drive file, its size and a SHA-256 checksum, and replacing a file bins the one
it supersedes rather than leaving it behind. Until the Shared Drive is
configured the CRM says so plainly instead of implying a file was stored.

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

## Making CI a real gate

The workflow in `.github/workflows/ci.yml` runs on every push and pull request:
lint, types, build and unit tests; then every migration applied to a PostgreSQL
service with the row-level security checks and the full feature audit; then the
end-to-end tests in a real browser.

None of that prevents a merge until the branch is protected. On GitHub, under
**Settings -> Branches -> Add branch ruleset** (or **Add rule** for `main`):

1. Target `main`.
2. Require a pull request before merging.
3. Require status checks to pass, and select **Lint, types, build and unit
   tests**, **Row-level security and feature audit** and **Browser end-to-end**.
4. Require branches to be up to date before merging.
5. Block force pushes.

Until that is set, CI reports but does not gate.

## What is and is not built

Working and covered by the checks above: the case pipeline, the case file,
applications, visa matters, dependants, documents in the Shared Drive, the
client portal, administration, reporting, imports and retention.

Not built, and labelled as such in the interface rather than implied:

| Area | State |
|---|---|
| Sending email as a staff member | Built. A staff member connects their own Gmail (Integrations, or the mailbox screen); until then, drafts are still recorded against the case and can be sent from your own mailbox by hand. |
| Client email notices | Built. The CRM emails a client itself -- a document requested, an invoice raised, a new portal login -- through Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). Wording is editable per organisation under Templates. Until configured, the underlying request or invoice is still recorded; the email is simply not sent. |
| WhatsApp | Not implemented. |
| Campaigns | Not implemented. Templates are reusable wording, not a campaign engine. |
| Google sign-in | Built. The Google button redirects through Supabase's own Google OAuth provider, which is switched on separately in the Supabase dashboard -- see "Google sign-in setup" below. |
| AI assistant | Built. Drafts and summarises against one case at a time from that case's own facts, with nothing written until a person chooses to save it. Needs `ANTHROPIC_API_KEY`; until set, the assistant screen has nothing to call. |
| Course Finder | Built: a searchable institution/course catalogue with country and level filters. The 61,000+ row legacy Maximus export is imported separately -- see "Importing the legacy Course Finder" below. |
| Lead scoring, follow-up SLA automation, structured lost-lead reasons, campaign performance | Not implemented. |

**Integrations** (owner and branch manager) reports this from the running
deployment rather than from this table: the Shared Drive is probed for real --
an assertion is signed, exchanged for a token and used to read the drive back --
so credentials that are present but wrong show as broken there instead of at the
moment somebody tries to upload a passport. Anything marked *Not built* is
absent from the code: no configuration turns it on.

## Who can do what

Reading and writing are separate questions, and the difference matters most for
a case officer.

| | Super Admin | Branch Manager | Case officer | Client |
|---|---|---|---|---|
| See every branch | Yes | No | No | No |
| See their branch's cases | Yes | Yes | Yes, read-only unless assigned | No |
| Work a case (edit, move, defer, case file) | Yes | Their branch | **Only cases assigned to them** | No |
| Reassign a case | Yes | Yes | No | No |
| Archive a case | Yes | Yes | Request only — managers are notified | No |
| Client fees | All | Their branch | Only their own clients' fees | Their own invoices |
| Commissions and partner claims | Yes | Yes | Never | Never |
| Export | Everything they can see | Their branch | Only their own cases | No export |
| Staff, branches, integrations | Yes | Staff and branches | No | No |

Every export writes an audit entry naming who exported what.

A case officer can still *see* a colleague's case, because cover and handover
depend on it. What they cannot do is change it: the database refuses, and the
refusal says to ask a manager for a reassignment rather than failing silently.
Reassigning a case is what grants access, and taking it away removes it.

This is enforced in PostgreSQL by `public.can_modify_client`, not in the
interface, so it holds for anything that talks to the database.

## Adding a member of staff

**Staff & Masters** (Super Admin, or a branch manager for their own team) lists
everyone on the team and adds new people. A profile's id has to be the id of
that person's Supabase login, which does not exist until somebody makes it, so
there are two routes and the deployment decides which one that screen uses:

- **With `SUPABASE_SERVICE_ROLE_KEY` set**, *Add staff member* creates the
  login and the CRM account together and shows a one-time password to hand
  over. That is the whole job.
- **Without it**, the same form records an invitation. Create the Supabase
  login for that address yourself (Authentication -> Users -> Add user), and
  their CRM account is built from the invitation the first time they sign in.

Which one is in force is stated on the **Integrations** screen. The
service-role key bypasses row-level security completely, so it is used on that
one path and nowhere else; without it the CRM still works, it just needs the
extra step above.

A branch manager can create Staff and Partner accounts. Only a Super Admin can
create or promote to an administrator level, in the interface and in the API.

Accounts are deactivated, never deleted: the case record has to say who did
what for seven years. A deactivated account cannot sign in and is told why.

## Database migrations

The schema lives in Supabase and is migrated separately from this code, so a
deployment can be ahead of the database. When that happens the CRM shows a
banner naming the migration to apply rather than failing with a PostgREST
error, and case creation keeps working.

**Applying migrations to a hosted Supabase project.** The files in
`supabase/migrations/` are plain SQL. Open the ones you have not applied yet, in
number order, and for each: copy the file's contents, and in the Supabase
dashboard go to SQL Editor -> New query, paste, and Run.

Nothing needs to be generated or executed first. Copy the SQL file itself, not
any script.

Order is what matters. `0008` onwards are written to be safe to run more than
once, so re-applying one you are unsure about is harmless; `0001` to `0007` are
first-run only and will report that objects already exist if repeated.

`0013_defer_stage_enum.sql` must be run **on its own, before `0014`**. It adds
one value to the case-stage type, and PostgreSQL will not let a new enum value
be used by other statements in the same transaction -- which is why everything
that uses it is in `0014` instead. Running them together in one paste fails
with "unsafe use of new value".

If you have a terminal, `scripts/print-migrations.sh 0010` prints `0010` and
everything after it as one script you can redirect to a file
(`scripts/print-migrations.sh 0010 > pending.sql`). It is a program that prints
SQL -- do not paste the script itself into the SQL editor.

**Locally**, with Docker Desktop and the Supabase CLI:

```bash
supabase start
supabase db reset
```

Copy the local Supabase URL and keys into `.env.local`.

**Checking what the database has.** `scripts/checks/verify-schema.sql` is a
read-only query: paste it into the SQL editor and every row should read OK.
Anything reading MISSING names the migration that has not been applied yet.

### Importing the legacy Course Finder

Apply `0022_course_finder.sql`, `0026_course_finder_catalog.sql` and
`0030_course_catalog_live_sync.sql`, then import
the Maximus export with a service-role key kept only in the terminal:

```bash
SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
COURSE_FINDER_ORGANISATION_ID=... \
npm run import:courses -- /path/to/maximus_all_courses.csv
```

Run the same command with `--dry-run` first to validate counts without writing.
The importer is repeatable: legacy IDs are upserted, not duplicated. It cleans
searchable values while retaining rejected/raw source values in `legacy_data`.

Migration `0030` adds student-safe catalogue browsing, country normalisation,
source freshness, completeness reporting and the expanded field/intake/fee/
duration filters. Netlify runs `netlify/functions/course-catalog-sync.mjs`
daily. It discovers the Australian Government CRICOS CSV resources and upserts
official rows under their own source IDs, preferring recently verified rows in
search results without overwriting Maximus notes or commission details.

The existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` deployment secrets
are used by that scheduled import. Set `COURSE_FINDER_ORGANISATION_ID` when the
database contains more than one organisation. Additional licensed or official
CSV feeds can be supplied as a JSON array in `COURSE_CATALOG_FEEDS`; every feed
must provide `source`, `country` and `url` (with optional `countryCode`). Never
scrape a provider website or add a commercial feed without permission to use
its catalogue.

**Checking every feature.** `scripts/verify-features.sh` builds a throwaway
PostgreSQL database, applies every migration, seeds a two-branch agency and
drives the built Worker through the whole CRM as an owner, a branch manager, a
case officer and a client portal account -- sign-in, enquiry intake, the case
pipeline, assignment, tasks, appointments, documents, messages, invoices,
templates, workflows, administration, operations, intake, legacy import and
branch isolation. Supabase is not available locally, so
`scripts/audit/postgrest-shim.mjs` speaks the slice of PostgREST this
application uses and runs every request as the `authenticated` role with
`auth.uid()` set, which means the policies are genuinely exercised rather than
mocked. Run `npm run build` first.

**Checking row-level security.** `scripts/verify-rls.sh` applies every migration
to a throwaway PostgreSQL cluster and asserts that a client portal account
cannot read or write another client's records, that the case lifecycle rules
hold (including deferral and resumption), that the duplicate-client search
reports nothing a portal account may not already see, and that case reassignment
notifies only the new owner. It needs `postgresql-16` and a `postgres` system
user.

**Checking the interface.** `scripts/verify-ui.sh` brings up the same throwaway
stack, serves the built Worker with its static assets in front of it the way
Cloudflare does, and drives it in a real browser: sign-in, intake and its
validation, duplicate protection, the case file and its tabs, the pipeline
including deferral, the Applications and Visa record screens, what each of the
four roles is offered, reporting, integration status, the phone layout and the
accessible name of every button on every screen at both widths.

## Reporting

Reports cover what an agency is run on: enquiry conversion, applications
submitted, offer and CoE rates, visas lodged, granted and refused, requests for
further information and their response deadlines, visa expiries at 30, 60 and 90
days, overdue tasks and outstanding documents, workload per staff member, branch
performance and outstanding fees.

Every figure is scoped by row-level security to what the reader may see, so a
branch manager's report covers their branch and an owner's covers the
organisation, without the report filtering by branch itself.

## Passport numbers

Passport numbers are encrypted by the application before they reach the
database and only a masked form, `N12••••7`, is ever sent to the browser.
Revealing the real number is a manager action and is written to the case
timeline against whoever asked for it.

Set `FIELD_ENCRYPTION_KEY` to a base64 32-byte value, from
`openssl rand -base64 32`, alongside the other secrets. Without it the CRM
refuses to store a passport number rather than storing it in the clear.
Changing the key makes existing stored numbers unreadable.

## Connecting the Shared Drive

Files live in a Shared Drive the agency owns. The CRM reaches it through a
service account that is a member of that drive and nothing else, and decides
for itself who may download a document, so no file is ever shared with an
individual Google account.

1. In the Google Cloud project, enable the Drive API.
2. Create a service account. Create a JSON key for it and keep it secret.
3. Create the Shared Drive in the Workspace organisation, if it does not exist.
4. Add the service account's email as a **Content manager** of that Shared Drive
   only. It needs no other access anywhere.
5. Take the drive's ID from its URL: `drive.google.com/drive/folders/<id>`.
6. Set three values, from the JSON key and step 5:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=crm@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHARED_DRIVE_ID=0ABcdEfGhIjKlMnOpQr
```

Put them in `.dev.vars` for local Worker runs and in the deployment's secrets
for Cloudflare or Netlify. Never commit them. `GOOGLE_PRIVATE_KEY` keeps its
escaped newlines; the application converts them.

Each client gets a folder named `Full Name - CRM-ID` on first upload, with the
standard subfolders from `lib/google-drive-plan.ts`. `MAX_UPLOAD_MB` caps an
individual file, defaulting to 25.

## Safe Google rollout

The Shared Drive, Gmail, Calendar and Google sign-in are all built. Each is
independently optional: an unconfigured one reports **Not configured** on the
Integrations screen and changes nothing elsewhere in the CRM, rather than
failing partway through something a user started.

1. Create a Google Cloud project controlled by Maximus (or reuse the one the
   Shared Drive already uses -- see below).
2. Enable the **Google Drive API** in it. No OAuth consent screen is needed:
   the CRM authenticates as a service account, not as a person.
3. Create an organisation-owned Shared Drive for CRM documents.
4. Add the service account to that Shared Drive as a Content manager, and to
   nothing else anywhere.
5. Set the three `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` /
   `GOOGLE_SHARED_DRIVE_ID` values above, then open **Integrations** in the
   CRM. It signs an assertion, exchanges it for a token and reads the drive
   back, so a key that does not match the account, or an account that was
   never added to the drive, shows as broken there rather than at the moment
   somebody uploads a passport.
6. For Gmail, Calendar and Google sign-in, follow "Google sign-in setup"
   below -- they use a separate, per-user OAuth client rather than the Drive
   service account.
7. Test with dummy clients and documents before enabling real client data.

Never commit `.env.local`, OAuth secrets, service-account credentials or real
student data. Production requires privacy, migration-agent workflow and
security review before launch.

## Google sign-in setup

Gmail send, Calendar sync and the "Continue with Google" sign-in button share
one Google Cloud OAuth client (a person, not a service account), unlike the
Shared Drive above. Gmail and Calendar work once `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` are set; sign-in needs one further step because
Supabase performs that exchange itself.

1. In the Google Cloud project, **APIs & Services -> Credentials -> Create
   credentials -> OAuth client ID**, type **Web application**. Reuse the
   Drive project or a separate one -- either works, they are unrelated
   credentials.
2. If the consent screen has not been configured yet, Google will ask for it
   first. Internal or External is fine; External needs the usual verification
   only once real (non-test) users outside your own test list sign in.
3. Under **Authorized redirect URIs**, add every one this deployment needs:
   - `https://your-app-domain/api/auth/gmail/callback`
   - `https://your-app-domain/api/auth/calendar/callback`
   - `https://<your-project-ref>.supabase.co/auth/v1/callback` -- sign-in
     only, and note this is Supabase's callback, not this app's; find the
     exact URL in the Supabase dashboard's Google provider settings, it fills
     it in for you.
   Add the equivalent `http://localhost:3000/...` pair for local dev if
   needed.
4. Copy the client's ID and secret into `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET` (`.dev.vars` locally, the deployment's secrets
   in Netlify or Cloudflare). This alone turns on Gmail and Calendar
   connecting from the Integrations screen -- reload it and both should show
   **Not configured** turn into an active "Connect" button.
5. For sign-in specifically: in the **Supabase dashboard**, go to
   **Authentication -> Providers -> Google**, switch it on, and paste the
   same client ID and secret from step 4. Save.
6. In the same dashboard, **Authentication -> URL Configuration -> Redirect
   URLs**, add `https://your-app-domain/auth/google-callback` (and the
   `http://localhost:3000/auth/google-callback` equivalent for local dev).
   Supabase refuses the redirect otherwise.
7. Reopen **Integrations** in the CRM as a Super Admin or branch manager --
   "Google sign-in" reads this setting back live from Supabase's own
   `/auth/v1/settings` endpoint, so it will not show connected until step 5
   is actually saved on Supabase's side, independent of anything in this
   app's own environment variables.
8. Test with a Google account that already has a matching, active Maximus CRM
   profile before relying on it -- the button signs a person in, it does not
   create or invite an account. An unrecognised Google account is told
   plainly to ask an administrator to add them under Staff & Masters.
