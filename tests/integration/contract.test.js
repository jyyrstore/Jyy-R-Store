const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const route=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');
const page=fs.readFileSync(path.join(root,'src/controllers/page.controller.js'),'utf8');
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync(path.join(root,'database/migrations',x),'utf8')).join('\n');
for(const r of ['/','/store','/product/:slug','/dashboard','/cart','/checkout','/orders','/deposit','/history','/profile','/tickets','/notifications','/messages','/services','/faq','/security','/owner']) test(`required route ${r}`,()=>assert.ok(route.includes(`'${r}'`),r));
for(const t of ['profiles','roles','categories','products','product_contents','carts','cart_items','orders','order_items','payments','payment_events','deposits','wallets','wallet_transactions','entitlements','download_logs','services','service_orders','tickets','ticket_messages','messages','notifications','notification_preferences','login_history','activity_logs','announcements','faqs','maintenance_settings','site_settings','refunds']) test(`schema includes ${t}`,()=>assert.match(migrations,new RegExp(`create table if not exists ${t}\\b`,'i')));
test('webhook route is raw-body protected before JSON parser',()=>{const server=fs.readFileSync(path.join(root,'server.js'),'utf8');const webhook=server.indexOf("app.use('/api/payment/webhook'");const json=server.indexOf('express.json');assert.ok(webhook!==-1&&json!==-1&&webhook<json)});

// BEGIN JYYR BUATQRIS CONTRACT TESTS
test('BuatQris and legacy Xendit callback routes coexist',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const routes=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');

  assert.match(server,/app\.use\('\/api\/payment\/webhook',\s*webhookRouter\)/);
  assert.match(server,/app\.use\('\/api\/webhook\/xendit',\s*legacyXenditWebhookRouter\)/);
  assert.match(routes,/createWebhookRouter\('xendit'\)/);
});

test('BuatQris webhook code scopes providers and guards sandbox/early events',()=>{
  const source=fs.readFileSync(
    path.join(root,'src/services/payment/payment.service.js'),
    'utf8'
  );

  assert.match(source,/lower\(provider\)=lower\(\$2\)/);
  assert.match(source,/PAYMENT_REFERENCE_NOT_READY/);
  assert.match(source,/PAYMENT_WEBHOOK_SANDBOX_IGNORED/);
  assert.match(source,/raw_reference\?\.totalAmount|assertBuatQrisTotalAmount\(parsed,payment\)/);
});

test('public content and preview require PUBLISHED products',()=>{
  const s=fs.readFileSync(path.join(root,'src/services/delivery/delivery.service.js'),'utf8');
  assert.match(s,/p\.status product_status/);
  assert.match(s,/if\(published\s*&& content\.access_type==='PUBLIC'\)/);
  assert.match(s,/if\(published\s*&& content\.access_type==='PREVIEW'/);
});
test('OWNER role cannot be assigned through the normal role API/repository',()=>{
  const repo=fs.readFileSync(path.join(root,'src/repositories/users.repository.js'),'utf8');
  const api=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  assert.match(repo,/OWNER_BOOTSTRAP_ONLY/);
  assert.match(api,/OWNER_BOOTSTRAP_ONLY/);
});
test('gateway order checks payment readiness before reserving stock',()=>{
  const s=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  assert.match(s,/payment\.assertProviderReady\(\);const created=await orders\.createGatewayOrder/);
});
test('deposit idempotency is scoped and lookup is user-bound',()=>{
  const s=fs.readFileSync(path.join(root,'src/services/deposit/deposit.service.js'),'utf8');
  assert.match(s,/scopedIdempotencyKey\('dep',userId,idempotencyKey\)/);
  assert.match(s,/scopedIdempotencyKey\('pdep',userId,requestKey\)/);
  assert.match(s,/paymentService\.assertProviderReady\(\)/);
  assert.match(s,/where user_id=\$1 and \(idempotency_key=\$2/);
});
test('deposit expiration updates pending deposits',()=>{
  const s=fs.readFileSync(path.join(root,'src/jobs/payment-expiration.job.js'),'utf8');
  assert.match(s,/update deposits set status='EXPIRED'/);
});


test('deposit placeholder is created before external provider call',()=>{
  const s=fs.readFileSync(
    path.join(root,'src/services/deposit/deposit.service.js'),
    'utf8'
  );
  const start=s.indexOf('async function createAndPay(');
  const placeholder=s.indexOf('insert into payments(',start);
  const providerCall=s.indexOf('paymentProvider.createPayment(',start);
  assert.ok(start>=0 && placeholder>start && providerCall>placeholder);
  assert.match(s,/select \* from deposits where id=\$1 and user_id=\$2 for update/);
  assert.match(s,/PAYMENT_PROVISIONING_IN_PROGRESS/);
  assert.match(s,/PROVIDER_RESULT_UNKNOWN/);
});


test('BuatQris order retry blocks uncertain placeholders',()=>{
  const s=fs.readFileSync(
    path.join(root,'src/services/payment/payment.service.js'),
    'utf8'
  );
  assert.match(s,/providerName==='buatqris'/);
  assert.match(s,/provisioningBlocked:true/);
  assert.match(s,/PAYMENT_PROVISIONING_IN_PROGRESS/);
  assert.match(s,/PROVIDER_RESULT_UNKNOWN/);
});

test('order payment locks follow order before payment',()=>{
  const s=fs.readFileSync(
    path.join(root,'src/services/payment/payment.service.js'),
    'utf8'
  );
  const start=s.indexOf('async function processWebhook(');
  const candidate=s.indexOf(
    'select * from payments where reference=$1 and lower(provider)=lower($2)',
    start
  );
  const orderLock=s.indexOf(
    'select * from orders where id=$1 for update',
    start
  );
  const paymentLock=s.indexOf(
    'select * from payments where id=$1 for update',
    start
  );
  assert.ok(start>=0 && candidate>start && orderLock>candidate);
  assert.ok(paymentLock>orderLock);

  const job=fs.readFileSync(
    path.join(root,'src/jobs/payment-expiration.job.js'),
    'utf8'
  );
  const loop=job.indexOf('for(const payment of expired)');
  const expiryOrderLock=job.indexOf(
    'select * from orders where id=$1 for update',
    loop
  );
  const expiryPaymentLock=job.indexOf(
    'select * from payments where id=$1 and status=',
    loop
  );
  assert.ok(loop>=0 && expiryOrderLock>loop);
  assert.ok(expiryPaymentLock>expiryOrderLock);
});

test('payment webhook preserves provider metadata',()=>{
  const s=fs.readFileSync(
    path.join(root,'src/services/payment/payment.service.js'),
    'utf8'
  );
  assert.match(
    s,
    /raw_reference=coalesce\(raw_reference,'\{\}'::jsonb\)\|\|jsonb_build_object\('_lastWebhook',\$4::jsonb\)/
  );
  assert.match(s,/reference=coalesce\(reference,\$2\)/);
});

test('BuatQris production config has no Xendit token dependency',()=>{
  const s=fs.readFileSync(
    path.join(root,'src/config/env.js'),
    'utf8'
  );
  const start=s.indexOf("} else if (paymentProvider === 'buatqris') {");
  const end=s.indexOf(
    "} else if (paymentProvider === 'generic-json') {",
    start
  );
  assert.ok(start>=0 && end>start);
  const block=s.slice(start,end);
  assert.match(block,/BUATQRIS_SIGNING_SECRET/);
  assert.doesNotMatch(block,/XENDIT_WEBHOOK_TOKEN/);
});

// END JYYR BUATQRIS CONTRACT TESTS

test('owner APIs require auth + owner middleware',()=>assert.match(route,/const ownerApi=express\.Router\(\); ownerApi\.use\(requireAuth,requireOwner\)/));
test('owner extended sections are routed',()=>{for(const r of ['roles','messages','storage','login-history','system','top-orders']) assert.ok(page.includes(`'${r}'`),r)});
test('explicit owner URL routes exist',()=>{assert.match(route,/owner\.get\('\/products\/create'/);assert.match(route,/ownerApi\.get\('\/top-orders'/)});
test('owner order fulfillment status API is routed',()=>{assert.match(route,/ownerApi\.post\('\/orders\/:id\/status'/);assert.match(fs.readFileSync(path.join(root,'src/services/order/order.service.js'),'utf8'),/ownerUpdateStatus/)});
test('service metadata migration exists',()=>assert.ok(fs.existsSync(path.join(root,'database/migrations/029_service_metadata.sql'))));
test('views do not read process.env directly',()=>{for(const f of fs.readdirSync(path.join(root,'views'),{recursive:true}).filter(x=>x.endsWith('.ejs'))){const s=fs.readFileSync(path.join(root,'views',f),'utf8');assert.doesNotMatch(s,/process\.env\./,f)}});

test('owner content editor uses contextual fields',()=>{
  const js=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    js,
    /data-owner-content-field="file"/
  );

  assert.match(
    js,
    /data-owner-content-field="text"/
  );

  assert.match(
    js,
    /data-owner-content-field="url"/
  );

  assert.match(
    js,
    /data-owner-content-type/
  );

  assert.match(
    js,
    /data-owner-content-access/
  );
});

test('PREVIEW content automatically enables preview semantics',()=>{
  const js=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    js,
    /isPreview\s*:/
  );

  assert.match(
    js,
    /is_preview\s*:\s*access==='PREVIEW'/
  );
});

test('owner publish UI has readiness checklist',()=>{
  const js=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    js,
    /owner-publish-checklist/
  );

  assert.match(
    js,
    /data-owner-publish/
  );

  assert.match(
    js,
    /canPublish/
  );
});

test('Supabase Auth is isolated from admin Storage client',()=>{
  const supabase=fs.readFileSync(
    path.join(root,'src/config/supabase.js'),
    'utf8'
  );

  const auth=fs.readFileSync(
    path.join(root,'src/services/auth/auth.service.js'),
    'utf8'
  );

  const storage=fs.readFileSync(
    path.join(root,'src/config/storage.js'),
    'utf8'
  );

  assert.match(
    supabase,
    /function supabaseAdmin\(/
  );

  assert.match(
    supabase,
    /function supabasePublic\(/
  );

  assert.match(
    auth,
    /supabasePublic\(\)/
  );

  assert.doesNotMatch(
    auth,
    /supabase\(\)\.auth\./
  );

  assert.match(
    storage,
    /supabaseAdmin\(\)/
  );
});

test('general limiter skips routes already protected by sensitive limiter',()=>{
  const security=fs.readFileSync(
    path.join(
      root,
      'src/middleware/security.middleware.js'
    ),
    'utf8'
  );

  assert.match(
    security,
    /sensitiveApiPrefixes/
  );

  assert.match(
    security,
    /kind==='general'[\s\S]{0,200}isSensitiveApiPath\(req\)/
  );
});

test('API mutation requests are deduplicated and have loading feedback',()=>{
  const api=fs.readFileSync(
    path.join(root,'public/js/api.js'),
    'utf8'
  );

  assert.match(
    api,
    /const inFlight=new Map\(\)/
  );

  assert.match(
    api,
    /if\(existing\)\s*\{\s*return existing;/
  );

  assert.match(
    api,
    /jyyr-request-progress/
  );

  assert.match(
    api,
    /retryAfter/
  );
});

test('API 429 responses create a client cooldown',()=>{
  const api=fs.readFileSync(
    path.join(root,'public/js/api.js'),
    'utf8'
  );

  assert.match(
    api,
    /const cooldowns=new Map\(\)/
  );

  assert.match(
    api,
    /function getCooldownError/
  );

  assert.match(
    api,
    /cooldowns\.set\(/
  );

  assert.match(
    api,
    /res\.status===429 && retryAfter>0/
  );
});


test('Cover Produk uses signed direct upload instead of TUS',()=>{
  const controller=fs.readFileSync(
    path.join(root,'src/controllers/api.controller.js'),
    'utf8'
  );

  const pages=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    controller,
    /signedUrl:signed\.signedUrl/
  );

  assert.match(
    pages,
    /function uploadSignedFile\(/
  );

  assert.match(
    pages,
    /xhr\.open\('PUT',signedUrl,true\)/
  );

  assert.match(
    pages,
    /contentType==='THUMBNAIL'/
  );

  assert.match(
    pages,
    /uploadSignedFile\(\s*file,\s*init\.signedUrl/
  );
});

test('content file is cleared only when content type changes',()=>{
  const js=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    js,
    /ownerContentLastType/
  );

  assert.match(
    js,
    /if\(\s*lastType\s*&&\s*lastType!==type\s*\)\s*\{\s*file\.value=''/
  );
});

test('owner content UI has single active submit state',()=>{
  const js=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(
    js,
    /cfm\.dataset\.submitting/
  );

  assert.match(
    js,
    /aria-busy/
  );

  assert.match(
    js,
    /Mengunggah…/
  );
});


test('scheduled expiry route is protected and configured for GitHub Actions Cron',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const routes=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');
  const cron=fs.readFileSync(path.join(root,'src/controllers/cron.controller.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/cron.yml'),'utf8');

  assert.match(server,/app\.use\('\/api\/cron',\s*cronRouter\)/);
  assert.match(routes,/cronRouter\.get\('\/expire',cron\.requireCronSecret/);
  assert.match(cron,/CRON_SECRET/);
  assert.match(workflow,/cron:\s*'\*\/5 \* \* \* \*'/);
  assert.match(workflow,/secrets\.CRON_SECRET/);
  assert.match(workflow,/APP_URL:\s*\$\{\{\s*secrets\.APP_URL\s*\}\}/);
assert.match(workflow,/\$\{APP_URL%\/\}\/api\/cron\/expire/);
});

// BEGIN JYYR_BUATQRIS_ISOLATED_ROUTE_TEST
test('BuatQris route is isolated and mounted before JSON parsing',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const root=path.resolve(__dirname,'../..');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const routes=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');

  assert.match(
    server,
    /app\.use\('\/api\/payment\/webhook\/buatqris',\s*buatQrisWebhookRouter\)/
  );
  assert.match(routes,/createWebhookRouter\('buatqris'\)/);
  assert.match(
    routes,
    /processWebhook\(raw,signature,payload,providerName\)/
  );

  const specific=server.indexOf(
    "app.use('/api/payment/webhook/buatqris', buatQrisWebhookRouter)"
  );
  const generic=server.indexOf(
    "app.use('/api/payment/webhook', webhookRouter)"
  );
  const parser=server.indexOf('app.use(express.json');

  assert.ok(specific>=0 && generic>specific);
  assert.ok(parser>specific);
});
// END JYYR_BUATQRIS_ISOLATED_ROUTE_TEST


// Contracts for late successful order-payment callbacks.
{
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/services/payment/payment.service.js'),
    'utf8'
  );

  test('late paid order requires reconciliation contract', () => {
    assert.match(source, /const lateOrderPayment=/);
    assert.match(
      source,
      /PAYMENT_PAID_ORDER_REQUIRES_RECONCILIATION/
    );
    assert.match(
      source,
      /if\s*\(\s*next==='PAID'\s*&&\s*order\.status==='PENDING'\s*\)/
    );
  });

  test('order ID recovery includes terminal payment states', () => {
    assert.match(
      source,
      /status in \('PENDING','PAID','FAILED','EXPIRED','CANCELLED'\) order by created_at desc limit 1/
    );
  });
}


// Contract for safe retries of BuatQris pre-request failures.
{
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const source = fs.readFileSync(
    path.join(__dirname, '../../src/services/payment/payment.service.js'),
    'utf8'
  );

  test('BuatQris retries only when request was definitely not sent', () => {
    assert.match(source, /PROVIDER_REQUEST_NOT_SENT/);
    assert.match(source, /PROVIDER_RESULT_UNKNOWN/);
    assert.match(source, /PROVIDER_RETRY_IN_PROGRESS/);
    assert.match(
      source,
      /existing\.raw_reference\?\.state\s*===\s*'PROVIDER_REQUEST_NOT_SENT'/
    );
    assert.match(source, /BUATQRIS_INVALID_AMOUNT/);
    assert.match(source, /BUATQRIS_FEE_CONFIG_INVALID/);
    assert.match(source, /BUATQRIS_METHOD_CONFIG_INVALID/);
  });
}


// Verify expiry is checked using the current database clock.
{
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');

  const paymentSource = fs.readFileSync(
    path.join(__dirname, '../../src/services/payment/payment.service.js'),
    'utf8'
  );
  const expirySource = fs.readFileSync(
    path.join(__dirname, '../../src/jobs/payment-expiration.job.js'),
    'utf8'
  );

  test('BuatQris checks expiry before retrying a placeholder', () => {
    assert.match(
      paymentSource,
      /expires_at is null or expires_at <= clock_timestamp\(\)/
    );
    assert.match(paymentSource, /provisioningReason:'PAYMENT_EXPIRED'/);
    assert.match(
      paymentSource,
      /expires_at=clock_timestamp\(\)\+interval '30 minutes'/
    );
  });

  test('expiration job checks current expiry while locking payment', () => {
    assert.match(
      expirySource,
      /status='PENDING' and expires_at is not null and expires_at < clock_timestamp\(\) for update/
    );
  });
}
