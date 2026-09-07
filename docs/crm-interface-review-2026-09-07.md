# CRM interface and workflow review — 7 September 2026

## Why this change is needed

Staff had to open a separate case workspace for routine notes, email and files.
Registers repeated low-priority information while important client details sat
below the case workflow. The document checklist sent staff into a separate form,
and saving a document or message could remount the case and reset its section.

The old Maximus CRM is the main workflow reference. Its enquiry register,
notes/reminders, personal and academic details, suggested universities and
documents were reviewed directly. Existing application, visa, account and
administration parity is documented in `LEGACY_CRM_PARITY.md`.

## What changes

- Staff navigation slides over full-width pages. Keyboard focus stays within the
  active drawer or form and returns to its trigger when dismissed.
- Client names and search results open a contextual case preview. Notes, email,
  files, all profile/background sections, applications, visa and finance remain
  available. Opening a separate full case is an explicit action.
- Enquiry rows focus on client/office, contact, destination/status, follow-up and
  actions. Application and visa rows retain all secondary details in disclosures.
- Client contact and personal details appear first in the case. Synthetic case
  health/progress indicators have been removed from operational rows.
- Documents support direct upload, new versions, custom requests, additive
  checklist selection, due dates and instructions within the case.
- Follow-ups can be scheduled alongside case notes with a date/time and remarks.
- Case sections stay selected after document/message creation. Failed messages
  remain visible and can be retried through the correct email, WhatsApp or SMS
  provider.
- Reports read every permitted database page, expose failures with a retry action,
  and keep currencies separate while accounting for credit notes.

## Validation

- Lint: passed.
- TypeScript: passed, including the production Next build.
- Sites Worker build and artifact validation: passed.
- Next/Netlify production build: passed.
- Unit tests: 145 passed, including six new behavioral regression tests.
- Browser inspection using synthetic records: navigation, enquiry/application/
  visa layouts, case preview, note save, document request and failed email draft.
- Two new end-to-end scenarios cover preview note/search retention and additive
  document requests. Existing navigation/full-case tests now use the drawer and
  explicit Open case action. Full database-backed browser/RLS gates await CI.
- Publication: automatic approval review rejected the GitHub tree upload because
  it requires explicit authorization to disclose this modified source/tests to
  `ArulananthamAnujan/Maximu_CRM`. No remote branch was created or deployment made.

The temporary synthetic browser harness has been removed from the source tree.
No live messages or legacy CRM records were modified during the interface review.

## Remaining release and migration evidence

This change does not establish that historical migration is complete. Source IDs,
imported detail snapshots, note/reminder associations, suggested courses, files,
communication attachments and account relationships still need reconciliation.
Provider setup and real delivery require separate verification. Keep the old CRM
available until those checks are complete; a successful build is not a cutover
approval.
