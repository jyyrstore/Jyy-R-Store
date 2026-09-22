alter table wallet_transactions enable row level security;
drop policy if exists wallet_tx_self on wallet_transactions;
create policy wallet_tx_self on wallet_transactions for select to authenticated using ((select auth.uid())=user_id);
