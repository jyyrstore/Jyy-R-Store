# Authentication

Describes the intended authentication boundary. Identity should be established through the selected authentication provider, with secure session handling, login/logout lifecycle, account recovery, email verification where required, and redacted diagnostics.

Controllers should not make ad-hoc identity decisions; middleware/session layers should establish the authenticated principal before protected controllers execute.
