const test=require('node:test');
const assert=require('node:assert/strict');
const {formatIDR}=require('../../src/utils/currency');
const {hmac}=require('../../src/utils/crypto');
const {pageParams}=require('../../src/utils/pagination');
const {icon}=require('../../src/utils/icons');


test('webhook parser prefers provider event ID',()=>{
  const crypto=require('crypto');
  const {
    initPaymentProvider,
    paymentProvider
  }=require('../../src/config/payment');

  initPaymentProvider({
    PAYMENT_PROVIDER:'generic-json',
    PAYMENT_WEBHOOK_SECRET:'test-secret',
    PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM:'sha256'
  });

  const rawBody=JSON.stringify({
    id:'provider-id-001',
    reference:'PAY-001',
    amount:15000,
    status:'PAID'
  });

  const parsed=paymentProvider().parseWebhook(
    JSON.parse(rawBody),
    rawBody
  );

  assert.equal(parsed.eventId,'provider-id-001');
});

test('webhook parser falls back to raw-body SHA-256 when provider event ID is missing',()=>{
  const crypto=require('crypto');
  const {
    initPaymentProvider,
    paymentProvider
  }=require('../../src/config/payment');

  initPaymentProvider({
    PAYMENT_PROVIDER:'generic-json',
    PAYMENT_WEBHOOK_SECRET:'test-secret',
    PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM:'sha256'
  });

  const rawBody=JSON.stringify({
    reference:'PAY-002',
    amount:25000,
    status:'PENDING'
  });

  const expected=
    'sha256:'+
    crypto.createHash('sha256')
      .update(rawBody)
      .digest('hex');

  const parsed=paymentProvider().parseWebhook(
    JSON.parse(rawBody),
    rawBody
  );

  assert.equal(parsed.eventId,expected);
});

test('webhook parser never uses payment reference as event ID fallback',()=>{
  const {
    initPaymentProvider,
    paymentProvider
  }=require('../../src/config/payment');

  initPaymentProvider({
    PAYMENT_PROVIDER:'generic-json',
    PAYMENT_WEBHOOK_SECRET:'test-secret',
    PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM:'sha256'
  });

  const rawBody=JSON.stringify({
    reference:'PAY-003',
    amount:30000,
    status:'PAID'
  });

  const parsed=paymentProvider().parseWebhook(
    JSON.parse(rawBody),
    rawBody
  );

  assert.notEqual(parsed.eventId,'PAY-003');
  assert.match(parsed.eventId,/^sha256:[a-f0-9]{64}$/);
});

test('currency formatting is IDR-localized',()=>assert.match(formatIDR(15000),/15[.]000|Rp\s?15[.]000/i));
test('pagination clamps page/limit safely',()=>assert.deepEqual(pageParams({page:0,limit:500}),{page:1,limit:100,offset:0}));
test('webhook HMAC helper is deterministic',()=>assert.equal(hmac('hello','secret'),'88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b'));
test('icon system returns SVG',()=>assert.match(icon('download'),/^<svg[\s\S]*<\/svg>$/));


test('navigation icons stay visibly scalable',()=>{
  const fs=require('fs');
  const nav=fs.readFileSync(require.resolve('../../public/css/navigation.css'),'utf8');
  const responsive=fs.readFileSync(require.resolve('../../public/css/responsive.css'),'utf8');
  const components=fs.readFileSync(require.resolve('../../public/css/components.css'),'utf8');

  assert.match(
    nav,
    /\.nav-link svg\{width:32px;height:32px;max-width:32px;max-height:32px;min-width:32px;min-height:32px;flex:0 0 32px/
  );

  assert.match(
    responsive,
    /\.bottom-item svg\{width:32px;height:32px;max-width:32px;max-height:32px;min-width:32px;min-height:32px;flex:0 0 32px/
  );

  assert.match(
    components,
    /\.icon\{[^}]*max-width:none;max-height:none/
  );
});
