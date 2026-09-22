alter table tickets enable row level security;
alter table ticket_messages enable row level security;
drop policy if exists tickets_self on tickets;
create policy tickets_self on tickets for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists tickets_insert_self on tickets;
drop policy if exists ticket_messages_self on ticket_messages;
create policy ticket_messages_self on ticket_messages for select to authenticated using (exists(select 1 from tickets t where t.id=ticket_id and t.user_id=(select auth.uid())));
