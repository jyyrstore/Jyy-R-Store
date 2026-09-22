create table if not exists product_events(
 id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade, user_id uuid references profiles(id) on delete set null, event_type text not null check(event_type in ('VIEW','CART_ADD','PURCHASE')), created_at timestamptz not null default now()
);
create table if not exists payment_events(
 id uuid primary key default gen_random_uuid(), payment_id uuid references payments(id) on delete set null, provider text not null, provider_event_id text not null unique, payload jsonb not null, processed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists idempotency_keys(
 id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete cascade, key text not null, operation text not null, response_json jsonb, created_at timestamptz not null default now(), unique(user_id,key,operation)
);
create index if not exists idx_product_events on product_events(product_id,event_type,created_at);
