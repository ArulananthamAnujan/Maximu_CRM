begin;

-- Duplicate client records are the expensive mistake in an agency CRM: two
-- files for one person, two sets of documents, two invoices, and advice given
-- against half a history. These are the lookups the intake form runs before it
-- creates anybody.

-- Normalised forms, so "+61 400 000 111" and "0400000111" are the same number
-- and "ANNA@x.com" is the same address as "anna@x.com".
create or replace function public.normalise_contact_number(value text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 9), '')
$$;

create or replace function public.normalise_person_name(value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g'), '')
$$;

create index if not exists clients_duplicate_email_idx
  on public.clients(organisation_id, lower(email));
create index if not exists clients_duplicate_mobile_idx
  on public.clients(organisation_id, public.normalise_contact_number(mobile));
create index if not exists clients_duplicate_passport_idx
  on public.clients(organisation_id, passport_masked);

-- Returns the clients that look like the person being entered, with the reason
-- each one matched and how many cases it already has.
--
-- SECURITY INVOKER on purpose: the caller sees only the clients their row-level
-- security lets them see. A branch officer therefore cannot discover clients in
-- another branch through this, which also means a genuine duplicate outside
-- their scope will not be reported to them.
create or replace function public.find_duplicate_clients(
  p_email text default null,
  p_mobile text default null,
  p_passport_masked text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_date_of_birth date default null
)
returns table (
  id uuid,
  crm_id text,
  first_name text,
  last_name text,
  email text,
  mobile text,
  passport_masked text,
  date_of_birth date,
  current_lifecycle text,
  case_count bigint,
  match_reasons text[]
)
language sql
security invoker
set search_path = public
as $$
  with candidate as (
    select
      c.*,
      array_remove(array[
        case when p_email is not null and lower(c.email) = lower(trim(p_email))
          then 'email' end,
        case when public.normalise_contact_number(p_mobile) is not null
              and public.normalise_contact_number(c.mobile)
                  = public.normalise_contact_number(p_mobile)
          then 'mobile' end,
        case when nullif(trim(coalesce(p_passport_masked, '')), '') is not null
              and c.passport_masked = trim(p_passport_masked)
          then 'passport' end,
        case when public.normalise_person_name(p_first_name) is not null
              and public.normalise_person_name(p_last_name) is not null
              and public.normalise_person_name(c.first_name)
                  = public.normalise_person_name(p_first_name)
              and public.normalise_person_name(c.last_name)
                  = public.normalise_person_name(p_last_name)
          then 'name' end,
        case when p_date_of_birth is not null
              and c.date_of_birth = p_date_of_birth
              and public.normalise_person_name(c.last_name)
                  = public.normalise_person_name(p_last_name)
          then 'name and date of birth' end
      ], null) as reasons
    from public.clients c
    where c.archived_at is null
  )
  select
    candidate.id,
    candidate.crm_id,
    candidate.first_name,
    candidate.last_name,
    candidate.email,
    candidate.mobile,
    candidate.passport_masked,
    candidate.date_of_birth,
    candidate.current_lifecycle,
    (select count(*) from public.cases k where k.client_id = candidate.id),
    candidate.reasons
  from candidate
  where cardinality(candidate.reasons) > 0
  order by cardinality(candidate.reasons) desc, candidate.updated_at desc
  limit 10;
$$;

comment on function public.find_duplicate_clients is
  'Clients that look like the person being entered, with the reason each matched. Runs as the caller, so it reports only what that person may already see.';

commit;
