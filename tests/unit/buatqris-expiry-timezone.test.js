const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BuatQrisProvider,
  paymentExpiryFallbackMinutes
} = require('../../src/config/payment');

test('BuatQris local fallback matches the provider one-hour lifetime', () => {
  assert.equal(paymentExpiryFallbackMinutes('buatqris'), 60);
  assert.equal(paymentExpiryFallbackMinutes('BUATQRIS'), 60);
  assert.equal(paymentExpiryFallbackMinutes('xendit'), 30);
});

async function createPaymentWithExpiry(expiredAt) {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        transaction_id: 'TST-TIMEZONE-001',
        amount: 10000,
        total_amount: 10221,
        payment_url: 'https://app.buatqris.site/trx/TST-TIMEZONE-001',
        qr_url: 'https://app.buatqris.site/poto/qris/TST-TIMEZONE-001.png',
        expired_at: expiredAt,
        is_test: true
      }
    })
  });

  try {
    const provider = new BuatQrisProvider({
      BUATQRIS_ACCOUNT_ID: 'test-account',
      BUATQRIS_SECRET_TOKEN: 'test-secret-token-at-least-20-chars',
      BUATQRIS_FEE_BY: 'user',
      BUATQRIS_QRIS_METHOD: 'qris_four',
      BUATQRIS_TEST_MODE: true,
      PAYMENT_REQUEST_TIMEOUT_MS: 1000
    });

    return await provider.createPayment({
      orderId: 'unit-test-order',
      amount: 10000,
      testMode: true
    });
  } finally {
    global.fetch = originalFetch;
  }
}

test('BuatQris naive expired_at is interpreted as Asia/Jakarta', async () => {
  const result = await createPaymentWithExpiry('2026-10-16 15:39:51');

  assert.equal(result.expiresAt, '2026-10-16T08:39:51.000Z');
  // Keep the original provider payload for audit/debugging.
  assert.equal(result.raw.expired_at, '2026-10-16 15:39:51');
});

test('BuatQris explicit +07:00 expiry is not shifted twice', async () => {
  const result = await createPaymentWithExpiry('2026-10-16T15:39:51+07:00');

  assert.equal(result.expiresAt, '2026-10-16T08:39:51.000Z');
});

test('BuatQris UTC expiry remains UTC', async () => {
  const result = await createPaymentWithExpiry('2026-10-16T15:39:51Z');

  assert.equal(result.expiresAt, '2026-10-16T15:39:51.000Z');
});

test('invalid BuatQris expiry returns null for the existing safety fallback', async () => {
  const result = await createPaymentWithExpiry('not-a-valid-timestamp');

  assert.equal(result.expiresAt, null);
});

test('impossible calendar dates are rejected', async () => {
  const result = await createPaymentWithExpiry('2026-02-31 15:39:51');

  assert.equal(result.expiresAt, null);
});
