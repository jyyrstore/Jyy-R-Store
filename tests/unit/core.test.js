const test=require('node:test');
const assert=require('node:assert/strict');
const {formatIDR}=require('../../src/utils/currency');
const {hmac}=require('../../src/utils/crypto');
const {pageParams}=require('../../src/utils/pagination');
const {icon}=require('../../src/utils/icons');
const {safeSameOriginUrl}=require('../../src/utils/url');


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


// BEGIN JYYR BUATQRIS TESTS
test('BuatQris sends form-urlencoded request and stores total_amount',async()=>{
  const {BuatQrisProvider}=require('../../src/config/payment');
  const originalFetch=global.fetch;
  let requestUrl='';
  let requestOptions;

  global.fetch=async(url,options)=>{
    requestUrl=String(url);
    requestOptions=options;
    return {
      ok:true,
      status:200,
      json:async()=>({
        success:true,
        data:{
          transaction_id:'BQ-UNIT-001',
          amount:1000,
          total_amount:1017,
          payment_url:'https://pay.example.test/BQ-UNIT-001',
          qr_url:'https://images.example.test/BQ-UNIT-001.png',
          expired_at:'2026-10-12T12:00:00+07:00',
          status:'pending',
          is_test:true
        }
      })
    };
  };

  try{
    const provider=new BuatQrisProvider({
      BUATQRIS_ACCOUNT_ID:'account-test',
      BUATQRIS_SECRET_TOKEN:'unit-test-secret-token-long-enough-123',
      BUATQRIS_SIGNING_SECRET:'unit-test-signing-secret',
      BUATQRIS_CALLBACK_URL:'https://jyyrsh.my.id/api/payment/webhook',
      BUATQRIS_FEE_BY:'buyer',
      BUATQRIS_QRIS_METHOD:'qris_two',
      BUATQRIS_TEST_MODE:true,
      PAYMENT_REQUEST_TIMEOUT_MS:15000,
      APP_NAME:'JYYR STORE',
      APP_URL:'https://jyyrsh.my.id'
    });

    const result=await provider.createPayment({
      orderId:'ORDER-UNIT-001',
      amount:1000,
      testMode:true
    });

    const form=new URLSearchParams(requestOptions.body);

    assert.equal(requestUrl,'https://api.buatqris.site');
    assert.equal(requestOptions.method,'POST');
    assert.match(
      requestOptions.headers['content-type'],
      /^application\/x-www-form-urlencoded/
    );
    assert.equal(form.get('action'),'api_create_qris');
    assert.equal(form.get('account_id'),'account-test');
    assert.equal(form.get('amount'),'1000');
    assert.equal(form.get('fee_by'),'buyer');
    assert.equal(form.get('qris_method'),'qris_two');
    assert.equal(form.get('test'),'1');
    assert.equal(
      form.get('callback_url'),
      'https://jyyrsh.my.id/api/payment/webhook'
    );
    assert.equal(result.reference,'BQ-UNIT-001');
    assert.equal(result.raw.totalAmount,1017);
    assert.equal(result.raw.isTest,true);
    assert.equal(result.paymentUrl,'https://pay.example.test/BQ-UNIT-001');
  }finally{
    global.fetch=originalFetch;
  }
});

test('BuatQris verifies sha256-prefixed HMAC over the raw body',()=>{
  const crypto=require('crypto');
  const {BuatQrisProvider}=require('../../src/config/payment');
  const secret='unit-test-signing-secret';
  const raw=Buffer.from(
    '{"event":"payment.success","transaction_id":"BQ-UNIT-002"}'
  );
  const signature='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  const provider=new BuatQrisProvider({BUATQRIS_SIGNING_SECRET:secret});

  assert.equal(provider.verifyWebhook(raw,signature),true);
  assert.equal(provider.verifyWebhook(raw,'sha256='+'0'.repeat(64)),false);
  assert.equal(provider.verifyWebhook(raw,''),false);
});

test('BuatQris maps success, expired, failed and the buyer total',()=>{
  const {BuatQrisProvider}=require('../../src/config/payment');
  const provider=new BuatQrisProvider({});
  const base={
    transaction_id:'BQ-UNIT-003',
    amount:1000,
    total_amount:1017,
    is_test:true
  };

  const success=provider.parseWebhook({
    ...base,event:'payment.success',status:'success'
  });
  const expired=provider.parseWebhook({
    ...base,event:'payment.expired',status:'expired'
  });
  const failed=provider.parseWebhook({
    ...base,event:'payment.failed',status:'failed'
  });

  assert.equal(success.reference,'BQ-UNIT-003');
  assert.equal(success.amount,1017);
  assert.equal(success.status,'SUCCESS');
  assert.equal(success.isTest,true);
  assert.equal(expired.status,'EXPIRED');
  assert.equal(failed.status,'FAILED');
});

test('BuatQris event identity is stable for repeated webhook deliveries',()=>{
  const {BuatQrisProvider}=require('../../src/config/payment');
  const provider=new BuatQrisProvider({});
  const event={
    event:'payment.success',
    transaction_id:'BQ-UNIT-004',
    status:'success',
    total_amount:1017
  };

  assert.equal(
    provider.parseWebhook(event).eventId,
    provider.parseWebhook({...event}).eventId
  );
  assert.notEqual(
    provider.parseWebhook(event).eventId,
    provider.parseWebhook({
      ...event,event:'payment.expired',status:'expired'
    }).eventId
  );
});
// END JYYR BUATQRIS TESTS

test('currency formatting is IDR-localized',()=>assert.match(formatIDR(15000),/15[.]000|Rp\s?15[.]000/i));
test('pagination clamps page/limit safely',()=>assert.deepEqual(pageParams({page:0,limit:500}),{page:1,limit:100,offset:0}));
test('webhook HMAC helper is deterministic',()=>assert.equal(hmac('hello','secret'),'88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b'));
test('payment return URLs stay same-origin',()=>{
  assert.equal(
    safeSameOriginUrl('https://store.example/orders/123','/orders','https://store.example'),
    'https://store.example/orders/123'
  );
  assert.equal(
    safeSameOriginUrl('https://attacker.example/steal','/orders','https://store.example'),
    'https://store.example/orders'
  );
  assert.equal(
    safeSameOriginUrl('/deposit','/orders','https://store.example'),
    'https://store.example/deposit'
  );
});

test('Xendit return URLs require HTTPS',()=>{
  const {XenditProvider}=require('../../src/config/payment');
  const provider=new XenditProvider({XENDIT_RETURN_URL:'https://store.example/success'});
  assert.equal(provider.normalizeReturnUrl(),'https://store.example/success');
  assert.equal(provider.normalizeHttpsUrl('', 'XENDIT_CANCEL_RETURN_URL'),null);
  assert.throws(
    ()=>provider.normalizeHttpsUrl('http://store.example/cancel','XENDIT_CANCEL_RETURN_URL'),
    /harus HTTPS/
  );
});
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

// BEGIN JYYR_BUATQRIS_STATUS_CONFLICT_TEST
test('BuatQris rejects conflicting event and body status',()=>{
  const {BuatQrisProvider}=require('../../src/config/payment');
  const parsed=new BuatQrisProvider({}).parseWebhook({
    event:'payment.success',
    transaction_id:'BQ-STATUS-CONFLICT',
    status:'failed',
    amount:1000,
    total_amount:1060,
    is_test:true
  });
  assert.equal(parsed.status,'');
});
// END JYYR_BUATQRIS_STATUS_CONFLICT_TEST
