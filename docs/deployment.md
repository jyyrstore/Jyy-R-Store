# Deployment

1. Provide the real owner-supplied environment variables through the deployment platform secret manager. Do not commit `.env`.
2. Use Node.js 24.x.
3. Run `npm install` in CI so `package-lock.json` is generated/verified from the resolved dependency set.
4. Run `npm run build`, `npm test`, and `npm run verify` before promotion.
5. Run `npm run migrate` against the target Supabase PostgreSQL project before the application begins accepting traffic.
6. Configure the payment provider webhook URL as `/api/payment/webhook` and the exact signature secret/header expected by the selected provider adapter.
7. Configure the three storage buckets required by the app: public assets, private product files, and private user uploads.
8. Production startup fails closed when critical server-side secrets are missing.

## BuatQris deployment

Configure these server-side variables in the deployment platform:
`PAYMENT_PROVIDER=buatqris`, `BUATQRIS_ACCOUNT_ID`,
`BUATQRIS_SECRET_TOKEN`, `BUATQRIS_SIGNING_SECRET`,
`BUATQRIS_CALLBACK_URL=https://jyyrsh.my.id/api/payment/webhook/buatqris`,
`BUATQRIS_TEST_MODE=true`, and `BUATQRIS_FEE_BY=user`.

Keep `XENDIT_WEBHOOK_TOKEN` configured while the legacy Xendit route is needed.
Do not commit `.env` or place any provider secret in public JavaScript.

Run `node scripts/verify-payment.js --sandbox` after account ID and secret token
are configured. This makes a standalone Rp1.000 request with `test=1` and does
not create a local order or deposit. It tests the create API request, not actual
delivery of the callback; callback delivery and signature validation must be
verified separately before switching `BUATQRIS_TEST_MODE=false`.

In the BuatQris dashboard, set the callback to
`https://jyyrsh.my.id/api/payment/webhook/buatqris`. The legacy Xendit callback remains
`https://jyyrsh.my.id/api/webhook/xendit`.
