-- Product reviews are accessed through the Express server layer.
-- Keep RLS enabled as defense-in-depth and do not expose the table
-- directly to Supabase Data API roles.

alter table public.product_reviews enable row level security;

drop policy if exists product_reviews_public_select
  on public.product_reviews;

drop policy if exists product_reviews_self_insert
  on public.product_reviews;

drop policy if exists product_reviews_self_update
  on public.product_reviews;

drop policy if exists product_reviews_self_delete
  on public.product_reviews;

revoke all privileges
  on table public.product_reviews
  from public, anon, authenticated;
