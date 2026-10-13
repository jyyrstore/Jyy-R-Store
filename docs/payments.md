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

`BUATQRIS_TEST_MODE` defaults to `true`. In Production, order and deposit creation use the same gate: sandbox creation is blocked unless `BUATQRIS_ALLOW_PRODUCTION_SANDBOX=true` is explicitly enabled for controlled testing. Do not leave that override enabled for real customer transactions. Sandbox webhooks are authenticated and deduplicated but cannot mark real orders paid, consume stock, grant entitlements or credit wallet balances.

Deposit idempotency keys are namespaced by user and operation before storage and provider use. This prevents equal client keys from associating payments across users or operation types. BuatQris provider-side idempotency is not assumed; its contract must be confirmed before adding provider-specific headers.
