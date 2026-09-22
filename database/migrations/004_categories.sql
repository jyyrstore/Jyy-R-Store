create table if not exists categories(
 id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique, description text, is_active boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
