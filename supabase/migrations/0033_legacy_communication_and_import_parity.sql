begin;

alter table public.clients add column if not exists mobile_normalized text;
alter table public.import_rows add column if not exists target_record_id uuid;
alter table public.enquiries add column if not exists case_id uuid references public.cases on delete cascade;

-- The earlier CRM's partner/university accounts were commission invoices,
-- not a single expected/received number. Keep the original claim identity but
-- add the invoice, tax, student and counterparty fields required to resume the
-- same account in this CRM.
alter table public.commission_claims
  add column if not exists counterparty_type text not null default 'partner',
  add column if not exists counterparty_email text,
  add column if not exists invoice_number text,
  add column if not exists net_amount numeric(14,2) not null default 0,
  add column if not exists tax_rate numeric(7,4) not null default 0,
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists issued_on date,
  add column if not exists student_count integer not null default 0,
  add column if not exists case_ids uuid[] not null default '{}';
do $$ begin
  alter table public.commission_claims add constraint commission_claims_counterparty_type_check
    check (counterparty_type in ('partner','university'));
exception when duplicate_object then null; end $$;
create unique index if not exists commission_claims_org_invoice_number_idx
  on public.commission_claims(organisation_id, invoice_number)
  where invoice_number is not null;

create table if not exists public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  claim_id uuid not null references public.commission_claims on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'AUD',
  payment_reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles,
  created_at timestamptz not null default now()
);
create index if not exists commission_payments_claim_idx
  on public.commission_payments(claim_id, paid_at desc);

create table if not exists public.commission_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  payment_id uuid not null unique references public.commission_payments on delete restrict,
  receipt_number text not null,
  issued_by uuid references public.profiles,
  issued_at timestamptz not null default now(),
  unique (organisation_id, receipt_number)
);
alter table public.commission_payments enable row level security;
alter table public.commission_receipts enable row level security;
-- Older enquiries predate case linkage. Attach each one to the newest case for
-- that client so Study Abroad and Direct Visa reports remain independent.
update public.enquiries e
set case_id = (
  select c.id
  from public.cases c
  where c.client_id = e.client_id
    and c.organisation_id = e.organisation_id
  order by c.opened_at desc nulls last, c.id
  limit 1
)
where e.case_id is null;
create index if not exists enquiries_case_idx
  on public.enquiries(case_id, created_at desc);
update public.clients
set mobile_normalized = regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g')
where mobile_normalized is distinct from regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g');
create index if not exists clients_org_mobile_normalized_idx
  on public.clients(organisation_id, mobile_normalized)
  where mobile_normalized is not null and mobile_normalized <> '';

create or replace function public.set_client_mobile_normalized()
returns trigger language plpgsql set search_path = public as $$
begin
  new.mobile_normalized := regexp_replace(coalesce(new.mobile, ''), '[^0-9]', '', 'g');
  return new;
end;
$$;
drop trigger if exists clients_mobile_normalized on public.clients;
create trigger clients_mobile_normalized before insert or update of mobile on public.clients
for each row execute function public.set_client_mobile_normalized();

-- Stable identities let independent legacy exports (clients, cases,
-- applications, invoices, notes, etc.) be imported in separate batches and
-- still reconnect to the same records in this CRM.
create table if not exists public.legacy_external_keys (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null default 'legacy_maximus',
  entity_type text not null,
  source_key text not null,
  target_table text not null,
  target_id uuid not null,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles,
  metadata jsonb not null default '{}',
  unique (organisation_id, source_system, entity_type, source_key)
);
create index if not exists legacy_external_keys_target_idx
  on public.legacy_external_keys(organisation_id, target_table, target_id);

-- WhatsApp is stored as a first-class case conversation. It must not be
-- hidden inside email metadata because delivery, templates and webhook
-- receipts follow different provider rules.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  branch_id uuid references public.branches,
  case_id uuid not null references public.cases on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender text not null,
  recipient text not null,
  body text not null,
  template_name text,
  provider_message_id text,
  delivery_state text not null default 'draft'
    check (delivery_state in ('draft','queued','sent','delivered','read','received','failed','discarded')),
  provider_error text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'
);
create unique index if not exists whatsapp_messages_provider_unique
  on public.whatsapp_messages(organisation_id, provider_message_id)
  where provider_message_id is not null;
create index if not exists whatsapp_messages_case_time_idx
  on public.whatsapp_messages(case_id, created_at desc);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  branch_id uuid references public.branches,
  case_id uuid not null references public.cases on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender text not null,
  recipient text not null,
  body text not null,
  provider_message_id text,
  delivery_state text not null default 'draft',
  provider_error text,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'
);
create unique index if not exists sms_messages_provider_unique on public.sms_messages(organisation_id, provider_message_id) where provider_message_id is not null;
create index if not exists sms_messages_case_time_idx on public.sms_messages(case_id, created_at desc);

create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  branch_id uuid references public.branches,
  created_by uuid not null references public.profiles,
  name text not null,
  channel text not null check (channel in ('email','whatsapp')),
  subject text,
  body text not null,
  audience_filter jsonb not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','scheduled','queued','running','completed','cancelled','failed')),
  scheduled_at timestamptz,
  approved_by uuid references public.profiles,
  launched_at timestamptz,
  completed_at timestamptz,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.communication_campaigns drop constraint if exists communication_campaigns_channel_check;
alter table public.communication_campaigns add constraint communication_campaigns_channel_check check (channel in ('email','whatsapp','sms'));
create index if not exists communication_campaigns_branch_status_idx
  on public.communication_campaigns(organisation_id, branch_id, status, created_at desc);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  campaign_id uuid not null references public.communication_campaigns on delete cascade,
  case_id uuid not null references public.cases on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  destination text not null,
  rendered_subject text,
  rendered_body text not null,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed','cancelled')),
  provider_message_id text,
  provider_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, case_id)
);
create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients(campaign_id, status);

create table if not exists public.public_intake_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  branch_id uuid not null references public.branches on delete cascade,
  created_by uuid not null references public.profiles,
  token_hash text not null unique,
  service_type text not null check (service_type in ('study_abroad','direct_visa')),
  label text,
  expires_at timestamptz not null,
  max_submissions integer not null default 100 check (max_submissions between 1 and 1000),
  submission_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists public_intake_links_branch_idx
  on public.public_intake_links(organisation_id, branch_id, active, expires_at desc);

create or replace function public.claim_public_intake_link(target_hash text)
returns table(id uuid, organisation_id uuid, branch_id uuid, created_by uuid, service_type text)
language sql
security definer
set search_path = public
as $$
  update public.public_intake_links link
  set submission_count = link.submission_count + 1
  where link.token_hash = target_hash
    and link.active
    and link.expires_at > now()
    and link.submission_count < link.max_submissions
  returning link.id, link.organisation_id, link.branch_id, link.created_by, link.service_type
$$;
revoke all on function public.claim_public_intake_link(text) from public, anon, authenticated;
grant execute on function public.claim_public_intake_link(text) to service_role;

alter table public.legacy_external_keys enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.sms_messages enable row level security;
alter table public.communication_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.public_intake_links enable row level security;

-- Enquiries now belong to an exact case. Keep the client fallback only for a
-- legacy row that could not be backfilled because it has no case.
drop policy if exists enquiries_read on public.enquiries;
drop policy if exists enquiries_write on public.enquiries;
create policy enquiries_read on public.enquiries
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and ((case_id is not null and public.can_access_case(case_id))
    or (case_id is null and public.can_access_client(client_id)))
);
create policy enquiries_write on public.enquiries
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id))
    or (case_id is null and public.can_modify_client(client_id)))
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id))
    or (case_id is null and public.can_modify_client(client_id)))
);

drop policy if exists legacy_external_keys_admin on public.legacy_external_keys;
create policy legacy_external_keys_admin on public.legacy_external_keys
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
) with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
);

drop policy if exists whatsapp_messages_case_read on public.whatsapp_messages;
create policy whatsapp_messages_case_read on public.whatsapp_messages
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_access_case(case_id)
);
drop policy if exists whatsapp_messages_case_write on public.whatsapp_messages;
create policy whatsapp_messages_case_write on public.whatsapp_messages
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(case_id)
) with check (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(case_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists sms_messages_case_read on public.sms_messages;
create policy sms_messages_case_read on public.sms_messages
for select to authenticated using (organisation_id = public.current_organisation_id() and public.can_access_case(case_id));
drop policy if exists sms_messages_case_write on public.sms_messages;
create policy sms_messages_case_write on public.sms_messages
for all to authenticated using (organisation_id = public.current_organisation_id() and public.can_modify_case(case_id))
with check (organisation_id = public.current_organisation_id() and public.can_modify_case(case_id) and (created_by is null or created_by = auth.uid()));

drop policy if exists communication_campaigns_scoped on public.communication_campaigns;
create policy communication_campaigns_scoped on public.communication_campaigns
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or branch_id = public.current_user_branch()
    or created_by = auth.uid()
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and created_by = auth.uid()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or branch_id = public.current_user_branch()
  )
);

drop policy if exists campaign_recipients_case_scope on public.campaign_recipients;
create policy campaign_recipients_case_scope on public.campaign_recipients
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_access_case(case_id)
) with check (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(case_id)
);

drop policy if exists public_intake_links_internal on public.public_intake_links;
create policy public_intake_links_internal on public.public_intake_links
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or branch_id = public.current_user_branch()
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and created_by = auth.uid()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or branch_id = public.current_user_branch()
  )
);

drop policy if exists commission_payments_scoped on public.commission_payments;
create policy commission_payments_scoped on public.commission_payments
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and exists (
    select 1 from public.commission_claims claim
    where claim.id = commission_payments.claim_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (
          public.current_user_level()::text in ('branch_admin','manager')
          and claim.branch_id = public.current_user_branch()
        )
      )
  )
) with check (
  organisation_id = public.current_organisation_id()
  and recorded_by = auth.uid()
  and exists (
    select 1 from public.commission_claims claim
    where claim.id = commission_payments.claim_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (
          public.current_user_level()::text in ('branch_admin','manager')
          and claim.branch_id = public.current_user_branch()
        )
      )
  )
);

drop policy if exists commission_receipts_scoped on public.commission_receipts;
create policy commission_receipts_scoped on public.commission_receipts
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and exists (
    select 1 from public.commission_payments payment
    join public.commission_claims claim on claim.id = payment.claim_id
    where payment.id = commission_receipts.payment_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (
          public.current_user_level()::text in ('branch_admin','manager')
          and claim.branch_id = public.current_user_branch()
        )
      )
  )
) with check (
  organisation_id = public.current_organisation_id()
  and issued_by = auth.uid()
  and exists (
    select 1 from public.commission_payments payment
    join public.commission_claims claim on claim.id = payment.claim_id
    where payment.id = commission_receipts.payment_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (
          public.current_user_level()::text in ('branch_admin','manager')
          and claim.branch_id = public.current_user_branch()
        )
      )
  )
);

comment on table public.legacy_external_keys is
  'Maps every stable identifier from the earlier Maximus CRM to its imported record so separate exports keep their relationships and can be safely resumed.';
comment on table public.communication_campaigns is
  'Auditable email, SMS and WhatsApp campaigns. Recipients are explicit accessible cases, never an unreviewed free-form address list.';

commit;
