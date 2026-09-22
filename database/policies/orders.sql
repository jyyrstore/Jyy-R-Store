alter table orders enable row level security;
drop policy if exists orders_self on orders;
create policy orders_self on orders for select to authenticated using ((select auth.uid())=user_id);
