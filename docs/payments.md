# Payments

Documents the payment separation: Payment Controller → Payment Service → Payment Provider → Webhook → Verification → Idempotency → Order/Deposit.

The provider adapter must remain isolated from HTTP controllers, secrets must be server-side, and webhook/event handling must verify authenticity and replay resistance before mutating financial state.

## BuatQris provider

The existing payment-provider adapter now supports BuatQris without replacing
the order or deposit business flow. It sends POST form-urlencoded requests to
`https://api.buatqris.site` using `api_create_qris`, then checks the HTTP status,
the JSON `success` field, `transaction_id`, and `total_amount`.

The buyer bill must be matched using `total_amount`, not `amount`. The unique
code and provider fee behavior must not be reconstructed independently from the
provider response.

`BUATQRIS_TEST_MODE` defaults to `true`. In production, order and deposit
creation are blocked while test mode remains enabled. Sandbox webhooks are
authenticated and deduplicated but cannot mark real orders paid, consume stock,
grant entitlements or credit wallet balances.
