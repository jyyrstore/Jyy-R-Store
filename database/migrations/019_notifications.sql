create table if not exists notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, type text not null check(type in ('ORDER','PAYMENT','DEPOSIT','TICKET','SYSTEM','PROMOTION')), title text not null, body text not null, link text, is_read boolean not null default false, created_at timestamptz not null default now(), read_at timestamptz
);
create table if not exists notification_preferences(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles(id) on delete cascade, email_enabled boolean not null default true, order_enabled boolean not null default true, payment_enabled boolean not null default true, deposit_enabled boolean not null default true, ticket_enabled boolean not null default true, promotion_enabled boolean not null default true, system_enabled boolean not null default true, updated_at timestamptz not null default now()
);
