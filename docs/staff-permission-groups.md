# Staff & Masters permission groups

Account creation and Manage → Function access now use the old CRM's grouped permission structure:

- Study Abroad, Direct Visa and Special permission master switches.
- Independent module switches per workspace, including View applications, All applications, Student documents and WhatsApp.
- Delete, bulk delete, Excel/export, assign, send email, send SMS and send WhatsApp action switches.
- Mobile number and timezone saved with the account, including through first-sign-in invitation claiming.
- Same-branch access and existing role limits remain in force. Only Super Admin edits custom access. Branch admins create staff with their own restrictions inherited.
- All applications permits the branch-wide application list. With it off, View applications shows owned or explicitly shared cases; existing branch rules still apply.
- Full name and work email remain the account identity. Passwords are chosen through secure setup email; no password is displayed to an administrator.

Permissions are checked in navigation, API actions, restrictive PostgreSQL policies and write triggers. Case workspace restrictions come from stored case records rather than a client-supplied mode. Existing null permission objects preserve role defaults. Invalid permission keys are rejected. Bulk delete also requires Delete.

## Validation

- 193 CRM unit/API checks passed.
- Two browser scenarios passed: case tasks, completion notifications, changing existing account access, and new limited account creation/sign-in. The creation form was checked at desktop and 390px phone widths.
- PostgreSQL migrations and two SQL suites passed using PGlite, including workspace separation, direct writes, action restrictions, invitation claims and branch controls.
- TypeScript, changed-file ESLint, Next production build, vinext worker build, mobile bundle and four mobile policy checks passed.

## Release status

The user approved publication and production deployment on 16 September 2026. Source is saved in pull request #6. Apply `20260916012511_staff_permission_groups.sql` and `20260916034500_restore_legacy_note_visibility.sql` with the matching application release. Earlier task/access migrations already exist in production; do not reapply them manually. GitHub CI and the Netlify production deploy provide the release status.
