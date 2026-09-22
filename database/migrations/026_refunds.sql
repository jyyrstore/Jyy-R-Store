create table if not exists refunds(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete restrict, payment_id uuid references payments(id) on delete set null, user_id uuid not null references profiles(id) on delete restrict, amount bigint not null check(amount>0), reason text not null, status text not null default 'COMPLETED', created_by uuid references profiles(id) on delete set null, created_at timestamptz not null default now()
);
