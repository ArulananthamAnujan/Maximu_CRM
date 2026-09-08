# Super Admin branch transfers

Status: prepared locally; not uploaded, merged, applied to production, or deployed.

The existing release already gives active Admin and Staff accounts access to all cases in their assigned branch. The missing operation was moving a case between branches: the previous reassignment endpoint only selected a colleague in the same branch.

This change adds **Transfer branch** to the Super Admin case preview and full case workspace. The form asks for a destination and a reason, explains the access change, and confirms the result inline.

The database transaction changes the case branch and associated enquiry/commission branch fields together. The client profile remains accessible to branches that still have cases for that client. Other cases are not moved. When the last case leaves the client's home branch, the home branch follows the transfer. The original case, application, document, note, history and Drive identifiers remain unchanged. A transfer event records the actor, reason, previous branch and destination.

Admin and Staff cannot invoke the transfer operation. Former task/appointment assignees cannot retain access to a case after it leaves their branch. Stale source-branch selections are rejected before any transfer writes.

## Verification

- TypeScript check and targeted ESLint: passed.
- Worker build and artifact validation: passed.
- Netlify Next.js production build and its TypeScript check: passed.
- All 159 unit/API tests: passed, including the new transfer authorization, atomic RPC and stale-form tests.
- Local PostgreSQL 18.3 through PGlite 0.5.8: all 44 migration files applied. Existing branch-work assertions and the new transfer assertions passed with authenticated roles. The new probe checks destination Admin/Staff editing, previous-branch denial, sibling isolation, preserved notes/documents/applications/tasks/appointments and audit attribution.
- Native PostgreSQL CI and the new browser scenario remain to be run after upload. The browser scenario is included in the existing CI suite.
- No production cases were transferred for testing.

## Release continuation

Automatic approval review rejected `github_create_tree` for the proposed upload to `ArulananthamAnujan/Maximu_CRM`, stating that explicit authorization for the source payload and destination was missing. No GitHub object or branch was confirmed created for this change. Do not retry through another upload mechanism without resolving that rejection.

The prepared branch is `feat/super-admin-branch-transfer`, based on production commit `d6a46d25a62eaa6a3d635ed5100388b7b2080309`. After authorization, upload the committed change, run CI, merge only after required checks pass, apply `supabase/migrations/0042_super_admin_branch_transfer.sql`, and deploy to the existing `maximus-crm-next.netlify.app` site. Do not run the test fixture SQL against production or transfer real cases without the user specifying the cases and destination.
