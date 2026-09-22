alter table messages enable row level security;
drop policy if exists messages_self on messages;
create policy messages_self on messages for select to authenticated using ((select auth.uid())=user_id);
