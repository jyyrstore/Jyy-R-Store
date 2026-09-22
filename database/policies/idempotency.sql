alter table idempotency_keys enable row level security;
drop policy if exists idempotency_self on idempotency_keys;
create policy idempotency_self on idempotency_keys for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
