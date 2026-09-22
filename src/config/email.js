const nodemailer = require('nodemailer');
let transporter;
let envRef;
function initEmail(env) {
  envRef = env;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return;
  transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
}
async function sendEmail({ to, subject, html, text }) {
  if (!transporter || !to) return { skipped: true };
  return transporter.sendMail({ from: envRef.SMTP_FROM || envRef.EMAIL_FROM || envRef.EMAIL_FROM_NAME, replyTo: envRef.EMAIL_REPLY_TO || undefined, to, subject, html, text });
}
module.exports = { initEmail, sendEmail };
