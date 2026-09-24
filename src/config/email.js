const nodemailer = require('nodemailer');
function resolveSmtpSender(envRef) {
  const rawSender = String(envRef.SMTP_FROM || envRef.EMAIL_FROM || '').trim();

  if (!rawSender) {
    throw new Error('SMTP_FROM or EMAIL_FROM is required when SMTP is enabled');
  }

  const mailboxMatch = rawSender.match(/<\s*([^>\s]+@[^>\s]+)\s*>$/);
  const mailbox = mailboxMatch ? mailboxMatch[1] : rawSender;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) {
    throw new Error('SMTP_FROM or EMAIL_FROM must contain a valid sender email address');
  }

  if (rawSender.includes('<')) {
    return rawSender;
  }

  const displayName = String(envRef.EMAIL_FROM_NAME || '').trim();

  if (!displayName) {
    return mailbox;
  }

  const safeName = displayName
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  return `"${safeName}" <${mailbox}>`;
}

let transporter;
let envRef;
function initEmail(env) {
  envRef = env;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return;
  transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
}
async function sendEmail({ to, subject, html, text }) {
  if (!transporter || !to) return { skipped: true };
  return transporter.sendMail({
    from: resolveSmtpSender(envRef),
    replyTo: envRef.EMAIL_REPLY_TO || undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
    to,
    subject,
    html,
    text
  });
}
module.exports = { initEmail, sendEmail };
