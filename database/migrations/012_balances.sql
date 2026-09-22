create table if not exists wallets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles(id) on delete cascade, balance bigint not null default 0 check(balance>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
