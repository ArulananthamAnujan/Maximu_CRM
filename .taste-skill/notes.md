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
| Reports | 4 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Case file | 4 FAIL, 4 WARN | 0 FAIL, 0 WARN |
| Accounts | 4 FAIL, 1 WARN | 0 FAIL, 0 WARN |
| Staff | 3 FAIL, 3 WARN | 0 FAIL, 0 WARN |

The "before" column was measured on the commit before the house style
(85f298a), built in a separate worktree with only the `/?module=` deep link
added so the inspector could open each section by URL. What it found there:
29 tracked uppercase labels and 36 text blocks under 11px on Reports, four
case tabs at 1.5:1 contrast and no h1 on the case file, 62 sub-11px text
blocks and a gradient filter bar on Accounts, a terracotta accent and 2.6:1
link buttons on Staff, and on every screen the gradient sidebar and page
ground, the floating sidebar shadow and panel borders at 2:1.

The three warnings of the first round were fixed rather than defended:

- Reports `below-fold`: the page is now a main column (what falls due, the
  pipeline, workload, offices) beside a headed rail (campaigns, leads, visa
  matters, fees), the headline figures sit full width under the builder, and
  the builder keeps its four secondary filters behind "More filters".
- Case file `ragged-row`: the case home is a main column (client profile,
  admissions, workflow, documents) beside a headed rail (next action, at a
  glance, notes, messages); each rail card sits under its own heading, so no
  card shares a top edge with a card of another height. The branch-access
  notice is one line under the identity instead of a second card.
- Accounts `tiny-text`: the ledger's labels and figures read at 13px.

Sample data: none was added; the screens render the seeded two-office agency
used by the verification scripts.
