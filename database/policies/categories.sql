alter table categories enable row level security;
drop policy if exists categories_public_select on categories;
create policy categories_public_select on categories for select to anon, authenticated using (is_active=true);
