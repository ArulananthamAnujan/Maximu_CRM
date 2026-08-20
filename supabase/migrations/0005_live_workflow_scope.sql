begin;

create or replace function public.is_internal_user()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager','staff','partner'), false) $$;

drop policy if exists tenant_isolation on public.profiles;
create policy profiles_visible_to_self_or_internal on public.profiles for select to authenticated
using (id = auth.uid() or (organisation_id = public.current_organisation_id() and public.is_internal_user()));
create policy profiles_admin_write on public.profiles for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));

drop policy if exists tenant_isolation on public.branches;
create policy branches_internal_read on public.branches for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy branches_admin_write on public.branches for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));

drop policy if exists tenant_isolation on public.roles;
create policy roles_internal_read on public.roles for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy roles_superadmin_write on public.roles for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'));

drop policy if exists tenant_isolation on public.tasks;
create policy tasks_scoped_select on public.tasks for select to authenticated using (
  organisation_id = public.current_organisation_id() and (
    (public.current_user_level()::text = 'student' and (client_id = public.current_client_id() or exists (select 1 from public.cases c where c.id = tasks.case_id and c.client_id = public.current_client_id())))
    or (public.is_internal_user() and (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager') or assigned_to = auth.uid() or client_id is null or public.can_access_client(client_id)))
  )
);
create policy tasks_internal_write on public.tasks for all to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user() and (assigned_to = auth.uid() or public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')))
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

drop policy if exists "organisation isolation" on public.appointments;
create policy appointments_scoped_select on public.appointments for select to authenticated using (
  organisation_id = public.current_organisation_id() and (
    (public.current_user_level()::text = 'student' and exists (select 1 from public.cases c where c.id = appointments.case_id and c.client_id = public.current_client_id()))
    or (public.is_internal_user() and (owner_id = auth.uid() or public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager') or exists (select 1 from public.cases c where c.id = appointments.case_id and public.can_access_client(c.client_id))))
  )
);
create policy appointments_internal_write on public.appointments for all to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user())
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

drop policy if exists tenant_isolation on public.email_threads;
create policy email_threads_scoped_select on public.email_threads for select to authenticated
using (organisation_id = public.current_organisation_id() and (client_id = public.current_client_id() or (public.is_internal_user() and (client_id is null or public.can_access_client(client_id)))));
create policy email_threads_scoped_insert on public.email_threads for insert to authenticated
with check (organisation_id = public.current_organisation_id() and ((public.current_user_level()::text = 'student' and client_id = public.current_client_id()) or (public.is_internal_user() and (client_id is null or public.can_access_client(client_id)))));
create policy email_threads_internal_update on public.email_threads for update to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user() and (client_id is null or public.can_access_client(client_id)))
with check (organisation_id = public.current_organisation_id() and public.is_internal_user() and (client_id is null or public.can_access_client(client_id)));

drop policy if exists tenant_isolation on public.email_messages;
create policy email_messages_scoped_select on public.email_messages for select to authenticated
using (organisation_id = public.current_organisation_id() and exists (select 1 from public.email_threads t where t.id = email_messages.thread_id and (t.client_id = public.current_client_id() or (public.is_internal_user() and (t.client_id is null or public.can_access_client(t.client_id))))));
create policy email_messages_scoped_insert on public.email_messages for insert to authenticated
with check (organisation_id = public.current_organisation_id() and created_by = auth.uid() and exists (select 1 from public.email_threads t where t.id = email_messages.thread_id and (t.client_id = public.current_client_id() or (public.is_internal_user() and (t.client_id is null or public.can_access_client(t.client_id))))));
create policy email_messages_internal_update on public.email_messages for update to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user() and exists (select 1 from public.email_threads t where t.id = email_messages.thread_id and (t.client_id is null or public.can_access_client(t.client_id))))
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

drop policy if exists tenant_isolation on public.invoices;
create policy invoices_scoped_select on public.invoices for select to authenticated
using (organisation_id = public.current_organisation_id() and (client_id = public.current_client_id() or (public.is_internal_user() and (client_id is null or public.can_access_client(client_id)))));
create policy invoices_finance_write on public.invoices for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

drop policy if exists "organisation isolation" on public.content_templates;
create policy templates_internal_read on public.content_templates for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy templates_admin_write on public.content_templates for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

drop policy if exists tenant_isolation on public.workflow_templates;
create policy workflow_templates_internal_read on public.workflow_templates for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy workflow_templates_admin_write on public.workflow_templates for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

drop policy if exists tenant_isolation on public.audit_events;
create policy audit_admin_read on public.audit_events for select to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));
create policy audit_internal_insert on public.audit_events for insert to authenticated
with check (organisation_id = public.current_organisation_id() and actor_id = auth.uid() and public.is_internal_user());

commit;
