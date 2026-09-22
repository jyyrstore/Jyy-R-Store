alter table announcements enable row level security;
drop policy if exists announcements_public on announcements;
create policy announcements_public on announcements for select to anon, authenticated using (is_published=true and (publish_at is null or publish_at<=now()) and (unpublish_at is null or unpublish_at>now()));
