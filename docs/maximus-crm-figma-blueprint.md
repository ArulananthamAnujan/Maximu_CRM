# Maximus CRM — Figma system and responsive screen blueprint

Status: ready for Figma component and screen generation once Figma MCP write access is available.

## Product rules that every screen must preserve

1. A saved enquiry, student, application, visa matter, task, message, document or finance record is immediately visible to every authorised Admin and Staff user in the same branch.
2. Ownership and assignment are optional accountability metadata. They never grant or restrict visibility inside a branch.
3. Cross-branch data is inaccessible to Admin and Staff users. Super Admin alone can view all branches and manage branches.
4. Material record changes show the actor and time in the record activity history. Audit history cannot be presented as an editable note.
5. Study Abroad and Direct Visa use the same product shell, typography and component system. Their service-specific language and records remain distinct.
6. No responsive layout may remove an action, field, filter, status or permission-aware function available on desktop.

## Foundations

### Colour

| Role | Value | Usage |
|---|---:|---|
| Navy 900 | `#11263D` | Primary navigation |
| Navy 800 | `#18344F` | Elevated navigation |
| Navy 700 | `#214765` | Selected navigation |
| Blue 600 | `#1E6F9F` | Primary actions and focus |
| Cyan 500 | `#3FA7C4` | Brand accent and progress |
| Ink 900 | `#142536` | Primary text |
| Ink 500 | `#71808E` | Secondary text |
| Surface 25 | `#F8FAFB` | Workspace background |
| Border 100 | `#E7EDF1` | Dividers and table rules |
| Success 600 | `#138A61` | Healthy and complete |
| Warning 600 | `#C66A13` | Due soon and attention |
| Danger 600 | `#C73F4C` | Overdue, failed and destructive |

### Typography

- Family: Inter.
- Display: 32/40 Semi Bold.
- Page title: 24/32 Semi Bold.
- Section title: 18/26 Semi Bold.
- Body: 14/21 Regular.
- Table/body compact: 13/18 Regular.
- Label: 12/16 Semi Bold.
- Metadata: 12/16 Regular.
- Minimum interactive text size: 13 px.

### Spacing, shape and density

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40.
- Control heights: 32 compact, 40 default, 48 touch/mobile.
- Radius: 6 controls, 10 cards, 14 drawers, full pills.
- Desktop data row: 64–72 px; mobile record card: minimum 112 px.
- Borders establish structure; shadows are limited to menus, drawers and modals.

### Responsive grids

| Breakpoint | Frame | Navigation | Content grid | Page padding |
|---|---:|---|---|---:|
| Desktop | 1440 | 232 px fixed sidebar | 12 columns | 24 px |
| Tablet | 1024 | 80 px icon rail / drawer | 8 columns | 20 px |
| Mobile | 390 | top bar + bottom destinations | 4 columns | 16 px |

## Core component inventory

1. Product shell: sidebar, compact rail, mobile top bar and bottom navigation.
2. Workspace switch: Study Abroad / Direct Visa.
3. Page header: breadcrumb, title, supporting count, primary action, overflow actions.
4. Buttons: primary, secondary, quiet, danger; small/default/large; default/hover/focus/disabled/loading.
5. Fields: text, search, select, date, textarea, phone, currency, file; default/focus/error/disabled.
6. Status badges: lifecycle, health, due state, communication state, finance state.
7. Filter bar: search, compact selectors, date range, active-filter chips, reset, saved view.
8. Metric card: label, value, trend/context, drill-down action.
9. Data table: sticky header, sortable column, selection, dense row, expanded row, empty/loading/error.
10. Mobile record card: identity, lifecycle, next action, risk, latest activity and quick actions.
11. Case timeline/pipeline: current stage, progress, entered date, blockers and stage action.
12. Activity event: actor, action, changed fields, timestamp and source.
13. Communication thread: inbox row, thread header, message, attachment and composer.
14. Drawer/modal: details drawer, create/edit modal, confirmation, bulk-action result.
15. Permission notice: Super Admin-only, branch-restricted and read-only states.

## Page families and required models

Every family is modelled at 1440, 1024 and 390 widths. Desktop uses tables where scanning matters; tablet preserves columns by priority; mobile converts dense tables into record cards with filters in a full-height sheet.

### 01. Authentication and staff setup

- Unified sign-in, password recovery, one-time staff setup, change password and invitation expired states.
- No reusable password is displayed or emailed.

### 02. Dashboard / branch workspace

- Branch users see their branch name as fixed context, not an editable branch filter.
- Super Admin may filter by branch and staff.
- Metrics: total active, new enquiries, overdue follow-ups/tasks, applications awaiting action, visa expiry risk and unallocated responsibility.
- Work queue columns: client/contact; enquiry source and lead score; service/destination/intake; stage and progress; next action and due; risk/blockers; latest activity and actor.
- Never show an Owner column as the principal explanation of visibility.

### 03. Enquiries

- Columns: client/contact, source, lead score, service, destination/visa category, intake, stage age, next follow-up, last contact, latest actor, risk and created date.
- Actions: open, edit, convert, create follow-up, message, export and bulk actions.

### 04. Clients and students

- Columns: identity/contact, service, branch, destination, active matters, current stage, next action, documents pending and latest activity.
- Client identity remains visible throughout the full lifecycle.

### 05. Applications and visa matters

- Study Abroad: institution, course, intake, partner, application status, authoritative stage, milestone due, progress and latest action.
- Direct Visa: subclass/category, current visa, expiry, TRN/reference, lodgement/decision status, authoritative stage, progress and latest action.
- Visa Matters are never mixed into the Study Abroad application table.

### 06. Case workspace

- Header: case reference, client, service, branch, stage, health, progress and due date.
- Tabs: home, client details, family, background, applications or visa matter, documents, messages, finance, activity and notes.
- Home: next priority, pipeline, blockers, upcoming tasks/appointments, pending documents and latest audited changes.
- Optional responsibility appears as a compact metadata row only. Case Owner and Case Team assignment panels are excluded.

### 07. Tasks, follow-ups and calendar

- Personal and branch views, status tabs, assignee as accountability, priority, due, linked client/case, created by and completed by.
- Calendar preserves Google connection status, day/week/month views and appointment details.

### 08. Documents

- Case document library, checklist status, requested/received/verified, expiry, owner of latest action, upload and bulk request.
- Mobile supports camera/file upload without losing checklist context.

### 09. Messages and Gmail

- Connected Gmail inbox, search, inbox/sent/drafts, thread list, message content, attachments, reply/forward and case linking.
- SMS and WhatsApp remain distinct channels with delivery state.
- Personal Gmail content is private to the connected owner; case-linked communications follow authorised branch visibility.

### 10. Finance and commissions

- Client invoices, payments, receipts, balances and audit trail.
- Partner/university commission invoices with student membership, net, tax, total, partial payments, pending/received balance and numbered receipts.
- Currency and irreversible actions require explicit confirmation.

### 11. Course Finder

- Search and filters, course result list, provider/campus/duration/intakes/fees, shortlist and attach-to-case action.
- Staff can search and advise; catalogue maintenance is administrator-controlled.

### 12. Reports and audit

- Conversion, follow-up performance, application outcomes, visa outcomes/expiry, finance, staff activity and branch workload.
- Audit view filters by actor, record, action, field and date and shows immutable before/after changes.

### 13. Templates, workflows and campaigns

- Document checklist templates, email templates, content templates, workflow templates and email/SMS/WhatsApp campaigns.
- Review recipients and predicted counts before sending.

### 14. Administration and integrations

- Branch Admin: staff accounts in own branch, invitations, roles, portal access, legacy import and configured integration status allowed by policy.
- Super Admin: everything above plus branches, cross-branch users, organisation settings and system-wide migration controls.
- Staff: no Administration or branch controls.

### 15. Public intake and client portal

- Secure enquiry intake, token invalid/expired/capacity states and submitted confirmation.
- Client portal: journey status, requested documents, appointments, messages, invoices and receipts.

## Responsive content priority

| Data | Desktop | Tablet | Mobile |
|---|---|---|---|
| Client + contact | Separate primary/secondary lines | Preserved | Card header |
| Stage + progress | Full column | Full column | Status row |
| Next action + due | Full column | Full column | Priority block |
| Risk/blockers | Full column | Badge + count | Alert line |
| Latest activity + actor | Full column | Condensed | Card footer |
| Source/score/destination | Enquiry detail column | Condensed | Expandable detail |
| Optional responsibility | Secondary metadata | Overflow detail | Details sheet |

## Figma page order

1. `00 — Cover`
2. `01 — Getting Started`
3. `02 — Foundations`
4. `---`
5. `03 — Components — Actions & Fields`
6. `04 — Components — Navigation & Shell`
7. `05 — Components — Data & Status`
8. `06 — Components — Case & Communication`
9. `---`
10. `10 — Screens — Authentication`
11. `11 — Screens — Dashboard`
12. `12 — Screens — Enquiries & Clients`
13. `13 — Screens — Applications & Visas`
14. `14 — Screens — Case Workspace`
15. `15 — Screens — Tasks & Calendar`
16. `16 — Screens — Documents`
17. `17 — Screens — Messages & Gmail`
18. `18 — Screens — Finance`
19. `19 — Screens — Course Finder`
20. `20 — Screens — Reports & Audit`
21. `21 — Screens — Templates & Campaigns`
22. `22 — Screens — Administration & Integrations`
23. `23 — Screens — Intake & Client Portal`
24. `---`
25. `90 — Utilities & QA`

## Figma acceptance checklist

- All five token collections exist with scoped variables and exact Web code syntax.
- Primitive colours are hidden from design pickers; semantic colours alias primitives.
- All core components use auto layout and variable-bound colour, spacing and radius values.
- Interactive components have documented variants and accessible focus/error/disabled states.
- All 15 page families have desktop, tablet and mobile frames (45 responsive models).
- Branch-role screens contain no branch selector or branch-management control.
- Super Admin variants visibly identify global context.
- Dashboard and enquiry models include the required operational information.
- Case workspace excludes assignment-controlled visibility and retains audited responsibility metadata only.
- Every page includes empty, loading, error and permission-restricted guidance where applicable.
- Component and screen frames pass visual screenshot review and structure/metadata review.

