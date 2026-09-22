alter table order_items enable row level security;
drop policy if exists order_items_self on order_items;
create policy order_items_self on order_items for select to authenticated using (exists(select 1 from orders o where o.id=order_id and o.user_id=(select auth.uid())));
