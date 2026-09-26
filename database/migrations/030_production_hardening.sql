-- JYY'R STORE production hardening
-- Idempotent: safe to run once through the normal migration runner.

create index if not exists idx_payments_order_id
  on public.payments(order_id);

create unique index if not exists ux_payments_one_pending_per_order
  on public.payments(order_id)
  where order_id is not null and status='PENDING';

create index if not exists idx_payment_events_payment_id
  on public.payment_events(payment_id);

create index if not exists idx_cart_items_product_id on public.cart_items(product_id);
create index if not exists idx_deposits_payment_id on public.deposits(payment_id);
create index if not exists idx_download_logs_content_id on public.download_logs(content_id);
create index if not exists idx_download_logs_order_id on public.download_logs(order_id);
create index if not exists idx_download_logs_user_id on public.download_logs(user_id);
create index if not exists idx_entitlements_order_id on public.entitlements(order_id);
create index if not exists idx_entitlements_product_id on public.entitlements(product_id);
create index if not exists idx_login_history_user_id on public.login_history(user_id);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_user_id on public.messages(user_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_product_events_user_id on public.product_events(user_id);
create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_refunds_created_by on public.refunds(created_by);
create index if not exists idx_refunds_payment_id on public.refunds(payment_id);
create index if not exists idx_refunds_order_id on public.refunds(order_id);
create index if not exists idx_refunds_user_id on public.refunds(user_id);
create index if not exists idx_service_orders_order_id on public.service_orders(order_id);
create index if not exists idx_service_orders_service_id on public.service_orders(service_id);
create index if not exists idx_service_orders_user_id on public.service_orders(user_id);
create index if not exists idx_ticket_messages_sender_id on public.ticket_messages(sender_id);
create index if not exists idx_ticket_messages_ticket_id on public.ticket_messages(ticket_id);
create index if not exists idx_tickets_user_id on public.tickets(user_id);
create index if not exists idx_wallet_transactions_wallet_id on public.wallet_transactions(wallet_id);
