-- Read-only check that every object the CRM expects is present.
-- Paste into Supabase -> SQL Editor -> New query -> Run. It changes nothing.
--
-- Every row must read OK. Anything reading MISSING means a migration in
-- supabase/migrations/ has not been applied yet.

with expected(area, kind, name, detail) as (values
  ('Case lifecycle (0008)', 'column',   'cases.lifecycle_stage',            'Which pipeline stage a case sits at'),
  ('Case lifecycle (0008)', 'column',   'cases.visa_expiry_on',             'Visa expiry the case is worked against'),
  ('Case lifecycle (0008)', 'table',    'case_lifecycle_events',            'History of stage changes'),
  ('Case lifecycle (0008)', 'function', 'move_case_lifecycle',              'The only way a case changes stage'),
  ('Security (0009)',       'policy',   'dependants.dependants_read',       'A portal account cannot read other clients'),
  ('Security (0009)',       'policy',   'case_notes.case_notes_internal_read', 'Internal notes are staff only'),
  ('Security (0009)',       'policy',   'payments.payments_finance_write',   'Payments are management only'),
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
  ('Integrity (0011)',      'policy',   'audit_events.audit_case_read',     'A case officer can read their case history'),
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
  ('Staff scope (0018)',    'policy',   'clients.clients_scoped_write',     'Rebuilt on can_modify_client')
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
        where n.nspname = 'public' and p.proname = e.name)
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
