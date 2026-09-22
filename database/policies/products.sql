alter table products enable row level security;
drop policy if exists products_public_select on products;
create policy products_public_select on products for select to anon, authenticated using (status='PUBLISHED');
