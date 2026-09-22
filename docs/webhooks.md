# Payment webhooks

`POST /api/payment/webhook` is the external provider boundary. The route preserves the raw request body, verifies the provider HMAC/signature, parses a normalized event, validates the reference and amount, and processes the event in a database transaction.

Provider events are recorded by `payment_events.provider_event_id` so duplicate delivery is idempotent. Paid orders consume reserved stock and grant entitlements; paid deposits credit the user wallet and create a DEPOSIT ledger mutation. Failed/expired payment releases stock reservations or marks the corresponding deposit state.
