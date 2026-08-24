begin;

-- Sign-in has no throttling at all today: a password can be guessed at
-- whatever rate a script cares to try. login_attempts and the two functions
-- below slow that down, keyed by normalised email or client IP so an
-- attacker gains nothing by rotating which they hammer.
--
-- This has to be usable before a session exists -- the whole point is
-- guarding the sign-in attempt itself -- so it is called with the anon key,
-- never a user's access token. The functions are security definer and the
-- table carries no policy at all: every access goes through them, never
-- through a direct table request.

create table public.login_attempts (
  identifier text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
comment on table public.login_attempts is
  'Failed sign-in attempts, keyed by normalised email or client IP. Read and written only through login_lock_status and record_login_attempt.';

alter table public.login_attempts enable row level security;

create or replace function public.login_lock_status(p_identifier text)
returns table(locked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.login_attempts;
begin
  select * into row_data from public.login_attempts where identifier = lower(p_identifier);
  if row_data.locked_until is not null and row_data.locked_until > now() then
    return query select true, greatest(1, ceil(extract(epoch from (row_data.locked_until - now())))::int);
  else
    return query select false, 0;
  end if;
end;
$$;

create or replace function public.record_login_attempt(p_identifier text, p_success boolean)
returns table(locked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  window_minutes constant int := 15;
  max_attempts constant int := 8;
  lock_minutes constant int := 15;
  row_data public.login_attempts;
  norm text := lower(p_identifier);
begin
  if p_success then
    delete from public.login_attempts where identifier = norm;
    return query select false, 0;
    return;
  end if;

  select * into row_data from public.login_attempts where identifier = norm for update;

  if row_data.identifier is null then
    insert into public.login_attempts(identifier, attempts, window_started_at)
      values (norm, 1, now());
    return query select false, 0;
    return;
  end if;

  if row_data.locked_until is not null and row_data.locked_until > now() then
    update public.login_attempts set attempts = attempts + 1 where identifier = norm;
    return query select true, greatest(1, ceil(extract(epoch from (row_data.locked_until - now())))::int);
    return;
  end if;

  if row_data.window_started_at < now() - (window_minutes || ' minutes')::interval then
    update public.login_attempts
      set attempts = 1, window_started_at = now(), locked_until = null
      where identifier = norm;
    return query select false, 0;
    return;
  end if;

  if row_data.attempts + 1 >= max_attempts then
    update public.login_attempts
      set attempts = attempts + 1, locked_until = now() + (lock_minutes || ' minutes')::interval
      where identifier = norm;
    return query select true, lock_minutes * 60;
  else
    update public.login_attempts set attempts = attempts + 1 where identifier = norm;
    return query select false, 0;
  end if;
end;
$$;

comment on function public.login_lock_status(text) is
  'Read-only: whether this identifier (email or IP) is locked out of signing in right now, and for how much longer.';
comment on function public.record_login_attempt(text, boolean) is
  'Records one sign-in outcome and returns the resulting lock state. A success clears the identifier; too many recent failures locks it for a cooldown.';

grant execute on function public.login_lock_status(text) to anon, authenticated;
grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated;

commit;
