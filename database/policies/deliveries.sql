alter table entitlements enable row level security;
alter table download_logs enable row level security;
drop policy if exists entitlements_self on entitlements;
create policy entitlements_self on entitlements for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists downloads_self on download_logs;
create policy downloads_self on download_logs for select to authenticated using ((select auth.uid())=user_id);
