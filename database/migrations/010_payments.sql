do $$ begin create type payment_status as enum ('PENDING','PAID','FAILED','EXPIRED','REFUNDED','CANCELLED'); exception when duplicate_object then null; end $$;
create table if not exists payments(
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id) on delete set null, user_id uuid not null references profiles(id) on delete restrict, provider text not null, reference text unique, amount bigint not null check(amount>=0), status payment_status not null default 'PENDING', raw_reference jsonb, idempotency_key text unique, expires_at timestamptz, created_at timestamptz not null default now(), paid_at timestamptz, updated_at timestamptz not null default now()
);
