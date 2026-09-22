alter table roles enable row level security;
drop policy if exists roles_authenticated_read on roles;
create policy roles_authenticated_read on roles for select to authenticated using (true);
