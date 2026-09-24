create table if not exists notification_reads(
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(notification_id,user_id)
);

create index if not exists idx_notification_reads_user_id
  on notification_reads(user_id);

insert into notification_reads(notification_id,user_id,read_at)
select
  id,
  user_id,
  coalesce(read_at,now())
from notifications
where user_id is not null
  and is_read=true
on conflict(notification_id,user_id) do nothing;
