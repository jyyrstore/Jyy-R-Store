create table if not exists order_items(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, product_id uuid not null references products(id) on delete restrict, product_name text not null, unit_price bigint not null check(unit_price>=0), quantity int not null check(quantity>0), line_total bigint not null check(line_total>=0)
);
