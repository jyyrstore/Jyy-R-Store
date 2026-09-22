alter table login_history enable row level security;
drop policy if exists login_history_self on login_history;
create policy login_history_self on login_history for select to authenticated using ((select auth.uid())=user_id);
