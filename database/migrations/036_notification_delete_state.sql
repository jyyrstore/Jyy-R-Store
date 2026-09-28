-- Per-user notification deletion state.
-- Broadcast notifications remain shared in notifications;
-- deleted_at hides them only for the current user.

alter table public.notification_reads
  add column if not exists deleted_at timestamptz;

create index if not exists idx_notification_reads_user_deleted
  on public.notification_reads(user_id,deleted_at);
