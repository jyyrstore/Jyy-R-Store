do $$ begin create type order_status as enum ('PENDING','PAID','PROCESSING','COMPLETED','FAILED','CANCELLED','EXPIRED','REFUNDED'); exception when duplicate_object then null; end $$;
create table if not exists orders(
 id uuid primary key default gen_random_uuid(), order_number text not null unique, user_id uuid not null references profiles(id) on delete restrict, subtotal bigint not null default 0 check(subtotal>=0), total bigint not null default 0 check(total>=0), payment_method text, status order_status not null default 'PENDING', idempotency_key text unique, paid_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
