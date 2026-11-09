# Go-live runbook

Everything the code can prove has been proven: lint, types, the production
build, 240 unit tests, the row-level-security probes, the 531-check feature
audit, 53 browser tests and a design inspection of all 29 screens. What is
left needs the agency's own accounts, keys and data, and this is the order to
do it in. Each step says how to check it before moving on.

The CRM tells you itself when a step is missing: the Integrations screen
lists every connection with its real state, the **Live service check** on it
names the migration the database is missing, and administrators see a
banner at the top of every screen until the database is current.

## 1. Apply the database migrations

The schema lives in Supabase and is migrated separately from the code.

1. Open the Supabase project, **SQL Editor -> New query**.
2. Paste `scripts/checks/verify-schema.sql` and run it. Every row must read
   `OK`. Each `MISSING` row names the migration to apply.
3. Apply the missing migrations from `supabase/migrations/`, in name order,
   one file per query. From a terminal, this prints every migration from a
   given one as a single script:

   ```bash
   scripts/print-migrations.sh 20261103 > pending.sql
   ```

   `0013` must run on its own before `0014` (see the README).
4. Run `verify-schema.sql` again. The last row, `schema_version`, must be
   `OK`, and `select public.schema_version();` must return the prefix of the
   newest file in `supabase/migrations/`.

Every future migration ends by setting `public.schema_version()` to its own
prefix; `tests/schema-version.test.mjs` fails the build if the code and the
newest migration disagree.

## 2. Set the deployment secrets

In the deployment (Netlify or Cloudflare) set:

| Secret | What it turns on |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | The application itself |
| `SUPABASE_SERVICE_ROLE_KEY` | Creating staff logins, backups, the scheduled operations |
| `FIELD_ENCRYPTION_KEY` | Passport numbers (`openssl rand -base64 32`; never change it once data is stored) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHARED_DRIVE_ID` | Document storage in the agency's Shared Drive |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Optional. Case email (document requests, invoices, commission invoices, campaigns) goes from each officer's connected Gmail at no extra cost; this system sender is only the fallback for a case nobody has connected Gmail for, and the sender for staff task notifications |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail and Google Calendar connections per staff member |
| `ANTHROPIC_API_KEY` | Copilot |
| `INCIDENT_ALERT_WEBHOOK_URL` | Where the daily operations check posts an alert |
| `PRODUCTION_URL` | The public address, used by the scheduled checks |
| `OPERATIONS_JOB_SECRET` | Optional; protects the operations trigger (derived from the service key when unset) |
| `TWILIO_*`, WhatsApp keys | Optional; SMS and WhatsApp |

The README's "Connecting the Shared Drive" and "Gmail and Calendar setup"
sections walk through the Google side. Redeploy after changing secrets.

Check: sign in as the owner, open **Integrations**. Everything the agency
will use must read **Connected**; Gmail and Calendar read "Connect" until a
person connects their own account.

## 3. Let the operations checks pass once

Three items on Integrations stay **Not configured** until the scheduled
operations function has run against the live deployment:

- **Database backup and restore drill**: needs `SUPABASE_SERVICE_ROLE_KEY`.
- **Monitoring and incident alerts**: needs `INCIDENT_ALERT_WEBHOOK_URL`.
- **Production security headers**: needs the public URL to answer with the
  headers in `netlify.toml` (the smoke test below checks them too).

The function `netlify/functions/production-operations-background.mjs` runs
on the Netlify schedule; trigger it once by hand through
`production-operations-trigger` (or wait for the first run), then press
**Check again** on Integrations. All three must read **In force** or
**Connected** before real client data goes in.

## 4. Run the smoke test against the live address

```bash
SMOKE_URL=https://crm.your-agency.example \
SMOKE_EMAIL=owner@your-agency.example SMOKE_PASSWORD='...' \
SMOKE_CLIENT_EMAIL=test.client@your-agency.example SMOKE_CLIENT_PASSWORD='...' \
npm run smoke:production
```

It checks the sign-in page and its security headers, signs in as the
administrator, reads the health endpoint and the schema version, loads the
workspace, lists every integration's state, runs a report export, and signs
in as a test client. Every line must be `PASS`; a `WARN` is an optional
integration or a missing test client; any `FAIL` names what to fix. Run it
again after every change to secrets or after each deploy.

## 5. Set up the agency

As the owner (super admin), in this order:

1. **Staff & Masters -> Offices**: each office with its timezone.
2. **Staff & Masters -> Staff**: every person, their office and role. The
   CRM emails each a one-time password-setup link; no password is ever shown.
   Use **Function access** to set View and Edit per section for anyone who
   should not have everything.
3. **Templates**: read the 50 standard document items, the three visa
   questionnaires under Client forms (Student 500, Temporary Graduate 485,
   Visitor 600) and the four client emails (document request, form request,
   invoice, portal welcome) and change the wording to the agency's own. These
   are what clients receive. Add a questionnaire for any other visa the
   agency handles; officers send them from a case's Forms tab.
4. **Integrations -> Personal Gmail**: every officer connects their own Gmail
   once. Case email (document requests, invoices, commission invoices,
   campaigns) then goes from the officer's own address, the acting officer
   first, then the case owner, then the supervisor, and replies land in that
   inbox on the same thread the Messages screen reads. No paid email
   provider is involved. Gmail allows about 2,000 sends a day per Workspace
   account, so keep a campaign to a few hundred recipients per launch.
5. **Workflows**: add the stage templates the team actually uses inside the
   fixed pipeline, if any.
6. **Reports**: open the builder and export once, so the Excel layout has
   been seen by a manager before it reaches a client meeting.

## 6. Import the existing records

**Staff & Masters -> Legacy import** accepts the old CRM's exports entity by
entity (clients, cases, applications, visa matters, notes, tasks,
appointments, communications, documents, invoices, payments and the rest).

1. Run each file with **Validate** first. It reports every row that cannot be
   mapped without writing anything.
2. Fix the source file or accept the row's note, then import.
3. The import is repeatable: legacy IDs are upserted, not duplicated, and
   the raw source values are kept in `legacy_data` on each record.
4. Have a manager open ten cases at random and compare them with the old
   system: stage, owner, documents, invoices and balance.

The Course Finder catalogue is imported separately with
`npm run import:courses -- --dry-run` first (see the README).

## 7. Pilot, then switch

Run one office for two weeks alongside the old process:

- every staff member signs in on their own account and does their real
  work in the CRM;
- a client with a test account opens the portal on a phone;
- keep one shared list of anything that felt wrong, with the screen and the
  case number;
- at the end of each week, run the smoke test and read the Activity &
  compliance screen.

Switch the remaining offices over when that list is empty.

## What was tested, and on what

Browser tests ran in Chromium at desktop and phone widths. Before the pilot,
have one staff member work for an hour in Safari and one in Edge, and one
client open the portal in the iPhone and Android browsers, and add anything
they find to the pilot list.

## Where things are

- Health endpoint: `GET /api/crm/health` (administrators), includes
  `schema.found` and `schema.expected`.
- Schema check SQL: `scripts/checks/verify-schema.sql`.
- Migration printer: `scripts/print-migrations.sh <from>`.
- Smoke test: `scripts/smoke-production.mjs` (`npm run smoke:production`).
- Full local verification: `npm run verify` (build, unit, RLS, feature
  audit, browser tests).
- Design notes and measurements: `.taste-skill/notes.md`.
