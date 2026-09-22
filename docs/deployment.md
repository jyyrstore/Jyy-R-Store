# Deployment

1. Provide the real owner-supplied environment variables through the deployment platform secret manager. Do not commit `.env`.
2. Use Node 22 or newer.
3. Run `npm install` in CI so `package-lock.json` is generated/verified from the resolved dependency set.
4. Run `npm run build`, `npm test`, and `npm run verify` before promotion.
5. Run `npm run migrate` against the target Supabase PostgreSQL project before the application begins accepting traffic.
6. Configure the payment provider webhook URL as `/api/payment/webhook` and the exact signature secret/header expected by the selected provider adapter.
7. Configure the three storage buckets required by the app: public assets, private product files, and private user uploads.
8. Production startup fails closed when critical server-side secrets are missing.
