# Maximus legacy CRM replacement register

This is the release contract for retiring `staff.maximuseducation.com.au`. It is
based on a read-only audit of the live legacy CRM on 5 September 2026 and the
legacy exports already held for migration. A module is not migration-complete
until its source count, imported count and record relationships reconcile.

## Source registers

| Workspace | Legacy register | Source count | New CRM target | Migration state |
| --- | --- | ---: | --- | --- |
| Study Abroad | Enquiries | 5,292 | `clients`, `cases`, `enquiries` | Partial: production currently contains 5,117/5,119 enquiry-stage cases; reconcile IDs before cutover |
| Study Abroad | Students | 320 | `clients`, `cases`, intake history | Export and import required |
| Study Abroad | Applications | 54 | `education_applications` | Export and import required |
| Study Abroad | Visa | 91 | `visa_matters` | Export and import required |
| Study Abroad | Defer | 0 | deferred cases/applications | No source rows at audit time |
| Direct Visa | Enquiries | 24 | `clients`, `cases`, `enquiries` with `service_type=direct_visa` | Export and import required |
| Direct Visa | Clients | 56 | `clients`, `cases`, visa/intake history | Export and import required |
| Direct Visa | Visa applications | 0 | `visa_matters` | No source rows at audit time |
| Direct Visa | Case complete | 0 | completed cases | No source rows at audit time |

The old CRM's headline counts are not additive client counts: a person can move
between stages and may have more than one application. Stable legacy IDs must be
used to reconnect records, notes, documents and communications without creating
duplicates.

## Enquiry directory parity

The old enquiry register exposes created/updated dates, ID and name, email,
mobile/alternate mobile, countries, priority, status, assigned by/to, intake,
source/reference, English-test state, highest qualification, year passed,
branch and last remark. It filters by those fields plus spouse/dependant state.
It also provides export, assignment, email, SMS, WhatsApp, follow-up, edit,
delete/archive, history, notes and conversion to student/client.

The new CRM maps those capabilities as follows:

| Legacy capability | New CRM implementation |
| --- | --- |
| Name, reference, contact, office, service, country, priority, status, source, intake and last remark | Server-paged Enquiries directory and 50-row operational table |
| Created/updated, staff, status, source, intake, qualification, test and spouse filters | Enquiries **More filters** panel; queries remain RLS-scoped |
| Follow-up and notes | Due date, latest note, add-note action, Tasks and case timeline |
| Edit and archive | Secure case file actions with audit history |
| Convert/progress | Validated lifecycle movement from Enquiry through Student/Client, Application, Visa, Defer and Completed |
| Email, SMS and WhatsApp | Case Communications tab and permission-scoped campaign tools |
| Documents | Case document checklist, request, upload, verification and Drive metadata |
| Bulk work | Permission-scoped bulk operations and exports; destructive limits remain enforced server-side |

## Student, application and visa parity

- Students retain profile, branch, assigned staff, source, country/course/intake,
  priority/status, passport, dependants, education, employment, English tests,
  study preferences, visa history, notes, follow-ups, appointments and documents.
- Institution applications are first-class records with institution, country,
  course, campus, intake, reference, partner/associate, status, submission,
  offer, CoE and deadline dates, notes and archived/withdrawn state.
- Visa matters retain destination, subclass/stream, current visa and expiry,
  lodgement/TRN, responsible agent/MARN, bridging visa, health, biometrics,
  police clearance, skills assessment, information-request deadlines,
  conditions, decision/outcome/refusal reason, notes and documents.
- Every case file merges notes, stage changes, imported legacy activity and
  audited actions into one chronological timeline.

## Cutover gates

1. Export all registers listed above from the old CRM.
2. Validate them through the chunked legacy import without committing invalid
   rows.
3. Reconcile source IDs and counts by workspace and lifecycle stage.
4. Reconcile orphan applications, visa matters, notes and files to a parent
   case; do not manufacture placeholder clients.
5. Run branch-role and Super Admin visibility checks.
6. Measure cold first-page and cached navigation latency in production.
7. Keep the old CRM read-only until all non-zero source registers reconcile.


## Interface preservation audit — 7 September 2026

The existing CRM is the primary workflow reference for this redesign. Its live
Study Abroad enquiry register, client profile, notes dialog, suggested university
screen and document screen were revisited without making changes. Earlier
register and migration findings above remain historical snapshots, not current
reconciled totals. The old system was still receiving new records during review.

| Working area | Preservation and current implementation |
| --- | --- |
| Navigation | Every permitted existing module remains available in the sliding navigation; staff registers use the full width. |
| Enquiry list | Client/reference/office, contact, destination/status/intake, latest note and actions remain in the list. All existing filters remain available. Source, priority, campaign, dates, staff, education/test/spouse values and other details are available in Client details within the preview. |
| Contextual case | Selecting a name opens a slide-out with client contact details first. Notes, messages, documents, background, family, applications, visa and finance remain available; Open full case is an explicit separate action. |
| Notes and follow-ups | Notes save within the preview. Follow-ups can be scheduled there with a timestamp, remarks and priority, and appear as case-linked tasks. The legacy note-reminder association and reminder delivery still require a complete data reconciliation; the new follow-up is a separate task. |
| Applications and visa | Short overview rows retain the complete original operational fields in an expandable section. Each record offers notes, email, files and the full case. New-record entry selects a client and continues in the corresponding case section. |
| Documents | Files/requests, direct upload, new versions, custom requests, additive template selection and manual requirements are available in the selected case. Existing requests are preserved when adding templates. |
| Communications | The case composer retains client context; Email, WhatsApp and SMS send through their own endpoints. Draft/failed messages can be retried from the conversation. A failed send remains visible as an error and unsent state. |
| Reports | Reports read beyond database row caps; unavailable data produces an error and retry action. Fees are shown by currency, after credit notes, excluding void/refunded invoices from active balances. |

### Remaining proof required before retiring the old CRM

This UI change is not evidence that every historical record or attachment has
migrated. Reconcile the previously imported detail snapshots and all source IDs,
including note reminders, suggested courses, uploaded files, communication
attachments, follow-up/appointment history, invoices and partner/university
accounts. The legacy document screen also exposes document-link sending and
bulk email/download actions; verify their end-to-end equivalence with the new
portal and communication tools. Confirm real provider delivery separately from
synthetic UI testing. No live client messages were sent during this review.
