alter table categories
  add column if not exists parent_id uuid
  references categories(id) on delete set null;

create index if not exists idx_categories_parent_sort_order_name
  on categories(parent_id,sort_order,name);
