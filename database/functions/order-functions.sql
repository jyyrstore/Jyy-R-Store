create or replace function public.touch_order_paid(p_id uuid) returns void language sql as $$ update orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=p_id; $$;

alter function public.touch_order_paid(uuid)
  set search_path = pg_catalog, public;

revoke execute on function public.touch_order_paid(uuid) from public;
revoke execute on function public.touch_order_paid(uuid) from anon, authenticated;
grant execute on function public.touch_order_paid(uuid) to service_role;
