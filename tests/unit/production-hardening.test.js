const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');

function read(file){
  return fs.readFileSync(path.join(root,file),'utf8');
}

test('cart quantity is atomically capped at 100',()=>{
  const source=read('src/repositories/cart.repository.js');

  assert.match(
    source,
    /where cart_items\.quantity\+excluded\.quantity<=100/
  );

  assert.match(
    source,
    /CART_QUANTITY_LIMIT/
  );
});

test('orders pagination is clamped',()=>{
  const source=read('src/repositories/orders.repository.js');

  assert.match(source,/function safeLimit/);
  assert.match(source,/function safeOffset/);
  assert.match(source,/Math\.min\(100,Math\.max\(1,n\)\)/);
});

test('deposit pagination is clamped',()=>{
  const source=read('src/repositories/deposits.repository.js');

  assert.match(source,/function safeLimit/);
  assert.match(source,/Math\.min\(100,Math\.max\(1,n\)\)/);
});

test('product events reject unknown types',()=>{
  const source=read('src/repositories/products.repository.js');

  assert.match(source,/PRODUCT_EVENT_TYPES/);
  assert.match(source,/INVALID_PRODUCT_EVENT/);
});

test('payment provider call is outside the DB transaction',()=>{
  const source=read('src/services/payment/payment.service.js');

  const prepared=source.indexOf('const prepared=await withTransaction');
  const providerCall=source.indexOf('const result=await provider().createPayment',prepared);
  const finalize=source.indexOf('return await withTransaction',providerCall);

  assert.ok(prepared>=0);
  assert.ok(providerCall>prepared);
  assert.ok(finalize>providerCall);
});

test('liveness and readiness endpoints exist',()=>{
  const source=read('server.js');

  assert.match(source,/app\.get\('\/live'/);
  assert.match(source,/app\.get\('\/ready'/);
  assert.match(source,/await db\(\)\.query\('select 1'\)/);
});

test('production hardening migration contains critical indexes',()=>{
  const source=read('database/migrations/033_production_hardening.sql');

  assert.match(source,/idx_notification_reads_user_notification/);
  assert.match(source,/idx_notifications_broadcast_created_at/);
  assert.match(source,/idx_orders_status_created_at/);
  assert.match(source,/idx_payments_status_created_at/);
  assert.match(source,/idx_idempotency_keys_created_at/);
});

test('CI requires lint',()=>{
  const testWorkflow=read('.github/workflows/test.yml');
  const deployWorkflow=read('.github/workflows/deploy.yml');
  const securityWorkflow=read('.github/workflows/security.yml');

  assert.match(testWorkflow,/npm run lint/);
  assert.match(deployWorkflow,/npm run lint/);
  assert.match(securityWorkflow,/npm run lint/);
});
