# Payments

Documents the payment separation: Payment Controller → Payment Service → Payment Provider → Webhook → Verification → Idempotency → Order/Deposit.

The provider adapter must remain isolated from HTTP controllers, secrets must be server-side, and webhook/event handling must verify authenticity and replay resistance before mutating financial state.
