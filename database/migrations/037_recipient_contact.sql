alter table public.carts
  add column if not exists recipient_email varchar(254),
  add column if not exists recipient_country_code varchar(2),
  add column if not exists recipient_dial_code varchar(8),
  add column if not exists recipient_phone varchar(20);

alter table public.orders
  add column if not exists recipient_email varchar(254),
  add column if not exists recipient_country_code varchar(2),
  add column if not exists recipient_dial_code varchar(8),
  add column if not exists recipient_phone varchar(20);

create index if not exists idx_orders_recipient_phone
  on public.orders(recipient_country_code,recipient_phone);
