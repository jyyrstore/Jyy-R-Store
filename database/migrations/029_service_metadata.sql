alter table services add column if not exists icon_key text;
alter table services add column if not exists sort_order integer not null default 0;
create index if not exists services_sort_idx on services(is_active, sort_order, created_at desc);
