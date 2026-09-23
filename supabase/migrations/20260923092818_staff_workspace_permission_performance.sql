begin;
set local lock_timeout='2s';
-- Client visibility checks join cases by client; without this index each
-- staff-visible client causes another full case scan.
create index if not exists cases_client_branch_idx on public.cases(client_id,branch_id);
-- These checks have no row arguments, so evaluate once per statement.
alter policy function_access on public.clients
using ((select private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar'])))
with check ((select private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar'])));
alter policy function_access on public.enquiries
using ((select private.any_function_allowed(array['enquiries'])))
with check ((select private.any_function_allowed(array['enquiries'])));
commit;
