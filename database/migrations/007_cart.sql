create table if not exists carts(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists cart_items(
 id uuid primary key default gen_random_uuid(), cart_id uuid not null references carts(id) on delete cascade, product_id uuid not null references products(id) on delete restrict, quantity int not null default 1 check(quantity>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(cart_id,product_id)
);
