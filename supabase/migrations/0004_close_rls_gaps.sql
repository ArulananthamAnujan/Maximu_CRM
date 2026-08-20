begin;

alter table public.organisations enable row level security;
alter table public.permissions enable row level security;
alter table public.profile_roles enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.ai_citations enable row level security;

create policy "organisation members can read organisation" on public.organisations
for select to authenticated using (id = public.current_organisation_id());
create policy "organisation administrators can update organisation" on public.organisations
for update to authenticated
using (id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'))
with check (id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'));

create policy "organisation members can read permissions" on public.permissions
for select to authenticated using (exists (select 1 from public.roles r where r.id = permissions.role_id and r.organisation_id = public.current_organisation_id()));
create policy "organisation administrators can manage permissions" on public.permissions
for all to authenticated
using (public.current_user_level()::text in ('platform_owner','super_admin') and exists (select 1 from public.roles r where r.id = permissions.role_id and r.organisation_id = public.current_organisation_id()))
with check (public.current_user_level()::text in ('platform_owner','super_admin') and exists (select 1 from public.roles r where r.id = permissions.role_id and r.organisation_id = public.current_organisation_id()));

create policy "users can read permitted profile roles" on public.profile_roles
for select to authenticated using (profile_id = auth.uid() or (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin') and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.organisation_id = public.current_organisation_id())));
create policy "administrators can manage profile roles" on public.profile_roles
for all to authenticated
using (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin') and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.organisation_id = public.current_organisation_id()))
with check (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin') and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.organisation_id = public.current_organisation_id()));

create policy "organisation members can read workflow stages" on public.workflow_stages
for select to authenticated using (exists (select 1 from public.workflow_templates wt where wt.id = workflow_stages.template_id and wt.organisation_id = public.current_organisation_id()));
create policy "administrators can manage workflow stages" on public.workflow_stages
for all to authenticated
using (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager') and exists (select 1 from public.workflow_templates wt where wt.id = workflow_stages.template_id and wt.organisation_id = public.current_organisation_id()))
with check (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager') and exists (select 1 from public.workflow_templates wt where wt.id = workflow_stages.template_id and wt.organisation_id = public.current_organisation_id()));

create policy "organisation members can access AI citations" on public.ai_citations
for all to authenticated
using (exists (select 1 from public.ai_interactions ai where ai.id = ai_citations.interaction_id and ai.organisation_id = public.current_organisation_id()))
with check (exists (select 1 from public.ai_interactions ai where ai.id = ai_citations.interaction_id and ai.organisation_id = public.current_organisation_id()));

commit;
