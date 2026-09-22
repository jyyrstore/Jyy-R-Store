alter table notifications enable row level security;
drop policy if exists notifications_self on notifications;
create policy notifications_self on notifications for select to authenticated using (user_id is null or user_id=(select auth.uid()));
drop policy if exists notifications_update_self on notifications;
create policy notifications_update_self on notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
