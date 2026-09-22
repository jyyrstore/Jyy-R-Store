alter table maintenance_settings enable row level security;
drop policy if exists maintenance_public on maintenance_settings;
create policy maintenance_public on maintenance_settings for select to anon, authenticated using (true);
