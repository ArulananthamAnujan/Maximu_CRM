# Agent workspace verification — 7 September 2026

This is a bounded local implementation, not a certification that Maximus can
already replace every legacy workflow. No production data was changed in this
pass. Attachment uploads remain paused. Publishing and live acceptance are
separate from passing a build.

## Implemented in this pass

| Area | Change | Evidence and limit |
| --- | --- | --- |
| Agent readability | 16px form inputs, 14px regular labels/table text, larger actions, restored case section titles, organised case navigation, responsive case summary | CSS/source checks; authenticated visual inspection is blocked by the browser connection |
| Client fields | Editable identity, contact, personal, passport and address groups | Mock-backed route tests preserve unrelated address/custom fields and encrypt new passport values; no automatic history-to-field migration |
| Native history | Correct existing education, employment, English-test and visa-history rows without adding duplicates | Row/client-bound PATCH and mocked access-denial tests; unrepresented fields and imported details survive |
| Search | Correct nonexistent cases.created_at references to opened_at, support split full names and punctuation, expose errors, discard cancelled results | Built-worker integration tests against a local HTTP database fixture |
| Enquiries | Common name searches retrieve one matching page instead of materialising the full index; deterministic ID paging; timing header | 5,119 synthetic records produce a 50-row response with exact count; this is NOT measured production latency |
| Lifecycle | Opening an application or visa by case ID retains its actual stage | Mock-backed application deep-link regression test; existing lifecycle code retained |
| Case loading | Explicit initial loading/error/retry; retain visible records during refresh; bounded load timeout | Build and source checks; browser interaction not verified |
| Save responsiveness | Case saves no longer await a second full-workspace refresh | The case-specific reload still runs; no promise that network writes finish in milliseconds |
| Gmail status | Missing saved authorization cannot be shown as connected; sync success is a separate notice | Mock connection test, not actual OAuth, receipt or delivery proof |
| Payment safeguards | Reject overpayments, mismatched currencies and void/cancelled/refunded invoice payments | Negative route tests with no fixture writes; not full finance certification |

## Verification commands

```sh
node /root/.codex/plugins/cache/openai-curated-remote/sites/0.1.51/scripts/build-site.mjs
npm run build:netlify
node --test tests/*.test.mjs
git diff --check
```

Both supported builds were exercised. The test suite includes static contracts
and mock-backed requests; neither is proof of live Supabase policies or provider
behaviour. The build still warns about a client chunk exceeding 500 kB.
PostgreSQL tools were not available here, so database-backed RLS/feature scripts
were not run. Never point their schema-reset fixtures at production.

The full suite passes 135 checks (117 existing plus 18 added). Targeted lint on
the changed files still reports the four pre-existing synchronous-effect errors
in app/page.tsx and existing warnings, confirmed against HEAD. No new lint error
is accepted as part of this change. Lint is therefore not a passing release gate.

## Release acceptance still required

1. **Legacy field parity:** reconcile representative source files field by field
   with native editable screens, across study-abroad and direct-visa branches.
   The previously preserved 440 history snapshots are not 440 fully normalised
   profiles. Produce an explicit source-field → screen → save → reload matrix.
2. **Production performance:** measure cold and warm page entry, first visible
   row, query response, page navigation, opening a case and save acknowledgement
   at p50/p95 with the full permitted dataset. Separate network latency from
   rendering. Review broad searches and advanced filters, which still use an
   index. Never label fixture milliseconds as production results.
3. **Communication:** with approved test recipients, verify OAuth, inbox receipt,
   outbound delivery, attachments, case association, shared history and branch
   access. The reported Google 401 has not been diagnosed by this pass.
4. **Finance:** invoice/PDF creation, payment, receipt, refund, allocations and
   reconciliation need database-backed and controlled end-to-end verification.
   Existing payment operations use multiple writes: payment, receipt, invoice
   total and audit are not one transaction. Concurrent requests and retries need
   an atomic/idempotent database operation before financial correctness can be
   certified. The new validation checks do not solve that race.
5. **Visual acceptance:** inspect desktop, compact desktop, mobile and 125–150%
   zoom. Verify keyboard focus, one enquiry search, suggestion navigation, long
   client names, many table columns, all module right edges, and case sections.
6. **Permissions and data:** test Super Admin, each branch Admin, branch staff and
   portal clients against real RLS. Confirm exact current counts independently;
   5,119 in the new test is a fixture, not a fresh production count.
7. **Attachments:** metadata is not a downloadable document. Confirm actual file
   existence, protected download and correct client association when uploads
   resume; do not mark this task complete based on metadata alone.

Do not retire the legacy CRM until these acceptance checks pass and outstanding
data/file reconciliation is signed off.
