# Contributing

Use the modular architecture defined by the scaffold. Keep routes thin, controllers focused on HTTP adaptation, services responsible for business rules, repositories responsible for data access, and validators responsible for input shape. Avoid giant catch-all modules.

Use lowercase kebab-case for backend filenames, focused branches, descriptive commits, automated tests, code review, and security review for changes involving authentication, authorization, payments, storage, webhooks, owner controls, or secrets.

At implementation time, every meaningful change should include relevant unit/integration/security coverage and documentation updates where contracts change.
