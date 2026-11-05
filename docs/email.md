# Email

Registration email verification uses an application-managed four-digit OTP. The code is sent through the existing SMTP adapter in `src/config/email.js` and the template helper in `src/services/email/`.

OTP codes expire after 10 minutes, allow at most five verification attempts per hour, enforce a 60-second resend cooldown, and allow at most three sends per hour. Only an HMAC hash is stored in `email_verification_otps`; the raw code must never be logged or persisted.

Production registration requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and either `SMTP_FROM` or `EMAIL_FROM`.

Supabase Auth remains responsible for account identity, passwords, sessions, and password recovery. The server confirms a registration email with the Supabase Admin API only after the application OTP has been validated.

Email templates are HTML documents stored under `src/templates/email/`; secrets, access tokens, raw payment payloads, credentials, and OTP values must never be rendered into logs or URLs.
