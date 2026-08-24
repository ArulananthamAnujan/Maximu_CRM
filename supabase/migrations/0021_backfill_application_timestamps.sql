begin;

-- education_applications.status could be set to "submitted" (or later) without
-- submitted_at being stamped alongside it: application_create only started
-- doing that in 0019/0020's application code, and application_update only
-- stamps it on a transition it sees happen, not on a status a row already
-- held before that code ran. A record created that way looks, correctly, like
-- it was submitted -- but reporting that reads submitted_at alone would never
-- count it. Reporting no longer depends on this column alone (see
-- app/api/crm/reports/route.ts), but the column itself is worth having right:
-- other places read it directly (deadlines, the case file), and a status
-- change that has already happened deserves the date it actually happened
-- recorded, not just a workaround in one query.
--
-- The table has no created_at/updated_at to recover the real date from, so
-- this stamps now() -- an approximation, not a fabricated history, and one
-- only ever applied to a null column that a real status change left behind.
update public.education_applications
  set submitted_at = coalesce(submitted_at, now())
  where status in ('submitted','offer_received','offer_accepted','coe_received','deferred','withdrawn','rejected')
    and submitted_at is null;

update public.education_applications
  set offer_received_at = coalesce(offer_received_at, now())
  where status in ('offer_received','offer_accepted','coe_received')
    and offer_received_at is null;

update public.education_applications
  set coe_received_at = coalesce(coe_received_at, now())
  where status = 'coe_received'
    and coe_received_at is null;

commit;
