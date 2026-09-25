do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.product_contents'::regclass
      and conname='product_contents_preview_invariant'
  ) then
    alter table public.product_contents
      add constraint product_contents_preview_invariant
      check (is_preview = (access_type = 'PREVIEW'));
  end if;
end $$;
