create table if not exists tickets(
 id uuid primary key default gen_random_uuid(), ticket_number text not null unique, user_id uuid not null references profiles(id) on delete restrict, category text not null, subject text not null, priority text not null default 'NORMAL', status text not null default 'OPEN' check(status in ('OPEN','WAITING','REPLIED','CLOSED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz
);
