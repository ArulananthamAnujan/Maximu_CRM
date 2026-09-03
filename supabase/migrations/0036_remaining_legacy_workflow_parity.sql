begin;

-- The legacy task register showed who raised and completed work, its type,
-- description and the last update. Keep that operational evidence as proper
-- fields instead of hiding it in a title or relying only on the audit log.
alter table public.tasks
  add column if not exists task_type text not null default 'case_work',
  add column if not exists completed_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz not null default now();

-- The invoice screen must preserve the commercial details present in the
-- previous CRM. invoice_type remains the service category; these columns hold
-- the commercial adjustment and payment context.
alter table public.invoices
  add column if not exists discount numeric(14,2) not null default 0
    check (discount >= 0),
  add column if not exists payment_method text,
  add column if not exists description text;

comment on column public.tasks.completed_by is
  'Staff member who actually completed the task. Case access remains branch-wide.';
comment on column public.invoices.discount is
  'Discount deducted from subtotal before tax is added.';

commit;
