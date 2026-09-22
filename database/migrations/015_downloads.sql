create table if not exists download_logs(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict, content_id uuid not null references product_contents(id) on delete restrict, order_id uuid references orders(id) on delete set null, ip text, user_agent text, created_at timestamptz not null default now()
);
