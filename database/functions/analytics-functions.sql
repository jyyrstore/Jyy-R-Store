create or replace function public.owner_analytics(p_from timestamptz,p_to timestamptz) returns jsonb language sql stable as $$
select jsonb_build_object(
  'revenue', coalesce((select sum(total) from orders where status in ('PAID','PROCESSING','COMPLETED') and created_at>=p_from and created_at<p_to),0),
  'orders', coalesce((select count(*) from orders where created_at>=p_from and created_at<p_to),0),
  'deposit', coalesce((select sum(amount) from deposits where status='SUCCESS' and created_at>=p_from and created_at<p_to),0),
  'new_users', coalesce((select count(*) from profiles where created_at>=p_from and created_at<p_to),0),
  'order_status', coalesce((select jsonb_object_agg(status,cnt) from (select status,count(*) cnt from orders where created_at>=p_from and created_at<p_to group by status)s),'{}'::jsonb)
); $$;
revoke all on function public.owner_analytics(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.owner_analytics(timestamptz,timestamptz) to service_role;
