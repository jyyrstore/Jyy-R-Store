create table if not exists ticket_messages(
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references tickets(id) on delete cascade, sender_id uuid not null references profiles(id) on delete restrict, body text not null, attachment_path text, created_at timestamptz not null default now()
);
create table if not exists messages(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict, sender_id uuid not null references profiles(id) on delete restrict, body text not null, status text not null default 'SENT', created_at timestamptz not null default now()
);
