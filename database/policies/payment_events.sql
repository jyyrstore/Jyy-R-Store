alter table payment_events enable row level security;
drop policy if exists payment_events_owner on payment_events;
create policy payment_events_owner on payment_events for select to authenticated using (exists(select 1 from profiles p where p.id=(select auth.uid()) and p.role in ('OWNER','ADMIN','MODERATOR')));
