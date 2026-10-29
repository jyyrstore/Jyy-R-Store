# Jyyr Store — Requirement Audit

This document records implementation evidence and distinguishes source-level
coverage from external end-to-end verification.

## Status definitions

- **CONFIRMED (static)** — implementation and its code contract are present in
  source and/or covered by deterministic tests. This does not assert that the
  corresponding live external service is correctly configured.
- **LIKELY** — the application flow is implemented, but external dependencies
  or real user journeys have not been fully verified.
- **NOT VERIFIED E2E** — no evidence here establishes the complete runtime flow
  against the active external service or a real browser.

## Architecture and feature coverage

| Area | Source-level status | Evidence and boundary |
|---|---|---|
| Express/EJS application | CONFIRMED (static) | `server.js`, `src/routes`, controllers, services, repositories, and `views` |
| Environment validation | CONFIRMED (static) | `src/config/env.js`; provider-specific production configuration |
| PostgreSQL schema | CONFIRMED (static) | `database/migrations/*`; applied state still needs remote verification |
| Session authentication | CONFIRMED (static) | Supabase Auth service, regenerated session on login, auth middleware |
| Role authorization | CONFIRMED (static) | Server-side role middleware and protected Owner API router |
| Product catalog and variants | CONFIRMED (static) | Product service/repository and product routes |
| Cart and checkout | CONFIRMED (static) | Cart/order services and transactional repository operations |
| Wallet and deposits | CONFIRMED (static) | Wallet/deposit services and ledger-related database contracts |
| Payment adapters | CONFIRMED (static) | Generic JSON, Xendit, and BuatQris provider implementations |
| Payment and deposit reconciliation | CONFIRMED (static) | Payment service plus scheduled expiration/reconciliation jobs |
| Payment provider E2E | NOT VERIFIED E2E | Real transaction, callback delivery, signing, and settlement must be tested separately |
| Delivery entitlement checks | CONFIRMED (static) | `src/services/delivery/delivery.service.js` and `access-control.service.js` |
| Signed delivery URLs | CONFIRMED (static) | `src/config/storage.js` and delivery service; live Storage not proven by source alone |
| Bucket startup guard | CONFIRMED (static after remediation) | Configured names and existing visibility are checked before startup continues |
| Storage live verification | SEPARATE CHECK | `scripts/verify-storage.js` is read-only and checks existence/visibility, not all RLS behavior |
| RLS policies | CONFIRMED (static) | SQL policy files; effective remote policies require separate project verification |
| Input validation and CSRF | CONFIRMED (static) | Zod validation and security middleware |
| Rate limiting | CONFIRMED (static) | General and sensitive limiters; production sensitive routes require configured distributed limiting |
| Webhook signatures/idempotency | CONFIRMED (static) | Raw-body routes, provider verification, payment-event handling |
| Support, messaging, notifications | CONFIRMED (static) | Services, repositories, APIs, and views |
| Responsive UI | LIKELY | Responsive styles exist; visual browser tests are still needed |
| Accessibility | LIKELY | Semantic controls and accessibility hooks exist; no full accessibility audit is claimed |
| Documentation | Updated with implementation boundaries | See related architecture, database, storage, delivery, and deployment documents |

## Verification commands and what they prove

- `npm test`: deterministic unit, integration-contract, and security tests.
- `npm run lint`: ESLint checks.
- `npm run build`: `scripts/build-check.js` structure/security contract checks.
- `npm run verify`: source-level project contract checks.
- `npm run verify:env`: validates the selected provider's environment configuration.
- `npm run verify:db`: checks connectivity and required critical table presence.
- `npm run verify:storage`: read-only live bucket existence and visibility checks.
- `npm run verify:payment`: checks provider configuration; it does not create a real transaction unless the explicit sandbox probe is requested.

The standard GitHub verification workflow runs build, lint, tests, and project verification. Separate checks that need live database or Storage credentials must be run with the intended deployment environment.

## Not verified end-to-end

The following must not be marked PASS based only on static tests, CI, or deployment status:

1. Complete checkout and deposit flows through the real payment provider.
2. Production webhook delivery, signature handling, retries, and final settlement.
3. Effective RLS behavior and authorization against the active Supabase project.
4. Real upload, bucket permissions, signed URL access, and file delivery lifecycle.
5. SMTP delivery and email-provider behavior.
6. Full browser E2E, visual responsive behavior, and comprehensive accessibility.
7. Real production user journeys through independent HTTP/browser smoke tests.

## Operational interpretation

The `test`, `security`, and verification workflows provide automated code checks. The workflow named `deploy.yml` does not itself deploy the application; deployment is handled by the configured Vercel Git integration. A successful CI run or deployment status proves neither full external integration nor all production user journeys.

After changes, rerun the validation commands and review the exact commit's CI and deployment status before declaring the remediation complete.
