# Jyy'R Store — Implemented Structure Map

This document describes the greenfield implementation produced from `Website Store.md`.

- `server.js`: Express bootstrap, middleware, routes, error handling, startup/shutdown.
- `src/routes`: HTTP route composition only.
- `src/controllers`: HTTP-to-domain translation.
- `src/services`: business logic and integrations.
- `src/repositories`: PostgreSQL/Supabase data access.
- `src/config`: environment, database, Supabase, storage, payment, email, session, security.
- `src/middleware`: authentication, authorization, validation, CSRF, maintenance, rate limiting, upload and error controls.
- `views`: EJS application shell, reusable partials, user pages and owner panel.
- `public`: modular CSS, browser API client, navigation, modal/toast and page interaction logic.
- `database`: migrations, RLS/storage policies, functions, triggers and seed data.
- `tests`: executable unit/security/contract tests; runtime integration/e2e require configured infrastructure.
- `docs`: architecture, database, payments, storage, deployment, security and owner-panel documentation.
