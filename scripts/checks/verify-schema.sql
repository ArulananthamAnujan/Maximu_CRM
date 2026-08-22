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
  ('Integrity (0011)',      'policy',   'audit_events.audit_case_read',     'A case officer can read their case history')
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
    end) then 'OK' else 'MISSING' end as status,
  e.detail
from expected e
order by e.area, e.name;
