# Payment webhooks

`POST /api/payment/webhook` is the external provider boundary. The route preserves the raw request body, verifies the provider HMAC/signature, parses a normalized event, validates the reference and amount, and processes the event in a database transaction.

Provider events are deduplicated by `(provider, provider_event_id)` in `payment_events`, so duplicate delivery is idempotent independently for each provider. Paid orders consume reserved stock and grant entitlements; paid deposits credit the user wallet and create a DEPOSIT ledger mutation. Failed/expired payment releases stock reservations or marks the corresponding deposit state.

## BuatQris webhook

Configure the BuatQris callback URL as:

`https://jyyrsh.my.id/api/payment/webhook/buatqris`

The route is mounted before the JSON body parser and uses the raw request body.
It verifies `X-BuatQris-Signature` as
`sha256=<hex HMAC-SHA256>` using `BUATQRIS_SIGNING_SECRET`; it also requires
`X-BuatQris-Event` and `X-BuatQris-Delivery` to match the body.

Webhook event identity is stable across retries. If a valid payment event arrives
before its provider reference is saved locally, the event is kept unprocessed
and the endpoint returns a retryable error rather than marking it completed.
BuatQris documents only one retry, so very early callbacks may still require
manual reconciliation.

The old `/api/webhook/xendit` endpoint remains available for pending Xendit
transactions. Keep `XENDIT_WEBHOOK_TOKEN` configured until those transactions
have been resolved. The external BuatQris dashboard callback must still be set
manually; changing repository files cannot update a provider dashboard.
