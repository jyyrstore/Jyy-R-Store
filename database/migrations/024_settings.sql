create table if not exists site_settings(
 key text primary key, category text not null, value_json jsonb not null default '{}'::jsonb, is_public boolean not null default false, updated_at timestamptz not null default now()
);
