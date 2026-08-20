-- AI-assisted operations, calendar, templates and governance.
-- AI records store generated suggestions only; consequential actions require a human approval.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  owner_id uuid references public.profiles(id),
  title text not null,
  appointment_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_calendar_event_id text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.content_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  template_type text not null,
  subject text,
  body text not null,
  version integer not null default 1,
  approval_status text not null default 'draft',
  approved_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_consents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  consent_type text not null,
  granted_at timestamptz not null,
  expires_at timestamptz,
  evidence_document_id uuid references public.documents(id),
  revoked_at timestamptz
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  case_id uuid references public.cases(id) on delete cascade,
  purpose text not null,
  prompt_redacted text,
  response_redacted text,
  model_provider text,
  model_name text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.ai_interactions(id) on delete cascade,
  source_type text not null,
  source_record_id uuid,
  source_label text not null,
  excerpt_redacted text
);

create table if not exists public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  interaction_id uuid not null references public.ai_interactions(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'low',
  approval_status text not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  executed_at timestamptz
);

do $$
declare table_name text;
begin
  foreach table_name in array array['appointments','content_templates','client_consents','ai_interactions','ai_action_proposals']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "organisation isolation" on public.%I using (organisation_id = public.current_organisation_id()) with check (organisation_id = public.current_organisation_id())',
      table_name
    );
  end loop;
end $$;

