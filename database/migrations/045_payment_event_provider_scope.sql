-- Scope webhook idempotency by payment provider.
-- Existing global uniqueness prevents duplicate historical event IDs.

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_provider_event_id_key;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_provider_provider_event_id_key
  UNIQUE (provider, provider_event_id);
