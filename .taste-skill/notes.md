# Maximus CRM — app-screen run (design-taste-frontend)

The CRM is worked in, not read, so it follows the app-screen run in
`references/app-screens.md`. `direction.json` beside this file is the dealt
sheet; reprint it with `node .agents/skills/design-taste-frontend/scripts/draw.mjs --show`.

## Inventory (2.1)

- Objects: enquiries that become cases (case number, client, office, stream,
  matter, stage, health, owner, dates), clients (name, email, mobile,
  nationality, passport), applications (institution, course, intake, status,
  submission, offer, CoE), visa matters (subclass, lodgement, decision,
  outcome, information requests), documents (requested, uploaded, verified),
  invoices and payments (AUD, cents), tasks, appointments, notes, staff.
- Magnitudes: two offices, five staff, a few hundred enquiries a year, a
  case open for months, invoices in the low thousands of dollars.
- People: a small team on desktops all day; the register and case file on a
  phone between appointments; a client on a phone in the portal.
- Jobs: open the case that needs attention, record a note or document, move
  a case a stage, raise an invoice, export for a manager.

## The screens' one question (2.2)

| Screen | Question | Biggest block | Main job, one click away |
| --- | --- | --- | --- |
| Dashboard | What needs my attention today? | Priority cases | Open a case |
| Enquiries | Which enquiries need a follow-up? | The register | New enquiry; open a case |
| Case file | Where is this case, what is next? | Case home | Edit case; move stage |
| Reports | How are enquiries converting this period? | Report builder | Export to Excel |
| Accounts | What is outstanding? | Invoice ledger | Record payment |
| Staff | Who can do what? | Team table | Manage access |

## Style (2.3)

Dealt: **accent-ladder** (seed 366011953), shell **open plane**, with
`--keep palette,type` because the brand already fixes both. Chosen over
framed-sheet because the team lives in this screen all day and the brand's
navy wants to stay on small marks, not on a frame.

Its face: the ladder built from the brand's own hue. Maximus navy (#102f40)
is the one hue, at full strength only on the mark, the active nav icon and
the one filled button; its pale tint (#e7eef3) carries the active nav row,
the access panel and the stage badge. No violet, no terracotta, no gradient.

Signature element: the case pipeline (enquiry → student → application → visa
→ completed), which already exists as the "Move to" control and the case
pipeline block, now set in ink with the stage badge in the tint.

## What changed (2.4–2.7)

`app/house-style.css`, loaded last, carries the house style; the uppercase
kicker strings were rewritten in sentence case in `app/page.tsx`; every type
size under 11px was raised in the stylesheets; numeric report cells carry
`.num` for right-aligned tabular figures; the case window's title is an h1.

Inspector results on the live screens (`inspect.mjs --app`), after the run:

| Screen | Before | After |
| --- | --- | --- |
| Dashboard | 6 FAIL, 1 WARN | 0 FAIL, 0 WARN |
| Enquiries | 6 FAIL, 1 WARN | 0 FAIL, 0 WARN |
| Reports | not measured | 0 FAIL, 1 WARN (below-fold) |
| Case file | not measured | 0 FAIL, 1 WARN (ragged-row) |
| Accounts | not measured | 0 FAIL, 1 WARN (tiny-text) |
| Staff | not measured | 0 FAIL, 0 WARN |

Warnings kept, with the reason:

- Reports `below-fold`: the report builder is the screen's job and sits
  first on purpose; the agency figures follow it.
- Case file `ragged-row`: the case home pairs the client profile with the
  next-action rail, whose heights follow their content; the row is
  top-aligned so neither card stretches over empty space.
- Accounts `tiny-text`: the invoice ledger is a dense list; its 12px labels
  are within the labels-and-meta band and every figure is 13px or larger.

Sample data: none was added; the screens render the seeded two-office agency
used by the verification scripts.
