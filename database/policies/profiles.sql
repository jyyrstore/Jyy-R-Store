alter table profiles enable row level security;
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select to authenticated using ((select auth.uid())=id);
