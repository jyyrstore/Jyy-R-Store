do $$ begin create type account_status as enum ('ACTIVE','SUSPENDED','BANNED','PENDING'); exception when duplicate_object then null; end $$;
create table if not exists profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check(length(username) between 3 and 32),
  email text not null,
  role text not null references roles(code) default 'USER',
  status account_status not null default 'ACTIVE',
  avatar_path text, display_name text, phone text, bio text,
  last_login_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_status on profiles(status);
