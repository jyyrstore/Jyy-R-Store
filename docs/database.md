# Database

## Implemented organization

- `database/migrations/`: ordered schema and data-contract migrations.
- `database/functions/`: PostgreSQL functions.
- `database/triggers/`: triggers.
- `database/policies/`: RLS policies.
- `database/seeds/` and `scripts/seed.js`: seed data flow.

The migration runner in `scripts/migrate.js` maintains separate ledgers for
schema migrations, functions, triggers, and policies. It applies each
unrecorded SQL file in a transaction and records that file after successful
execution. Files already present in the relevant ledger are skipped.

Run `npm run migrate` only against the intended configured PostgreSQL/Supabase
project. This command writes to the target database; it is not a read-only
verification and the runner does not provide automatic reverse migrations.

## Verification scope

`npm run verify:db` checks that `DATABASE_URL` is configured and that a defined
set of 12 critical tables exists in the `public` schema. It is a connectivity
and table-presence check, not a complete audit of every column, index,
constraint, trigger, RLS policy, or production data invariant.

Static tests and migrations establish the repository's declared database
contract. They do not prove that every migration and policy has been applied
correctly to the active remote project; verify the target project separately.
