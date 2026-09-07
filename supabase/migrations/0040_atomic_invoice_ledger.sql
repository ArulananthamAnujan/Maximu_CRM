begin;

-- One request owns one durable result. The caller retains this ID when retrying.
create table public.finance_requests (
  organisation_id uuid not null references public.organisations,
  actor_id uuid not null references public.profiles,
  request_id uuid not null,
  invoice_id uuid not null references public.invoices,
  request_body jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organisation_id, actor_id, request_id)
);
alter table public.finance_requests enable row level security;
create policy finance_requests_own on public.finance_requests for all to authenticated
  using (organisation_id = public.current_organisation_id() and actor_id = auth.uid() and public.is_internal_user())
  with check (organisation_id = public.current_organisation_id() and actor_id = auth.uid() and public.is_internal_user());
grant select, insert on public.finance_requests to authenticated;

create or replace function public.invoice_ledger_action(
  p_invoice uuid, p_action text, p_amount numeric, p_currency text,
  p_method text, p_reference text, p_external_reference text, p_request uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices%rowtype;
  prior public.finance_requests%rowtype;
  org uuid := public.current_organisation_id();
  actor uuid := auth.uid();
  request_body jsonb;
  result jsonb;
  credited numeric;
  amount numeric := p_amount;
  new_paid numeric;
  entry_id uuid := gen_random_uuid();
  receipt_id uuid := gen_random_uuid();
  receipt_number text;
  credit_number text;
begin
  if not coalesce(public.is_internal_user(), false) or actor is null or p_request is null then
    raise exception using errcode = '42501', message = 'Staff access and a request ID are required.';
  end if;
  if p_action is null or p_action not in ('payment','refund','credit','settle','void') then
    raise exception using errcode = '22023', message = 'Unsupported invoice operation.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text || actor::text || p_request::text, 0));
  -- The invoice lock serialises balance checks across different requests/staff.
  select * into inv from public.invoices where id = p_invoice and organisation_id = org for update;
  if not found or not coalesce(case when inv.case_id is not null then public.can_modify_case(inv.case_id)
    else public.can_modify_client(inv.client_id) end, false) then
    raise exception using errcode = '42501', message = 'This invoice is not available to you.';
  end if;
  request_body := jsonb_build_object('invoice',p_invoice,'action',p_action,'amount',p_amount,
    'currency',p_currency,'method',p_method,'reference',p_reference,'externalReference',p_external_reference);
  select * into prior from public.finance_requests where organisation_id = org and actor_id = actor and request_id = p_request;
  if found then
    if prior.request_body <> request_body then
      raise exception using errcode = '22023', message = 'This request ID was already used with different details.';
    end if;
    return prior.response || jsonb_build_object('replayed',true);
  end if;
  if p_currency is not null and upper(p_currency) <> upper(inv.currency) then
    raise exception using errcode = '22023', message = 'Transaction currency must match the invoice currency.';
  end if;
  select coalesce(sum(cn.amount),0) into credited from public.credit_notes cn where cn.invoice_id = inv.id and cn.voided_at is null;
  if p_action = 'settle' then amount := greatest(0, inv.total - inv.paid - credited); end if;
  if p_action = 'void' then
    if inv.paid > 0 then raise exception using errcode = '22023', message = 'Refund payments before voiding this invoice.'; end if;
    update public.invoices set state = 'void' where id = inv.id;
    result := jsonb_build_object('ok',true,'invoiceId',inv.id,'paid',inv.paid);
  elsif p_action = 'settle' and amount = 0 and inv.state = 'paid' then
    result := jsonb_build_object('ok',true,'invoiceId',inv.id,'paid',inv.paid);
  else
    if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount <= 0 or amount <> round(amount,2) then
      raise exception using errcode = '22023', message = 'Amount must be positive with at most two decimal places.';
    end if;
    if inv.state in ('void','refunded') then
      raise exception using errcode = '22023', message = 'This invoice is voided or refunded.';
    end if;
    if p_action = 'refund' then
      if amount > inv.paid then raise exception using errcode = '22023', message = 'Refund cannot exceed payments received.'; end if;
    elsif amount > greatest(0, inv.total - inv.paid - credited) then
      raise exception using errcode = '22023', message = 'Amount exceeds the outstanding balance after credit notes.';
    end if;
    if p_action = 'credit' then
      credit_number := 'CN-' || extract(year from now())::text || '-' || upper(substr(entry_id::text,1,8));
      insert into public.credit_notes(id,organisation_id,invoice_id,amount,reason,issued_by,credit_note_number)
        values(entry_id,org,inv.id,amount,p_reference,actor,credit_number);
      new_paid := inv.paid;
      credited := credited + amount;
      result := jsonb_build_object('ok',true,'creditId',entry_id,'creditNoteNumber',credit_number,'paid',new_paid);
    else
      new_paid := inv.paid + case when p_action = 'refund' then -amount else amount end;
      insert into public.payments(id,organisation_id,invoice_id,amount,currency,method,reference,external_reference,transaction_type,recorded_by)
        values(entry_id,org,inv.id,case when p_action = 'refund' then -amount else amount end,inv.currency,p_method,p_reference,p_external_reference,
          case when p_action = 'refund' then 'refund' else 'payment' end,actor);
      if p_action = 'refund' then
        result := jsonb_build_object('ok',true,'refundId',entry_id,'paid',new_paid);
      else
        receipt_number := 'RCT-' || extract(year from now())::text || '-' || upper(substr(receipt_id::text,1,8));
        insert into public.payment_receipts(id,organisation_id,payment_id,receipt_number,issued_by)
          values(receipt_id,org,entry_id,receipt_number,actor);
        result := jsonb_build_object('ok',true,'paymentId',entry_id,'receiptId',receipt_id,'receiptNumber',receipt_number,'paid',new_paid);
      end if;
    end if;
    update public.invoices set paid = new_paid, state = case
      when p_action = 'refund' and new_paid = 0 then 'refunded'::public.invoice_state
      when new_paid + credited >= inv.total then 'paid'::public.invoice_state
      when new_paid > 0 then 'part_paid'::public.invoice_state
      else 'issued'::public.invoice_state end where id = inv.id;
  end if;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,after_data)
    values(org,actor,'invoice.' || p_action,'invoice',inv.id,inv.case_id,'Recorded invoice ' || p_action,
      result || jsonb_build_object('amount',amount,'requestId',p_request));
  insert into public.finance_requests(organisation_id,actor_id,request_id,invoice_id,request_body,response)
    values(org,actor,p_request,inv.id,request_body,result);
  return result;
end;
$$;
revoke all on function public.invoice_ledger_action(uuid,text,numeric,text,text,text,text,uuid) from public;
grant execute on function public.invoice_ledger_action(uuid,text,numeric,text,text,text,text,uuid) to authenticated;

-- Invoice, initial payment, receipt, document slot and audit commit together.
create or replace function public.create_case_invoice(p_request uuid, p_case uuid, p_values jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  org uuid := public.current_organisation_id();
  actor uuid := auth.uid();
  case_row public.cases%rowtype;
  prior public.finance_requests%rowtype;
  request_body jsonb := jsonb_build_object('action','create','caseId',p_case,'values',p_values);
  result jsonb;
  invoice_id uuid := p_request;
  doc_id uuid := gen_random_uuid();
  invoice_number text := 'INV-' || extract(year from now())::text || '-' || upper(substr(p_request::text,1,8));
  subtotal numeric := (p_values->>'subtotal')::numeric;
  discount numeric := coalesce((p_values->>'discount')::numeric,0);
  tax numeric := coalesce((p_values->>'tax')::numeric,0);
  initial_paid numeric := coalesce((p_values->>'initialPaid')::numeric,0);
  total numeric;
  currency text := upper(coalesce(p_values->>'currency','AUD'));
begin
  if p_request is null or not coalesce(public.is_internal_user(),false) or not coalesce(public.can_modify_case(p_case),false) then
    raise exception using errcode = '42501', message = 'This case is not available to you.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text || actor::text || p_request::text,0));
  select * into case_row from public.cases where id=p_case and organisation_id=org;
  if not found then raise exception using errcode='42501', message='This case is not available to you.'; end if;
  select * into prior from public.finance_requests where organisation_id=org and actor_id=actor and request_id=p_request;
  if found then
    if prior.request_body <> request_body then raise exception using errcode='22023', message='This request ID was already used with different details.'; end if;
    return prior.response || jsonb_build_object('replayed',true);
  end if;
  total := subtotal-discount+tax;
  if subtotal is null or subtotal::text in ('NaN','Infinity','-Infinity') or subtotal <= 0
    or discount < 0 or discount > subtotal or tax < 0 or total::text in ('NaN','Infinity','-Infinity')
    or initial_paid::text in ('NaN','Infinity','-Infinity') or initial_paid < 0 or initial_paid > total
    or subtotal <> round(subtotal,2) or discount <> round(discount,2) or tax <> round(tax,2) or initial_paid <> round(initial_paid,2) then
    raise exception using errcode='22023', message='Invoice amounts are invalid.';
  end if;
  insert into public.invoices(id,organisation_id,client_id,case_id,invoice_number,invoice_type,currency,subtotal,discount,tax,total,paid,state,issued_on,due_on,payment_method,description,created_by)
    values(invoice_id,org,case_row.client_id,p_case,invoice_number,p_values->>'invoiceType',currency,subtotal,discount,tax,total,0,
      case when total=0 then 'paid'::public.invoice_state else 'issued'::public.invoice_state end,
      (p_values->>'issuedOn')::date,nullif(p_values->>'due','')::date,p_values->>'paymentMethod',p_values->>'description',actor);
  if initial_paid > 0 then
    perform public.invoice_ledger_action(invoice_id,'payment',initial_paid,currency,p_values->>'paymentMethod',p_values->>'paymentReference',null,gen_random_uuid());
  end if;
  insert into public.documents(id,organisation_id,client_id,case_id,document_type,display_name,state,requested_by,metadata)
    values(doc_id,org,case_row.client_id,p_case,'10 Accounts and Receipts',invoice_number || '.pdf','requested',actor,
      jsonb_build_object('source','invoice_pdf','invoice_id',invoice_id,'invoice_number',invoice_number,'client_visible',false));
  result := jsonb_build_object('ok',true,'invoiceId',invoice_id,'invoiceNumber',invoice_number,'documentId',doc_id);
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,after_data)
    values(org,actor,'invoice.created','invoice',invoice_id,p_case,'Created ' || invoice_number,result);
  insert into public.finance_requests(organisation_id,actor_id,request_id,invoice_id,request_body,response)
    values(org,actor,p_request,invoice_id,request_body,result);
  return result;
end;
$$;
revoke all on function public.create_case_invoice(uuid,uuid,jsonb) from public;
grant execute on function public.create_case_invoice(uuid,uuid,jsonb) to authenticated;

create or replace function public.reconcile_invoice_payments(p_run uuid, p_payments jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  run public.reconciliation_runs%rowtype;
  entry public.payments%rowtype;
  selected uuid[];
  found_count integer := 0;
  matched numeric;
  balanced boolean;
begin
  if not coalesce(public.is_internal_user(),false) or public.current_user_level()::text in ('staff','student') then
    raise exception using errcode='42501', message='Only administrators can reconcile payments.';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) not between 1 and 500 then
    raise exception using errcode='22023', message='Select between 1 and 500 payments.';
  end if;
  select array_agg(distinct value::uuid) into selected from jsonb_array_elements_text(p_payments);
  select * into run from public.reconciliation_runs where id=p_run and organisation_id=public.current_organisation_id() for update;
  if not found then raise exception using errcode='42501', message='This reconciliation is not available to you.'; end if;
  for entry in select * from public.payments where id=any(selected) and organisation_id=run.organisation_id order by id for update loop
    found_count := found_count + 1;
    if upper(entry.currency) <> upper(run.currency) then
      raise exception using errcode='22023', message='Payment currencies must match the statement currency.';
    end if;
    if entry.reconciliation_id is not null and entry.reconciliation_id <> p_run then
      raise exception using errcode='22023', message='A selected payment already belongs to another reconciliation.';
    end if;
  end loop;
  if found_count <> cardinality(selected) then
    raise exception using errcode='42501', message='One or more selected payments are not available to you.';
  end if;
  update public.payments set reconciliation_id=p_run,reconciled_at=coalesce(reconciled_at,now()) where id=any(selected);
  select coalesce(sum(amount),0) into matched from public.payments where reconciliation_id=p_run;
  balanced := matched=run.statement_total;
  update public.reconciliation_runs set matched_total=matched,status=case when balanced then 'balanced' else 'exception' end,completed_at=now() where id=p_run;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
    values(run.organisation_id,auth.uid(),'finance.reconciled','reconciliation',p_run,'Matched statement payments',jsonb_build_object('matched',matched,'balanced',balanced));
  return jsonb_build_object('ok',true,'matchedTotal',matched,'balanced',balanced);
end;
$$;
revoke all on function public.reconcile_invoice_payments(uuid,jsonb) from public;
grant execute on function public.reconcile_invoice_payments(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
