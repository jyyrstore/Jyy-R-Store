alter table payments enable row level security;
drop policy if exists payments_self on payments;
create policy payments_self on payments for select to authenticated using ((select auth.uid())=user_id);
