begin;

-- The wording sent for the three system emails this CRM now triggers on its
-- own: a document requested, an invoice raised, and a new portal login.
-- Editable masters data, same shape as document_checklist_templates -- any
-- internal user reads it, only a manager or administrator changes it. One
-- row per kind per organisation; the kind decides when it is used, not its
-- name, so it cannot be renamed into irrelevance.

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  kind text not null check (kind in ('document_request', 'invoice_request', 'portal_welcome')),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (organisation_id, kind)
);

alter table public.email_templates enable row level security;

create policy email_templates_internal_read on public.email_templates
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy email_templates_admin_write on public.email_templates
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

comment on table public.email_templates is
  'Wording for the emails this CRM sends a client on its own: a document request, an invoice, a new portal login. Masters data, same access shape as institutions, courses and the document checklist.';

create or replace function public.seed_default_email_templates(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_templates (organisation_id, kind, subject, body)
  values
    (target_organisation, 'document_request',
     'A document has been requested from you',
     E'Hi {{client_name}},\n\nWe need the following from you: {{document_title}}\n\n{{note}}\n\nYou can send it through your Maximus portal: {{portal_link}}\n\nThanks,\n{{sender_name}}'),
    (target_organisation, 'invoice_request',
     'An invoice has been raised for your file',
     E'Hi {{client_name}},\n\nAn invoice for {{amount}} has been raised on your file{{due_clause}}.\n\nYou can view it in your Maximus portal: {{portal_link}}\n\nThanks,\n{{sender_name}}'),
    (target_organisation, 'portal_welcome',
     'Your Maximus portal access is ready',
     E'Hi {{client_name}},\n\nYour case team has set up your Maximus client portal. Sign in with:\n\nUsername: {{email}}\n\nSet your password here: {{setup_link}}\n\nOnce signed in you can see your case progress, documents and invoices.\n\nThanks,\n{{sender_name}}')
  on conflict (organisation_id, kind) do nothing;
end;
$$;

create or replace function public.seed_email_templates_after_organisation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_email_templates(new.id);
  return new;
end;
$$;

drop trigger if exists seed_email_templates_after_organisation_insert on public.organisations;
create trigger seed_email_templates_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_email_templates_after_organisation_insert();

do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_default_email_templates(organisation_row.id);
  end loop;
end $$;

commit;
