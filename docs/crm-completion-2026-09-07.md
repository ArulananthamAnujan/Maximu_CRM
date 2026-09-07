# CRM completion candidate — 7 September 2026

## Release candidate and approval

The production baseline was Netlify deployment `6a9e94f76a348100082c9e94`, built from GitHub
`8ec010af37d07cac8256b59044d947f7dde2f530`. Its source tree matches the recovered
local release. GitHub Actions run `34112803686` passed for that existing release.

The user explicitly approved publishing local commits `5d73aae` and `e0aedb4`,
applying migration 0040 after full CI, and deploying to the existing production
site. Command-line Git lacked credentials, so the connected GitHub account
published candidate `a3897680ba3ce65bccb506bdd78b91e88684514b` on
`crm-completion-20260907`. Its tree `9abd2b8c783e9b7a2eca8fb39d75e885fdbb3e26`
exactly matches the approved local source. GitHub Actions run `34124737717`
checks this candidate before the production release.

The first candidate run passed the build/unit and browser jobs. The database
job passed all row-level security probes and 499/500 feature checks. Its only
failure was an old expectation that OAuth configuration alone means Gmail is
connected. Local commit `c7f1a35` corrects that assertion to require the current
staff mailbox and checks the connection guidance. Automatic approval review
blocked publishing this newly changed test because the approval named the
earlier commits. Migration 0040 and the production release remain unapplied
pending permission to publish the correction and a fully passing CI run.

## Implemented

- Migration 0040 commits invoice creation, initial payment, receipt, protected
  PDF slot and audit together. Payment/refund/credit/settlement/void operations
  lock the invoice before checking the balance and store an idempotent result.
- Concurrent payments share the invoice lock. Credit notes reduce the amount
  payable. Refunds reduce net paid. A paid invoice cannot be voided without a
  refund. Retrying a request ID returns its original result; changing its
  details is rejected. Functions retain caller RLS with SECURITY INVOKER.
- The interface retains transaction IDs for failed requests while the page is
  open, and suppresses concurrent duplicate submissions. Page reload recovery
  and reconciliation of ambiguous legacy ledger entries are separate work.
- Statement matching is atomic, rejects missing/inaccessible payments and
  currency mismatches, and prevents one payment being claimed by two statements.
- Gmail integration status now checks the current staff mailbox and verifies
  inbox access when authorization exists. Configured OAuth alone is no longer
  labelled connected. Initial mailbox loading does not flash a setup error.
- The native Background editor supports year of passing, backlogs, total
  experience, and the old CRM's proficiency-test options. Travel, refusal and
  gap declarations can be corrected through the client profile editor.

## Field mapping checked against the legacy Add Student screen

| Legacy field | Editable destination | Stored field |
| --- | --- | --- |
| Qualification | Background / Education | qualification |
| Subjects / stream | Background / Education | field_of_study |
| College / board | Background / Education | institution |
| Percentage / grade | Background / Education | result |
| Year of passing | Background / Education | details.yearOfPassing |
| Backlogs | Background / Education | details.backlogs |
| Company and position | Background / Employment | employer, job_title |
| Start and end dates | Background / Employment | started_on, ended_on |
| Total experience | Background / Employment | details.totalExperience |
| Proficiency type | Background / English tests | test_type, with free entry and legacy suggestions |
| Travel / refusal / gap details | Client details / Edit profile | existing custom_fields keys |

History edits target the original row and client ID. A regression test verifies
that imported nested details survive a year/backlog correction. These changes
do not normalise the 440 imported snapshots into native rows. Full per-record
source/save/reload reconciliation remains outstanding.

## Verification performed

- Both supported production builds pass on the candidate source.
- Whole-repository ESLint passes with zero warnings; TypeScript passes.
- 139 unit/contract tests pass. These include HTTP database fixtures and source
  contracts; they are not live financial transaction certification.
- The database-backed feature audit now contains concurrent payment/retry,
  invoice replay, credit/refund replay, overpayment, void, branch-denial and
  reconciliation tests. All of those checks passed against PostgreSQL 16 in
  candidate CI run `34124737717`. The complete feature audit was 499/500, with
  only the outdated Gmail connection assertion failing. Its local correction
  passes JavaScript syntax validation and `git diff --check`; the full CI rerun
  requires publishing that correction.
- A read-only query in production independently returned 5,141 enquiries,
  93 education applications and 147 visa-matter rows. The existing dashboard's
  67 active visa matters is a different measure. Migration 0040 is not present.
- Twelve UI searches against the full production enquiry directory returned
  their expected records without errors. Three newly entered names took
  1,919–2,476 ms. Eight repeat searches took 243–350 ms (median 284 ms).
  Measurements include browser-control overhead, debounce, network and render;
  this is a small sample, not a sustained load test or network-only p95.
- The authenticated case view has document width 1,363 px and scroll width
  1,363 px at the tested desktop viewport. Candidate CI passed all 39 browser
  acceptance tests, including the existing responsive checks at 1,363, 1,024
  and 390 px.

## Required release sequence

1. Explicit user approval received for the existing GitHub repository,
   migration 0040 and production deployment.
2. Candidate branch published. Approve publishing the corrected Gmail test and
   these release notes to the same repository, then require all three CI jobs
   to pass before proceeding.
3. Apply migration 0040 to the existing Maximus CRM Supabase project. It adds
   transaction functions and a request ledger; it does not rewrite old balances.
4. Fast-forward main to the passing candidate and verify Netlify production.
5. Inspect the live profile/background editors and Gmail connection states.

## Remaining provider and migration acceptance

The current staff account is not connected to Gmail; the live Messages page
offers Connect Gmail. A user sign-in and an explicitly approved test recipient
are needed for actual send/receive/attachment testing. No email was sent in this
pass. Drive configuration responds successfully, but recovered attachment
upload reconciliation remains unfinished. Xero/accounting integration,
commission-payment atomicity, backup/restore and incident delivery also remain
outside this candidate's verified scope. Do not describe the CRM as fully
migration-complete or every provider workflow as proven.
