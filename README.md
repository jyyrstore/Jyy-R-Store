# Jyy'R Store

Jyy'R Store is a full-stack digital store/service platform built as a greenfield Express application with EJS, HTML/CSS/Vanilla JavaScript, Supabase Auth/Storage, and PostgreSQL transactions.

## Architecture

Browser → Express route → controller → service → repository → PostgreSQL/Supabase Storage/Auth.

Authentication state lives in a server session; authorization is enforced server-side and reinforced with PostgreSQL RLS. Premium files remain in a private bucket and are exposed only through short-lived signed URLs after an entitlement check.

## Development

Requirements: Node.js 22+ and a Supabase/PostgreSQL project when real data flows are exercised.

```bash
cp .env.example .env
# fill only owner-supplied values
npm install
npm run build
npm test
npm run verify
npm run migrate
npm run seed
npm start
```

The local server is `http://localhost:3000` by default.

## Environment

`.env.example` is the configuration contract. Public identifiers such as `SUPABASE_URL` are safe to expose to the browser only when actually required; `SUPABASE_SERVICE_ROLE_KEY`, payment secrets, SMTP passwords, session secrets, and encryption material are server-only.

## Payment

The application ships with a modular `generic-json` provider contract. A real provider is required before gateway payments/deposits can be used. The provider contract requires a create-payment API and a signed webhook. No fake provider URL or credential is embedded in the repository.

## Verification

`npm run build` performs a dependency-free structure/security contract check. `npm test` covers deterministic domain/security helpers. Live database, Supabase Auth/Storage, email, external payment checks, and browser E2E require real owner-supplied environment values plus an installed dependency/runtime environment; unavailable live checks are reported in `docs/requirement-audit.md`.


## Verification Note
At build time the environment could not reach the npm registry, so `package-lock.json` was not generated here. Use `npm install` in a networked development/deployment environment before `npm ci`; after dependencies are installed, run `npm test`, `npm run lint`, and `npm run build`. Live Supabase/payment/email/Vercel checks require owner credentials and are intentionally not embedded in the repository.
