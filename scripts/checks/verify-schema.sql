-- Read-only check that every object the CRM expects is present.
-- Paste into Supabase -> SQL Editor -> New query -> Run. It changes nothing.
--
-- Every row must read OK. Anything reading MISSING means a migration in
-- supabase/migrations/ has not been applied yet.
--
-- 0038 and 20260923093828 only rewrite policies that already exist, so they
-- add nothing this query can look for; run them with their neighbours.
-- The last row, schema_version, is what the CRM itself checks at sign-in and
-- on the Integrations screen: select public.schema_version() should return
-- the prefix of the newest file in supabase/migrations/.

with expected(area, kind, name, detail) as (values
  ('Case lifecycle (0008)', 'column',   'cases.lifecycle_stage',            'Which pipeline stage a case sits at'),
  ('Case lifecycle (0008)', 'column',   'cases.visa_expiry_on',             'Visa expiry the case is worked against'),
  ('Case lifecycle (0008)', 'table',    'case_lifecycle_events',            'History of stage changes'),
  ('Case lifecycle (0008)', 'function', 'move_case_lifecycle',              'The only way a case changes stage'),
  ('Security (0009)',       'policy',   'dependants.dependants_read',       'A portal account cannot read other clients'),
  ('Security (0009)',       'policy',   'case_notes.case_notes_internal_read', 'Internal notes are staff only'),
  ('Security (0009, 0032)', 'policy',   'payments.payments_case_team_write', 'Payments are written by the case team and management (0032 replaced payments_finance_write)'),
  ('Case file (0010)',      'column',   'cases.matter_type',                'Student Visa 500, 482, Partner 820/801'),
  ('Case file (0010)',      'column',   'visa_matters.trn',                 'Departmental reference'),
  ('Case file (0010)',      'column',   'visa_matters.information_due_at',  'The s56 response deadline'),
  ('Case file (0010)',      'column',   'visa_matters.responsible_agent_marn', 'Responsible agent MARN'),
  ('Case file (0010)',      'column',   'education_applications.created_at', 'Orders a student''s applications'),
  ('Case file (0010)',      'function', 'seed_default_retention_rules',     'Seven-year retention defaults'),
  ('Integrity (0011)',      'column',   'clients.passport_masked',          'Masked passport for display'),
  ('Integrity (0011)',      'column',   'dependants.passport_masked',       'Masked passport for display'),
  ('Integrity (0011)',      'column',   'education_applications.archived_at','Withdrawn, not deleted'),
  ('Integrity (0011)',      'column',   'dependants.archived_at',           'Removed, not deleted'),
  ('Integrity (0011)',      'policy',   'documents.documents_client_attach','A client may supply a requested document'),
  ('Integrity (0011)',      'policy',   'appointments.appointments_client_request', 'A client may request an appointment'),
  ('Integrity (0011, 0032)','policy',   'audit_events.audit_internal_scoped_read', 'A case officer reads the history of their own cases (0032 replaced audit_case_read)'),
  ('Portal actions (0012)', 'policy',   'audit_events.audit_client_insert', 'A client action is recorded on their own case'),
  ('Portal actions (0012)', 'policy',   'audit_events.audit_client_read',   'A client can see their own case history'),
  ('Portal actions (0012)', 'policy',   'notifications.notifications_client_insert', 'Staff are told when a client asks for something'),
  ('Deferral (0013)',       'enum',     'case_lifecycle_stage.deferred',    'Defer is a pipeline stage, not a guess from text'),
  ('Deferral (0014)',       'function', 'move_case_lifecycle',              'Knows how a case is deferred and resumed'),
  ('Duplicates (0015)',     'index',    'clients_duplicate_email_idx',      'Finds an existing client by email before a second one is made'),
  ('Duplicates (0015)',     'index',    'clients_duplicate_mobile_idx',     'Finds an existing client by mobile'),
  ('Duplicates (0015)',     'index',    'clients_duplicate_passport_idx',   'Finds an existing client by masked passport'),
  ('Duplicates (0015)',     'function', 'find_duplicate_clients',           'The search the intake form runs before it makes anybody'),
  ('Messages (0016)',       'column',   'email_messages.created_at',        'A draft has a date to show before it is sent'),
  ('Staff onboarding (0017)','column',   'staff_invitations.display_name',   'The name an invited person is added under'),
  ('Staff onboarding (0017)','function', 'claim_staff_invitation',           'Turns an invitation into a real account on first sign-in'),
  ('Staff scope (0018)',    'function', 'can_modify_client',                'A case officer writes only to the cases assigned to them'),
  ('Staff scope (0018)',    'function', 'request_case_archive',             'A case officer asks; a manager archives'),
  ('Staff scope (0018)',    'policy',   'cases.cases_scoped_write',         'Rebuilt on can_modify_client'),
  ('Staff scope (0018)',    'policy',   'clients.clients_scoped_write',     'Rebuilt on can_modify_client'),
  ('AI scope (0019)',       'policy',   'ai_interactions.ai_interactions_read', 'Scoped to what the reader may see'),
  ('AI scope (0019)',       'policy',   'ai_interactions.ai_interactions_write','Scoped to what the reader may see'),
  ('Finance scope (0020)',  'policy',   'invoices.invoices_scoped_select',  'A case officer sees only their own clients'' invoices'),
  ('Course Finder (0022)',  'table',    'institutions',                     'Institutions a course can belong to'),
  ('Course Finder (0022)',  'table',    'courses',                          'The Course Finder catalogue'),
  ('Course Finder (0022)',  'policy',   'institutions.institutions_admin_write', 'Administrator only'),
  ('Course Finder (0022)',  'policy',   'courses.courses_admin_write',      'Administrator only'),
  ('Rate limiting (0023)',  'table',    'login_attempts',                   'Recent sign-in attempts by identifier'),
  ('Rate limiting (0023)',  'function', 'login_lock_status',                'Whether an identifier is currently locked out'),
  ('Rate limiting (0023)',  'function', 'record_login_attempt',             'Records a sign-in attempt and reports the resulting lock state'),
  ('Tier 2/3 (0024)',       'policy',   'client_user_links.client_links_write', 'Fixes: linking a portal account had no write policy at all'),
  ('Tier 2/3 (0024)',       'function', 'merge_duplicate_clients',          'Reassigns a duplicate client''s records onto the survivor'),
  ('Tier 2/3 (0024)',       'function', 'update_own_contact_details',       'A client updates their own email, mobile or preferred name'),
  ('Tier 2/3 (0024)',       'function', 'acknowledge_own_consent',          'A client records their own answer to a consent declaration'),
  ('Tier 2/3 (0024)',       'table',    'credit_notes',                     'An amount forgiven against an invoice without a refund'),
  ('Tier 2/3 (0024)',       'table',    'saved_views',                      'A named filter preset, private to whoever saved it'),
  ('Course catalogue (0026)','function','search_course_catalog',            'Paginated Course Finder search'),
  ('Checklist templates (0025)', 'table', 'document_checklist_templates',   'The editable document-request checklist, replacing a hard-coded list'),
  ('Checklist templates (0025)', 'policy', 'document_checklist_templates.document_checklist_templates_admin_write', 'Same masters-data access shape as institutions and courses'),
  ('Checklist templates (0025)', 'function', 'seed_default_document_checklist_templates', 'Gives every organisation the same 35 starting items the code used to hard-code'),
  ('Staff invoicing (0026, 0032)', 'policy', 'invoices.invoices_case_team_write', 'A case officer raises and edits invoices for the cases they work (0032 replaced invoices_staff_create)'),
  ('Email templates (0027)', 'table',    'email_templates',                  'Editable wording for the document, invoice and portal-welcome emails a client is sent'),
  ('Email templates (0027)', 'policy',   'email_templates.email_templates_admin_write', 'Same masters-data access shape as institutions and courses'),
  ('Email templates (0027)', 'function', 'seed_default_email_templates',     'Gives every organisation the three starting email templates'),
  ('Case collaboration (0028)', 'table',  'case_collaborators',               'Extra staff working a case alongside its owner'),
  ('Case collaboration (0028)', 'policy', 'case_collaborators.case_collaborators_manage', 'Only the case owner or a manager adds or removes a collaborator'),
  ('Gmail case inbox (0029)', 'index',    'email_messages_provider_message_unique', 'A synced Gmail message is never imported twice'),
  ('Course catalogue sync (0030)', 'column', 'courses.external_code',          'Official CRICOS rows keep their source code'),
  ('Production completion (0031)', 'column', 'appointments.requested_by',      'Who asked for an appointment'),
  ('Branch scope (0032)',       'column',   'commission_claims.branch_id',      'Commission claims belong to an office'),
  ('Case creation scope (0033)','policy',   'cases.cases_scoped_write',         'A case is made inside the writer''s own scope'),
  ('Legacy parity (0033)',      'column',   'clients.mobile_normalized',        'Mobile numbers match whatever format they were typed in'),
  ('Case visibility (0034)',    'function', 'can_view_case',                    'Who may open a case'),
  ('Branch workspace (0035)',   'function', 'can_access_case',                  'Branch-wide case access'),
  ('Legacy workflow (0036)',    'column',   'tasks.task_type',                  'Task types carried over from the old CRM'),
  ('Lossless import (0037)',    'column',   'import_batches.declared_rows',     'Every row of an import is accounted for'),
  ('Branch lifecycle (0039)',   'function', 'move_case_lifecycle',              'Branch-aware stage moves'),
  ('Invoice ledger (0040)',     'table',    'finance_requests',                 'Refunds and credit notes are requests applied atomically'),
  ('Branch work access (0041)', 'policy',   'clients.clients_scoped_write',     'Rebuilt for whole-branch work'),
  ('Branch transfer (0042)',    'function', 'can_access_client',                'A super admin moves a case between offices'),
  ('Staff removal (0043)',      'function', 'retire_staff_profile',             'A staff account is retired, never deleted'),
  ('Function access (20260915)','column',   'profiles.function_access',         'Per-function access stored on each account'),
  ('Function access (20260915)','function', 'private.function_allowed',         'The database check behind every section'),
  ('Staff creation (20260915)', 'column',   'staff_invitations.function_access','Access chosen when a login is created'),
  ('Calendar access (20260916)','function', 'private.guard_connection_function','Calendar connections obey function access'),
  ('Permission groups (20260916)','column', 'profiles.staff_details',           'Mobile number and timezone on the account'),
  ('Note visibility (20260916)','policy',   'legacy_external_keys.function_access_read', 'Legacy keys readable under function access'),
  ('Delegated transfer (20260923)','function','private.guard_function_access',  'Invalid access keys are rejected in the database'),
  ('Catalogue performance (20260923)','function','search_course_catalog_v2',    'The Course Finder search the screens call'),
  ('Workspace performance (20260923)','index','cases_client_branch_idx',        'Fast branch directory'),
  ('Client visibility (20260923)','function','private.client_visible',          'Fast client visibility lookup'),
  ('Client policy sets (20260923)','function','private.visible_client_ids',     'The visible-client set behind the policies'),
  ('Task emails (20260924)',    'table',    'task_email_outbox',                'Task notifications queued for sending'),
  ('Launch readiness (20261026)','function','sync_visa_matter_case_expiry',     'Visa expiry kept on the case'),
  ('Agreements (20261027)',     'column',   'service_agreements.viewed_at',     'When a client opened an agreement'),
  ('Notice recipients (20261027)','function','queue_client_notice',             'Recipients are validated before a notice is queued'),
  ('Notice retry (20261027)',   'function', 'retry_client_notice',              'A failed notice can be sent again'),
  ('Client notice wording (20261103)','function','render_client_notice_template','Document requests use the organisation''s own email template'),
  ('View and edit access (20261104)','function','private.case_edit_allowed',    'A view-only section is read-only in the database too'),
  ('View and edit access (20261104)','function','private.edit_allowed',         'The edit check behind every section'),
  ('Schema version (20261104)', 'function', 'schema_version',                   'Tells the CRM which migration the database is at; should return 20261109010000'),
  ('Course catalogue live sync (0030)', 'table',    'course_catalog_sync_runs',  'One row per catalogue sync attempt, success or failure'),
  ('Course catalogue live sync (0030)', 'function', 'search_course_catalog_v2',  'Student-safe catalogue search with advising filters and source freshness'),
  ('Course catalogue live sync (0030)', 'column',   'institutions.country_code', 'Normalised ISO country code behind the country filter'),
  ('Production completion (0031)', 'table',    'organisation_settings',        'Owner-managed currency, tax and numbering configuration'),
  ('Production completion (0031)', 'table',    'backup_runs',                  'Evidence a database backup actually completed'),
  ('Production completion (0031)', 'table',    'restore_drills',               'Evidence a backup was actually restored and validated'),
  ('Production completion (0031)', 'policy',   'payment_receipts.payment_receipts_client_read', 'A client reads only the receipts issued on their own invoices'),
  ('Production completion (0031)', 'function', 'respond_to_appointment',       'Staff confirm, reschedule or decline a client''s appointment request'),
  ('Production completion (0031)', 'function', 'transfer_staff_ownership',     'Moves a departing staff member''s open cases, tasks and enquiries before removal'),
  ('Branch/case-team scope (0032)', 'function', 'can_access_branch',           'A branch admin or manager is scoped to their own branch'),
  ('Branch/case-team scope (0032)', 'function', 'can_access_case',             'Case visibility: owner, supervisor or an explicit collaborator, not every case a client has'),
  ('Branch/case-team scope (0032)', 'column',   'commission_claims.branch_id', 'A commission claim is scoped to the branch that earned it'),
  ('Branch/case-team scope (0032)', 'policy',   'client_user_links.client_links_write', 'A branch admin or manager links a portal login only within their own branch'),
  ('Case creation scope fix (0033)', 'policy',    'cases.cases_scoped_write',    'A brand new case is checked against its own owner/branch columns, not a self-referencing lookup that could never see it'),
  ('Case cover visibility (0034)', 'function',  'can_view_case',               'The case board stays branch-wide read for cover and handover, distinct from the narrower working-detail boundary'),
  ('Case cover visibility (0034)', 'function',  'can_access_client',           'Restored to 0018''s branch-wide read boundary; can_modify_client remains the separate, narrower write boundary'),
  ('Case cover visibility (0034)', 'function',  'can_modify_client',           'Restored to the owner/case-team write boundary, independent of the now-wider can_access_client read boundary'),
  ('Case cover visibility (0034)', 'policy',    'invoices.invoices_scoped_select', 'A client-level invoice''s finance detail stays case-team scoped even though the case itself is branch-visible'),
  ('Legacy workflow parity (0036)', 'column',   'tasks.task_type',               'Preserves the operational category of imported and newly-created tasks'),
  ('Legacy workflow parity (0036)', 'column',   'tasks.completed_by',            'Records the staff member who actually completed a branch-visible task'),
  ('Legacy workflow parity (0036)', 'column',   'tasks.updated_at',               'Preserves the last operational change time shown in the task register'),
  ('Legacy workflow parity (0036)', 'column',   'invoices.discount',              'Preserves discounts separately from subtotal, tax and payment totals'),
  ('Legacy workflow parity (0036)', 'column',   'invoices.payment_method',        'Preserves how the initial or recorded invoice payment was received'),
  ('Legacy workflow parity (0036)', 'column',   'invoices.description',           'Preserves invoice service and payment context from the previous CRM')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_record_snapshots',       'Complete checksummed source rows with protected fields encrypted')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_activity_events',         'Old comments, status history and staff attribution')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_file_manifests',          'Attachment copy and checksum reconciliation')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_finance_line_items',      'Student-level invoice and commission details')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_staff_directory',         'Inactive and historical staff attribution')
  ,('Lossless legacy migration (0037)', 'table', 'legacy_master_records',          'Old CRM reference and standard-document records')
  ,('Lossless legacy migration (0037)', 'column','import_batches.source_checksum', 'Whole-export reconciliation checksum')
  ,('Lossless legacy migration (0037)', 'column','import_rows.protected_data',      'Encrypted sensitive source values')
  ,('Client forms (20261109)',          'table',  'form_templates',                 'Questionnaires sent before a visa application (500, 485, 600)')
  ,('Client forms (20261109)',          'table',  'case_forms',                     'A questionnaire on one case with the client''s answers')
  ,('Client forms (20261109)',          'function','case_form_action',              'The only way a form is created, sent, answered or reviewed')
  ,('Client forms (20261109)',          'column', 'client_notice_outbox.form_id',   'A form request notice points at its form')
  ,('Client forms (20261109)',          'policy', 'case_forms.case_forms_hide_drafts', 'A portal account never sees an unsent form')
  ,('Client forms (20261109)',          'function','seed_migration_document_checklist_items', 'Agent appointment, Genuine Student, AFP check and other migration checklist items')
)
select
  e.area,
  e.name,
  case when (
    case e.kind
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(e.name, '.', 1)
          and column_name = split_part(e.name, '.', 2))
      when 'table' then exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = e.name)
      when 'function' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = case when position('.' in e.name) > 0 then split_part(e.name, '.', 1) else 'public' end
          and p.proname = case when position('.' in e.name) > 0 then split_part(e.name, '.', 2) else e.name end)
      when 'policy' then exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = split_part(e.name, '.', 1)
          and policyname = split_part(e.name, '.', 2))
      when 'enum' then exists (
        select 1 from pg_enum en join pg_type t on t.oid = en.enumtypid
        where t.typname = split_part(e.name, '.', 1)
          and en.enumlabel = split_part(e.name, '.', 2))
      when 'index' then exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = e.name)
    end) then 'OK' else 'MISSING' end as status,
  e.detail
from expected e
order by e.area, e.name;
