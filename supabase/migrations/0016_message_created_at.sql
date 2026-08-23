begin;

-- email_messages had no creation timestamp, only sent_at, which is null for a
-- draft. The interface was showing "Invalid Date" for every draft because
-- there was no date to show. Existing rows take their sent date where there is
-- one; the rest are stamped at migration time, which is the earliest honest
-- answer available for a row that never recorded when it was written.
alter table public.email_messages
  add column if not exists created_at timestamptz not null default now();

update public.email_messages
  set created_at = sent_at
  where sent_at is not null and created_at > sent_at;

create index if not exists email_messages_thread_created_idx
  on public.email_messages(thread_id, created_at desc);

comment on column public.email_messages.created_at is
  'When the message was written. sent_at stays null until it actually goes out.';

commit;
