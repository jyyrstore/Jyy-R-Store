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

test('Sandbox callback records simulation without payment fulfillment',()=>{
  const service=read('src/services/payment/payment.service.js');
  const page=read('views/pages/payment.ejs');
  assert.match(service,/PAYMENT_WEBHOOK_SANDBOX_PROCESSED/);
  assert.match(service,/sandboxStoredStatus=next==='PAID'\?'CANCELLED':next/);
  assert.match(service,/'SANDBOX'\s*&&/);
  assert.match(page,/Berhasil diterima \(simulasi\)/);
});

test('Production Sandbox requires an explicit opt-in',()=>{
  const env=read('.env.example');
  const api=read('src/controllers/api.controller.js');
  assert.match(env,/BUATQRIS_ALLOW_PRODUCTION_SANDBOX=false/);
  assert.match(api,/SANDBOX_PRODUCTION_DISABLED/);
});
