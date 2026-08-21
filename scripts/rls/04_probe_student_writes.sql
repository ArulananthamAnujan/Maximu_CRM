\pset format unaligned
\pset tuples_only on
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000003';  -- student portal account
do $$
declare n integer;
begin
  begin
    update public.dependants set full_name = 'TAMPERED' where true;
    get diagnostics n = row_count;
    raise notice 'dependants rows updated by student: %', n;
  exception when others then raise notice 'dependants update blocked: %', sqlerrm;
  end;
  begin
    delete from public.case_notes where true;
    get diagnostics n = row_count;
    raise notice 'case_notes rows deleted by student: %', n;
  exception when others then raise notice 'case_notes delete blocked: %', sqlerrm;
  end;
  begin
    update public.payments set amount = 0 where true;
    get diagnostics n = row_count;
    raise notice 'payments rows updated by student: %', n;
  exception when others then raise notice 'payments update blocked: %', sqlerrm;
  end;
end $$;
