alter table wallets enable row level security;
drop policy if exists wallets_self on wallets;
create policy wallets_self on wallets for select to authenticated using ((select auth.uid())=user_id);
