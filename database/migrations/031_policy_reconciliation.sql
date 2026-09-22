-- JYY'R STORE policy reconciliation.
-- This migration restores the policy intent already present in database/policies/.
-- No broad ALL policies are introduced.

alter table if exists public.refunds enable row level security;
alter table if exists public.roles enable row level security;
alter table if exists public.services enable row level security;
alter table if exists public.service_orders enable row level security;
alter table if exists public.site_settings enable row level security;
alter table if exists public.tickets enable row level security;
alter table if exists public.ticket_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='refunds' and policyname='refunds_self') then
    create policy refunds_self on public.refunds
      for select to authenticated
      using ((select auth.uid())=user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='roles' and policyname='roles_authenticated_select') then
    create policy roles_authenticated_select on public.roles
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='services' and policyname='services_public_select') then
    create policy services_public_select on public.services
      for select to anon, authenticated
      using (is_active=true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_orders' and policyname='service_orders_self') then
    create policy service_orders_self on public.service_orders
      for select to authenticated
      using ((select auth.uid())=user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='site_settings' and policyname='site_settings_public_select') then
    create policy site_settings_public_select on public.site_settings
      for select to anon, authenticated
      using (is_public=true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tickets' and policyname='tickets_self') then
    create policy tickets_self on public.tickets
      for select to authenticated
      using ((select auth.uid())=user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ticket_messages' and policyname='ticket_messages_self') then
    create policy ticket_messages_self on public.ticket_messages
      for select to authenticated
      using (
        exists (
          select 1 from public.tickets t
          where t.id=ticket_id
            and t.user_id=(select auth.uid())
        )
      );
  end if;
end
$$;

drop policy if exists user_upload_owner_select on storage.objects;
create policy user_upload_owner_select on storage.objects
  for select to authenticated
  using (bucket_id='user-uploads' and owner_id=(select auth.uid()::text));

drop policy if exists user_upload_owner_insert on storage.objects;
create policy user_upload_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id='user-uploads' and owner_id=(select auth.uid()::text));

drop policy if exists user_upload_owner_update on storage.objects;
create policy user_upload_owner_update on storage.objects
  for update to authenticated
  using (bucket_id='user-uploads' and owner_id=(select auth.uid()::text))
  with check (bucket_id='user-uploads' and owner_id=(select auth.uid()::text));

drop policy if exists user_upload_owner_delete on storage.objects;
create policy user_upload_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id='user-uploads' and owner_id=(select auth.uid()::text));

insert into public.policy_migrations(name)
select x.name
from (values
  ('refunds.sql'),
  ('roles.sql'),
  ('services.sql'),
  ('settings.sql'),
  ('storage.sql'),
  ('tickets.sql')
) x(name)
where not exists (
  select 1 from public.policy_migrations pm where pm.name=x.name
);
