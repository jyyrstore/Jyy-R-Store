# Deployment

## Build and release checks

1. Provide owner-supplied environment variables through the deployment
   platform's secret manager. Do not commit `.env`.
2. Use Node.js `24.x`, matching `.nvmrc` and `.node-version`.
3. Install the committed dependency lockfile in CI with `npm ci --ignore-scripts`,
   as the repository workflows do.
4. Run `npm run build`, `npm run lint`, `npm test`, and `npm run verify`.
5. Before production traffic, apply intended migrations with `npm run migrate`
   against the configured Supabase/PostgreSQL project.
6. Run `npm run verify:env`, `npm run verify:db`, `npm run verify:storage`, and
   `npm run verify:payment` using the intended environment. Database and Storage
   checks contact the configured external systems; the payment verifier checks
   provider configuration unless the explicit `--sandbox` option is used.
7. Confirm bucket visibility, provider callback settings, environment secrets,
   and the actual deployed commit before enabling live payment operations.

The GitHub workflow `deploy.yml` runs verification checks; it does not itself
deploy the application. Production deployment is handled by the configured
Vercel Git integration. Passing CI or a Vercel deployment status does not by
itself verify full checkout, webhook, email, Storage, or browser flows.

## Payment callback routes

Configure the callback matching the selected provider adapter:

- Generic JSON provider: `/api/payment/webhook`
- BuatQris: `/api/payment/webhook/buatqris`
- Legacy Xendit callbacks: `/api/webhook/xendit`

Use the exact signature/token settings expected by that provider. The raw-body
webhook routes must remain mounted before the general JSON parser.

## BuatQris deployment

Configure these server-side variables in the deployment platform:
`PAYMENT_PROVIDER=buatqris`, `BUATQRIS_ACCOUNT_ID`,
`BUATQRIS_SECRET_TOKEN`, `BUATQRIS_SIGNING_SECRET`,
`BUATQRIS_CALLBACK_URL`, `BUATQRIS_TEST_MODE`, and `BUATQRIS_FEE_BY`.

Keep `XENDIT_WEBHOOK_TOKEN` configured only while the legacy Xendit route is
still required; it is not a BuatQris provider credential.

Run `node scripts/verify-payment.js --sandbox` only when the owner explicitly
intends to send the standalone Rp1.000 test request. That probe sends `test=1`,
does not create a local store order/deposit, and does not prove webhook delivery
or signature handling. Verify the callback path separately before switching
BuatQris to live mode.
