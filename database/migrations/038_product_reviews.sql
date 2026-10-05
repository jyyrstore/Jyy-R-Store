create table if not exists public.product_reviews(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  rating smallint not null
    check(rating between 1 and 5),
  comment text not null
    check(length(btrim(comment)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_product_reviews_product_user
  on public.product_reviews(product_id,user_id);

create index if not exists idx_product_reviews_product_created
  on public.product_reviews(product_id,created_at desc);

create index if not exists idx_product_reviews_user
  on public.product_reviews(user_id);
