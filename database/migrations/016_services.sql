create table if not exists services(
 id uuid primary key default gen_random_uuid(), category text, name text not null, price bigint not null default 0 check(price>=0), description text, requirements jsonb not null default '{}'::jsonb, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists service_orders(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict, service_id uuid not null references services(id) on delete restrict, order_id uuid references orders(id) on delete set null, request_data jsonb not null default '{}'::jsonb, status text not null default 'PENDING', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
