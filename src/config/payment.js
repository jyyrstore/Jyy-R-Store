const crypto = require('crypto');
let provider;
class GenericJsonProvider {
  constructor(env) { this.env = env; }
  configured() { return Boolean(this.env.PAYMENT_API_BASE_URL && this.env.PAYMENT_API_KEY); }
  async createPayment({ orderId, amount, customer, returnUrl }) {
    if (!this.configured()) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const response = await fetch(`${this.env.PAYMENT_API_BASE_URL.replace(/\/$/, '')}/payments`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.env.PAYMENT_API_KEY}` },
      body: JSON.stringify({ orderId, amount: Number(amount), customer, returnUrl, environment: this.env.PAYMENT_ENVIRONMENT })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `Payment provider returned ${response.status}`);
    if (!body.reference || !body.paymentUrl) throw new Error('Payment provider response must contain reference and paymentUrl.');
    return { reference: body.reference, paymentUrl: body.paymentUrl, expiresAt: body.expiresAt || null, raw: body };
  }
  verifyWebhook(rawBody, signature) {
    const secret = this.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac(this.env.PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM, secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  parseWebhook(payload) {
    const p = payload || {};
    return {
      eventId: String(p.eventId || p.id || p.reference || ''),
      orderId: p.orderId ? String(p.orderId) : null,
      reference: p.reference ? String(p.reference) : '',
      amount: Number(p.amount || 0),
      status: String(p.status || '').toUpperCase(),
      paidAt: p.paidAt || null,
      metadata: p
    };
  }
}
function initPaymentProvider(env) { provider = env.PAYMENT_PROVIDER === 'generic-json' ? new GenericJsonProvider(env) : new GenericJsonProvider(env); }
function paymentProvider() { if (!provider) throw new Error('Payment provider not initialized.'); return provider; }
module.exports = { initPaymentProvider, paymentProvider };
