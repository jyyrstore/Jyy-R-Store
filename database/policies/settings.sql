alter table site_settings enable row level security;
drop policy if exists site_settings_public on site_settings;
create policy site_settings_public on site_settings for select to anon, authenticated using (is_public=true);
