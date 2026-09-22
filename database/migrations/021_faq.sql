create table if not exists faqs(
 id uuid primary key default gen_random_uuid(), category text not null, question text not null, answer text not null, is_published boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
