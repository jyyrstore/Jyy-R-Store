# Email

Supabase Auth remains responsible for authentication emails such as verification and password recovery. Jyy'R Store transactional emails use the optional SMTP adapter in `src/config/email.js` when `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and sender settings are configured.

Email templates are HTML documents stored under `src/templates/email/`; secrets, access tokens, raw payment payloads, and credentials must never be rendered into email content.
