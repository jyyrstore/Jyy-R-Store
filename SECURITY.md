# Security

- Never use frontend state or localStorage for authorization.
- Owner/admin/moderator access is checked server-side.
- Supabase service-role credentials stay server-only.
- Premium product files are private and delivered with short-lived signed URLs only after entitlement/payment checks.
- Webhooks use raw-body signature verification and provider-event idempotency.
- Financial mutations run in PostgreSQL transactions with row locks.
- CSRF tokens protect browser mutations; webhook endpoints are exempt because authenticity is provider-signature based.
- API and sensitive operations are rate limited.
- File uploads are memory-limited, type-checked, extension-checked, and stored under controlled server-generated paths.
- Logs redact secrets and authentication material.
- Sensitive owner actions are recorded in `activity_logs`.
