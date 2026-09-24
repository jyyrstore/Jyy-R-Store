-- JYY'R STORE payment function hardening.
-- touch_order_paid() is an internal server-side helper and is not used by the
-- application client/RPC layer.

revoke execute on function public.touch_order_paid(uuid) from public;
revoke execute on function public.touch_order_paid(uuid) from anon, authenticated;
grant execute on function public.touch_order_paid(uuid) to service_role;
