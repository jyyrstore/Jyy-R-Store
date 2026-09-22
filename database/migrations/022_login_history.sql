create table if not exists login_history(
 id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null, device text, browser text, masked_ip text, status text not null check(status in ('SUCCESS','FAILED')), created_at timestamptz not null default now()
);
