-- Persistent recipient contacts for JYYR STORE
-- Keeps reusable contacts separate from order snapshots.

create table if not exists public.recipient_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label varchar(40) not null default 'Utama',
  recipient_email varchar(254) not null,
  recipient_country_code varchar(2) not null,
  recipient_dial_code varchar(8) not null,
  recipient_phone varchar(20) not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recipient_contacts_user_id
  on public.recipient_contacts(user_id);

create unique index if not exists uq_recipient_contacts_user_label
  on public.recipient_contacts(user_id, label);

create unique index if not exists uq_recipient_contacts_one_default
  on public.recipient_contacts(user_id)
  where is_default = true;

-- Preserve an already-filled cart contact as the user's initial
-- reusable/default contact.
insert into public.recipient_contacts (
  user_id,
  label,
  recipient_email,
  recipient_country_code,
  recipient_dial_code,
  recipient_phone,
  is_default
)
select distinct on (c.user_id)
  c.user_id,
  'Utama',
  c.recipient_email,
  c.recipient_country_code,
  c.recipient_dial_code,
  c.recipient_phone,
  true
from public.carts c
where nullif(trim(c.recipient_email), '') is not null
  and nullif(trim(c.recipient_country_code), '') is not null
  and nullif(trim(c.recipient_dial_code), '') is not null
  and nullif(trim(c.recipient_phone), '') is not null
order by c.user_id, c.updated_at desc nulls last
on conflict (user_id, label) do update
set recipient_email = excluded.recipient_email,
    recipient_country_code = excluded.recipient_country_code,
    recipient_dial_code = excluded.recipient_dial_code,
    recipient_phone = excluded.recipient_phone,
    is_default = true,
    updated_at = now();

alter table public.recipient_contacts enable row level security;

drop policy if exists recipient_contacts_owner_access
  on public.recipient_contacts;

create policy recipient_contacts_owner_access
on public.recipient_contacts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
on public.recipient_contacts
to authenticated;
