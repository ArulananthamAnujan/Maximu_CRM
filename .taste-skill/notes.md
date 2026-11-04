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

## Second run: the rest of the screens

The same sheet, applied to the sign-in page, the client portal, the Gmail
workspace and the secondary staff screens. Measured with `inspect.mjs --app`
on the seeded two-office agency, before and after.

| Screen | Before | After |
| --- | --- | --- |
| Sign-in | 4 FAIL, 5 WARN | 0 FAIL, 0 WARN |
| Students | 1 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Applications | 2 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Visa applications | 2 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Direct visas | 1 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Deferrals | 1 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Completed cases | 1 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| File Manager | 0 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Gmail workspace | 1 FAIL, 3 WARN | 0 FAIL, 0 WARN |
| Calendar | 3 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Tasks | 0 FAIL, 3 WARN | 0 FAIL, 0 WARN |
| Templates | 3 FAIL, 3 WARN | 0 FAIL, 0 WARN |
| Workflows | 0 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Activity & compliance | 0 FAIL, 1 WARN | 0 FAIL, 0 WARN |
| Integrations | 0 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Course Finder | 2 FAIL, 2 WARN | 0 FAIL, 0 WARN |
| Copilot | 1 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Portal: journey | 2 FAIL, 4 WARN | 0 FAIL, 0 WARN |
| Portal: find a course | 3 FAIL, 3 WARN | 0 FAIL, 0 WARN |
| Portal: appointments | 1 FAIL, 5 WARN | 0 FAIL, 0 WARN |
| Portal: documents | 1 FAIL, 5 WARN | 0 FAIL, 0 WARN |
| Portal: messages | 1 FAIL, 5 WARN | 0 FAIL, 0 WARN |
| Portal: invoices | 1 FAIL, 3 WARN | 0 FAIL, 0 WARN |

What the first measurement found: a gradient and a floating shell on the
sign-in page with a 46px title and tracked uppercase kickers; a gradient
intro band on every register (students, applications, visas, direct visas,
deferrals, completed, copilot) and 22 tracked uppercase fact labels inside the
application and visa cards; the Gmail workspace in Arial with a Google-blue
compose button, no h1 on the screen and a connect card centred in an empty
pane; gradients, shadows and 2.3:1 "No CRM events" text on the calendar;
shadowed tabs, a terracotta count and 35 icons in tinted squares on
Templates; 3.3–3.9:1 secondary text on the task board, workflows,
integrations and the course finder; a filter grid running off the tablet's
edge on the course finder; and on the client portal a gradient welcome
banner, the sidebar lying over the page title at 768px, 14px phone margins
and empty single-panel screens.

What changed, beyond the stylesheet:

- Sign-in: the story text sits on the page ground beside one white card; the
  title is "Welcome back" at 32px; the kickers read in sentence case; the
  filled button is the brand navy.
- Gmail: "Gmail" in the header is the screen's h1 and the page title steps
  down to an h2 while the workspace is open, as it does for the case window.
  While Gmail is not connected the pane carries what the CRM itself holds
  (messages sent from the CRM, drafts, the client email templates, campaigns
  and every client with an email on file, each with a Compose button) beside
  the connect card, instead of a lone centred prompt.
- File Manager: a "Standard documents" panel under the client files lists
  the agency's active checklist items by category, which the screen's own
  subtitle had promised.
- Workflows: the fixed pipeline (enquiry → student → application → visa →
  completed) opens the screen as a five-step strip, the signature element;
  stage templates sit beside a headed rail summarising the document checklist
  by category. The old `.pipelinePanel` and `.workflowLayout` class names
  were already taken by a 500px-tall panel rule, so the new blocks are
  `.pipelineStagesPanel` and `.workflowScreen`.
- Activity & compliance: the audit trail sits beside a "Controls in force"
  rail read from the same checks Integrations runs (passport encryption,
  retention, backups, monitoring, security headers, staff logins), and the
  panel says what the trail records.
- Client portal: a main column (next steps, journey, agreements) beside a
  headed rail (account, details, consent) on the journey screen; every other
  portal screen gets a "Your case team" rail with the officer, office,
  service and stage, a message and an appointment button, and what is still
  wanted from the client. Empty states explain what will appear and offer
  the action once (the panel-head button returns when the list has rows). The shell folds its sidebar behind the menu button below 900px
  the way the staff shell does, and the phone margin is 16px.
- Task board: the kicker above "Tasks" is gone (the page title already says
  it); the count tiles and primary button use the brand navy; small text is
  13px.
- Calendar, templates, course finder, integrations: flat surfaces, sentence
  case, 13px labels, muted text at 4.5:1 or better; the course finder's
  filter grid wraps to two columns below 1000px; the integrations coverage
  register stacks on a phone.

After this run the six first-run screens were measured again on the final
build and still read 0 FAIL, 0 WARN. Sample data: still none added. The remaining empty states (no sent mail, no
workflows, no audit rows, no client documents) are what the seed holds.
