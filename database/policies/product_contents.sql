alter table product_contents enable row level security;
drop policy if exists product_contents_preview on product_contents;
create policy product_contents_preview on product_contents for select to anon, authenticated using (access_type in ('PUBLIC','PREVIEW') and exists(select 1 from products p where p.id=product_id and p.status='PUBLISHED'));
