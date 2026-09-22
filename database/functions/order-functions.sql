create or replace function public.touch_order_paid(p_id uuid) returns void language sql as $$ update orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=p_id; $$;
