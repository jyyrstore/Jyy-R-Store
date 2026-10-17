const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('checkout API accepts explicit payment modes',()=>{
  const routes=read('src/routes/index.js');
  assert.match(routes,/z\.enum\(\['BALANCE','GATEWAY','SANDBOX','LIVE'\]\)/);
});

test('Sandbox is owner-only and Live explicitly disables test mode',()=>{
  const api=read('src/controllers/api.controller.js');
  const service=read('src/services/payment/payment.service.js');
  assert.match(api,/req\.profile\?\.role!=='OWNER'/);
  assert.match(api,/payment\.assertProviderReady\(\{testMode:paymentMode==='SANDBOX'\}\)/);
  assert.match(api,/\{paymentMode\}\s*\)/);
  assert.match(service,/const testMode=paymentMode==='SANDBOX'/);
  assert.match(service,/persistedOrderMode/);
  assert.match(api,/ORDER_PAYMENT_MODE_MISMATCH/);
  assert.match(service,/testMode,/);
  assert.match(service,/PAYMENT_MODE_MISMATCH/);
});

test('checkout UI exposes Sandbox only to Owner and Live to all users',()=>{
  const page=read('views/pages/checkout.ejs');
  const controller=read('src/controllers/page.controller.js');
  assert.match(page,/<% if\(isOwner\)\{ %>/);
  assert.match(page,/value="SANDBOX"/);
  assert.match(page,/value="LIVE"/);
  assert.match(controller,/sandboxAvailable/);
});

test('Sandbox order does not reserve stock',()=>{
  const order=read('src/services/order/order.service.js');
  const expiry=read('src/jobs/payment-expiration.job.js');
  assert.match(order,/paymentMode='LIVE'/);
  assert.match(order,/'SANDBOX'\s*:\s*'GATEWAY'/);
  assert.match(order,/if\(!isSandbox\)\s*\{\s*await client\.query\(/);
  assert.match(expiry,/order\.payment_method!=='SANDBOX'/);
  assert.match(expiry,/o\.payment_method in \('GATEWAY','SANDBOX'\)/);
});

test('Sandbox callback gives Owner test access without real stock or revenue side effects',()=>{
  const service=read('src/services/payment/payment.service.js');
  const page=read('views/pages/payment.ejs');
  const analytics=read('src/repositories/analytics.repository.js');
  const start=service.indexOf("if(providerName==='buatqris' && parsed.isTest){");
  const end=service.indexOf("    const current=String(payment.status||'PENDING').toUpperCase();",start);
  const sandbox=service.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(service,/PAYMENT_WEBHOOK_SANDBOX_PROCESSED/);
  assert.ok(sandbox.includes("const sandboxStoredStatus=next;"));
  assert.ok(sandbox.includes("paid_at=case when $2::order_status='PAID'"));
  assert.ok(sandbox.includes('delivery.createEntitlement'));
  assert.ok(sandbox.includes("role='OWNER'"));
  assert.ok(sandbox.includes('stockAndRevenueSideEffectsSuppressed:true'));
  assert.match(analytics,/payment_method is distinct from 'SANDBOX'/i);
  assert.match(service,/'SANDBOX'\s*&&/);
  assert.match(page,/Berhasil diterima \(simulasi\)/);
});

test('Production Sandbox requires an explicit opt-in',()=>{
  const env=read('.env.example');
  const api=read('src/controllers/api.controller.js');
  assert.match(env,/BUATQRIS_ALLOW_PRODUCTION_SANDBOX=false/);
  assert.match(api,/SANDBOX_PRODUCTION_DISABLED/);
});


test('Owner Sandbox simulation uses the authenticated server-side payment flow',()=>{
  const routes=read('src/routes/index.js');
  const api=read('src/controllers/api.controller.js');
  const service=read('src/services/payment/payment.service.js');
  const page=read('views/pages/payment.ejs');

  assert.ok(routes.includes(
    "apiRouter.post('/payment/:id/simulate',requireAuth,sensitiveRateLimit(),asyncHandler(api.paymentController.simulateSandbox));"
  ));
  assert.ok(api.includes('simulateSandbox:async(req,res)=>'));
  assert.ok(api.includes("req.profile?.role!=='OWNER'"));
  assert.ok(api.includes('payment.simulateSandboxPayment('));
  assert.ok(service.includes('async function simulateSandboxPayment(id,userId)'));
  assert.ok(service.includes("createHmac('sha256',env.BUATQRIS_SIGNING_SECRET)"));
  assert.ok(service.includes("role='OWNER'"));
  assert.ok(service.includes("payment_method||'').toUpperCase()!=='SANDBOX'"));
  assert.ok(page.includes('data-sandbox-simulate'));
  assert.ok(page.includes("paymentMode==='SANDBOX'"));
  assert.ok(page.includes('Simulasikan pembayaran berhasil'));
});

test('BuatQris status reconciliation runs server-side before expiry',()=>{
  const provider = read('src/config/payment.js');
  const service = read('src/services/payment/payment.service.js');
  const api = read('src/controllers/api.controller.js');
  const cron = read('src/controllers/cron.controller.js');

  assert.match(provider,/async checkStatus\(transactionId\)/);
  assert.match(provider,/api_check_status/);
  assert.match(service,/async function reconcileBuatQrisStatus/);
  assert.match(service,/_buatqrisStatusCheckedAt/);
  assert.match(service,/TOTAL_AMOUNT_MISMATCH/);
  assert.match(service,/createHmac\('sha256', env\.BUATQRIS_SIGNING_SECRET\)/);
  assert.match(api,/payment\.reconcileBuatQrisStatus\(req\.params\.id,req\.user\.id\)/);
  assert.match(cron,/reconcilePendingBuatQris/);
  assert.ok(
    cron.indexOf('reconcilePendingBuatQris') <
    cron.indexOf('paymentExpiration.run()'),
    'Status provider harus diperiksa sebelum pembayaran diexpire.'
  );
});
