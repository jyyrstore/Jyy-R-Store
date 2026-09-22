alter table activity_logs enable row level security;
drop policy if exists activity_logs_admin_read on activity_logs;
create policy activity_logs_admin_read on activity_logs for select to authenticated using (exists(select 1 from profiles p where p.id=(select auth.uid()) and p.role in ('OWNER','ADMIN','MODERATOR')));
