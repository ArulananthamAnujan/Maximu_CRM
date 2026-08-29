begin;

create unique index if not exists email_messages_provider_message_unique
  on public.email_messages (organisation_id, provider_message_id)
  where provider_message_id is not null;

comment on index public.email_messages_provider_message_unique is
  'Prevents a Gmail message being imported more than once during case inbox synchronisation.';

commit;
