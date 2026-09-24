-- JYY'R STORE final production hardening.
-- Idempotent migration.

create index if not exists idx_notification_reads_user_notification
  on public.notification_reads(user_id,notification_id);

create index if not exists idx_notifications_broadcast_created_at
  on public.notifications(created_at desc)
  where user_id is null;

create index if not exists idx_orders_status_created_at
  on public.orders(status,created_at desc);

create index if not exists idx_payments_status_created_at
  on public.payments(status,created_at desc);

create index if not exists idx_idempotency_keys_created_at
  on public.idempotency_keys(created_at);
