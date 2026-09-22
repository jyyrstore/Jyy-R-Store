alter table carts enable row level security;
alter table cart_items enable row level security;
drop policy if exists carts_self on carts;
create policy carts_self on carts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists cart_items_self on cart_items;
create policy cart_items_self on cart_items for all to authenticated using (exists(select 1 from carts c where c.id=cart_id and c.user_id=(select auth.uid()))) with check (exists(select 1 from carts c where c.id=cart_id and c.user_id=(select auth.uid())));
