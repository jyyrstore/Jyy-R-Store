create table if not exists entitlements(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict, product_id uuid not null references products(id) on delete restrict, order_id uuid not null references orders(id) on delete restrict, status text not null default 'ACTIVE' check(status in ('ACTIVE','REVOKED','EXPIRED')), granted_at timestamptz not null default now(), revoked_at timestamptz, unique(user_id,product_id,order_id)
);
