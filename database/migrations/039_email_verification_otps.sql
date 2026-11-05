create table if not exists public.email_verification_otps(
  user_id uuid primary key
    references public.profiles(id)
    on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count smallint not null default 0
    check(attempt_count between 0 and 5),
  attempt_window_started_at timestamptz not null default now(),
  send_count smallint not null default 1
    check(send_count between 1 and 3),
  send_window_started_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_verification_otps_expiry
  on public.email_verification_otps(expires_at);

alter table public.email_verification_otps
  enable row level security;

revoke all on table public.email_verification_otps
  from anon, authenticated;

revoke all on table public.email_verification_otps
  from public;
