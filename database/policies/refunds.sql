alter table refunds enable row level security;
drop policy if exists refunds_self on refunds;
create policy refunds_self on refunds for select to authenticated using ((select auth.uid())=user_id);
