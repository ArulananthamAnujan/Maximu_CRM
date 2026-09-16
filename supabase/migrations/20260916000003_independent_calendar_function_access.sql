-- Personal Calendar and Gmail connections follow their respective function.
alter policy function_access on public.mailbox_connections
 using(private.function_allowed(case when provider='google_calendar' then 'calendar' else 'communications' end))
 with check(private.function_allowed(case when provider='google_calendar' then 'calendar' else 'communications' end));
create function private.guard_connection_function() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and public.current_user_level() is not null then
   if tg_op<>'INSERT' and not private.function_allowed(case when old.provider='google_calendar' then 'calendar' else 'communications' end) then
     raise exception 'This connection function is disabled for your account' using errcode='42501'; end if;
   if tg_op<>'DELETE' and not private.function_allowed(case when new.provider='google_calendar' then 'calendar' else 'communications' end) then
     raise exception 'This connection function is disabled for your account' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function private.guard_connection_function() from public,anon;
drop trigger function_access_write on public.mailbox_connections;
create trigger function_access_write before insert or update or delete on public.mailbox_connections for each row execute function private.guard_connection_function();
