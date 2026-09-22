# Jyy'R Store database

Migrations are ordered SQL files under `database/migrations/`. RLS policies live under `database/policies/`; functions and triggers are separated so privileged application logic remains in the server transaction layer.

Run `npm run migrate` only against the configured Supabase/PostgreSQL project. The migrator records applied files and does not print credential values.

Core domains include profiles/roles, categories/products/product contents, carts, orders/order items, payments, deposits, wallets/ledger, entitlements/download logs, support tickets/messages, notifications, services, information/FAQ, login history/activity logs, settings/maintenance, refunds, and supporting idempotency/event tables.
