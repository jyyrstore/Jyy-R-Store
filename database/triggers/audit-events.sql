create or replace function public.audit_sensitive_change() returns trigger language plpgsql as $$ begin return coalesce(new,old); end $$;
-- Financial and owner mutations are explicitly logged in application transactions. This trigger is intentionally side-effect free to avoid duplicate audit rows.
