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

// PROFILE UI/UX FINAL TESTS

test('profile page contains final identity and account summary',()=>{
  const source=read('views/pages/profile.ejs');

  assert.match(source,/class="profile-hero panel"/);
  assert.match(source,/data-profile-display/);
  assert.match(source,/data-profile-username/);
  assert.match(source,/data-profile-email/);
  assert.match(source,/class="profile-stat-grid"/);
  assert.match(source,/profile\.total_orders/);
  assert.match(source,/profile\.total_deposit/);
  assert.match(source,/profile\.balance/);
});

test('profile form has account-friendly controls',()=>{
  const source=read('views/pages/profile.ejs');

  assert.match(source,/id="profile-form"/);
  assert.match(source,/autocomplete="username"/);
  assert.match(source,/autocomplete="name"/);
  assert.match(source,/autocomplete="email"/);
  assert.match(source,/type="tel"/);
  assert.match(source,/inputmode="tel"/);
  assert.match(source,/maxlength="500"/);
  assert.match(source,/readonly/);
});

test('profile exposes security entry points',()=>{
  const source=read('views/pages/profile.ejs');

  assert.ok(
    (source.match(/href="\/security"/g)||[]).length>=2
  );

  assert.match(source,/Keamanan akun/);
});

test('profile login activity has responsive structure',()=>{
  const source=read('views/pages/profile.ejs');

  assert.match(source,/profile-login-list/);
  assert.match(source,/profile-login-item/);
  assert.match(source,/data-login-status=/);
  assert.match(source,/profile-login-time/);
});

test('profile save prevents duplicate submission',()=>{
  const source=read('public/js/pages.js');

  assert.match(source,/pf\.dataset\.submitting==='1'/);
  assert.match(source,/aria-busy/);
  assert.match(source,/Profil diperbarui/);
});

test('profile save updates identity without reload',()=>{
  const source=read('public/js/pages.js');

  assert.match(source,/data-profile-name/);
  assert.match(source,/data-profile-avatar/);
  assert.match(source,/data-profile-display/);
  assert.match(source,/data-profile-username/);
});

test('header exposes profile update hooks',()=>{
  const source=read('views/partials/header.ejs');

  assert.match(source,/data-profile-avatar/);
  assert.match(source,/data-profile-name/);
});

test('profile CSS is responsive',()=>{
  const source=read('public/css/pages.css');

  assert.match(source,/PROFILE PAGE FINAL UIUX START/);
  assert.match(source,/\.profile-stat-grid/);
  assert.match(source,/\.profile-login-item/);
  assert.match(source,/@media\(max-width:600px\)/);
});
