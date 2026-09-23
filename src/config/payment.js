const crypto = require('crypto');
let provider;
class GenericJsonProvider {
  constructor(env) { this.env = env; }
  configured() { return Boolean(this.env.PAYMENT_API_BASE_URL && this.env.PAYMENT_API_KEY); }
  async createPayment({ orderId, amount, customer, returnUrl, idempotencyKey }) {
    if (!this.configured()) throw Object.assign(new Error('Payment provider belum dikonfigurasi.'),{status:503,code:'PAYMENT_PROVIDER_NOT_CONFIGURED',expose:true});
    const timeoutMs=Math.max(1000,Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS||15000));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{
      response=await fetch(`${this.env.PAYMENT_API_BASE_URL.replace(/\/$/, '')}/payments`, {
        method: 'POST',
        headers: {
          'content-type':'application/json',
          authorization:`Bearer ${this.env.PAYMENT_API_KEY}`,
          ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})
        },
        body: JSON.stringify({ orderId, amount:Number(amount), customer, returnUrl, environment:this.env.PAYMENT_ENVIRONMENT, ...(idempotencyKey?{idempotencyKey}: {}) }),
        signal:controller.signal
      });
    }catch(error){
      if(error?.name==='AbortError') throw new Error('Payment provider request timed out.',{cause:error});
      throw error;
    }finally{
      clearTimeout(timer);
    }
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
  parseWebhook(payload, rawBody) {
    const p = payload || {};
    const fallbackEventId = rawBody !== undefined && rawBody !== null
      ? `sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`
      : '';

    return {
      eventId: String(p.eventId || p.id || fallbackEventId),
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
