alter table deposits enable row level security;
drop policy if exists deposits_self on deposits;
create policy deposits_self on deposits for select to authenticated using ((select auth.uid())=user_id);
