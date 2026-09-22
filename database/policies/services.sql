alter table services enable row level security;
drop policy if exists services_public on services;
create policy services_public on services for select to anon, authenticated using (is_active=true);

alter table service_orders enable row level security;

create policy service_orders_self on service_orders for select to authenticated using ((select auth.uid())=user_id);
