alter table product_events enable row level security;
drop policy if exists product_events_public_select on product_events;
create policy product_events_public_select on product_events for select to authenticated using ((select auth.uid())=user_id or exists(select 1 from profiles p where p.id=(select auth.uid()) and p.role in ('OWNER','ADMIN','MODERATOR')));
