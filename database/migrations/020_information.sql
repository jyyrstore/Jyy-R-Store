create table if not exists announcements(
 id uuid primary key default gen_random_uuid(), type text not null check(type in ('ANNOUNCEMENT','BANNER','PROMOTION','MAINTENANCE_NOTICE','SYSTEM_NOTICE')), title text not null, body text not null, is_published boolean not null default false, publish_at timestamptz, unpublish_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
