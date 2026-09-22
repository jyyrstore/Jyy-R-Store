create table if not exists deposits(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict, payment_id uuid references payments(id) on delete set null, amount bigint not null check(amount>0), provider text, reference text unique, status text not null default 'PENDING' check(status in ('PENDING','SUCCESS','FAILED','EXPIRED','REFUNDED')), webhook_status text, idempotency_key text unique, expires_at timestamptz, created_at timestamptz not null default now(), paid_at timestamptz, updated_at timestamptz not null default now()
);
