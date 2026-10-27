const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const route=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');
const page=fs.readFileSync(path.join(root,'src/controllers/page.controller.js'),'utf8');
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync(path.join(root,'database/migrations',x),'utf8')).join('\n');
for(const r of ['/','/store','/product/:slug','/dashboard','/cart','/checkout','/orders','/deposit','/history','/profile','/tickets','/notifications','/messages','/services','/faq','/security','/owner']) test(`required route ${r}`,()=>assert.ok(route.includes(`'${r}'`),r));
for(const t of ['profiles','roles','categories','products','product_variants','product_contents','carts','cart_items','orders','order_items','payments','payment_events','deposits','wallets','wallet_transactions','entitlements','download_logs','services','service_orders','tickets','ticket_messages','messages','notifications','notification_preferences','login_history','activity_logs','announcements','faqs','maintenance_settings','site_settings','refunds']) test(`schema includes ${t}`,()=>assert.match(migrations,new RegExp(`create table if not exists ${t}\\b`,'i')));
test('duplicate Owner category names return a dedicated toast',()=>{
  const api=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  const browser=fs.readFileSync(path.join(root,'public/js/pages.js'),'utf8');

  assert.ok(api.includes("error?.code==='23505'"));
  assert.ok(api.includes("error?.constraint==='categories_name_key'"));
  assert.ok(api.includes("code:'CATEGORY_ALREADY_EXISTS'"));
  assert.ok(api.includes("new Error('Nama kategori sudah digunakan. Silakan pilih nama lain.')"));
  assert.equal((api.match(/throw normalizeCategoryWriteError\(error\)/g)||[]).length,2);
  assert.ok(browser.includes("if(err.code==='CATEGORY_ALREADY_EXISTS')toast.error(err.message,{title:'Category Sudah Dimiliki'});else toast.error(err.message)"));
});


test('Owner category deletion is owner-protected and keeps products',()=>{
  const repository=fs.readFileSync(
    path.join(root,'src/repositories/categories.repository.js'),
    'utf8'
  );
  const controller=fs.readFileSync(
    path.join(root,'src/controllers/api.controller.js'),
    'utf8'
  );
  const ownerView=fs.readFileSync(
    path.join(root,'views/owner/index.ejs'),
    'utf8'
  );
  const browser=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.ok(route.includes(
    "ownerApi.delete('/categories/:id',asyncHandler(api.ownerController.categoryDelete));"
  ));
  assert.ok(repository.includes(
    "delete from categories where id=$1 returning *"
  ));
  assert.match(controller,/categoryDelete:async\(req,res\)=>/);
  assert.match(controller,/code:'CATEGORY_NOT_FOUND'/);
  assert.match(controller,/action:'DELETE_CATEGORY'/);
  assert.ok(ownerView.includes(
    'data-owner-delete-category="<%= row.id %>"'
  ));
  assert.ok(browser.includes(
    "window.JYYRModal.confirm('Hapus kategori ini? Produk yang menggunakan kategori ini akan tetap ada tanpa kategori.')"
  ));
  assert.ok(browser.includes(
    "ownerAction('/api/owner/categories/'+encodeURIComponent(deleteCat.dataset.ownerDeleteCategory),{},'DELETE','Kategori dihapus.')"
  ));
  assert.match(
    migrations,
    /category_id uuid references categories\(id\) on delete set null/i
  );
});

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
  assert.match(s,/if\(!content\.variant_id\s*&&\s*published\s*&&\s*content\.access_type==='PUBLIC'\)/);
  assert.match(s,/if\(\s*!content\.variant_id\s*&&\s*published\s*&&\s*content\.access_type==='PREVIEW'/);
});

test('variant-specific content preserves shared legacy access and checks the purchased variant',()=>{
  const migration=fs.readFileSync(
    path.join(root,'database/migrations/042_product_content_variants.sql'),
    'utf8'
  );
  const repository=fs.readFileSync(
    path.join(root,'src/repositories/products.repository.js'),
    'utf8'
  );
  const controller=fs.readFileSync(
    path.join(root,'src/controllers/api.controller.js'),
    'utf8'
  );
  const routes=fs.readFileSync(
    path.join(root,'src/routes/index.js'),
    'utf8'
  );
  const browser=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );
  const delivery=fs.readFileSync(
    path.join(root,'src/services/delivery/delivery.service.js'),
    'utf8'
  );
  const page=fs.readFileSync(
    path.join(root,'src/controllers/page.controller.js'),
    'utf8'
  );
  const orders=fs.readFileSync(
    path.join(root,'src/repositories/orders.repository.js'),
    'utf8'
  );

  assert.match(migration,/add column if not exists variant_id uuid/i);
  assert.match(
    migration,
    /foreign key\s*\(variant_id,\s*product_id\)\s*references product_variants\(id,\s*product_id\)\s*on delete cascade/i
  );
  assert.match(repository,/const variantMap=new Map\(\)/);
  assert.match(repository,/variantMap\.set\(String\(v\.id\),String\(copiedVariant\.id\)\)/);
  assert.match(repository,/const activeByLabel=new Map/);
  assert.match(repository,/pc\.variant_id is null or pc\.variant_id=\$2/);
  assert.match(controller,/PRODUCT_VARIANT_CONTENT_PRIVATE/);
  assert.match(controller,/variant_id:variantId/);
  assert.match(routes,/variant_id:z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(routes,/variantId:z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(browser,/data-owner-content-variant/);
  assert.match(browser,/variantId:meta\.variantId\|\|null/);
  assert.match(browser,/variant_id:variantId/);
  assert.match(delivery,/oi\.variant_id=\$3/);
  assert.match(delivery,/e\.status='ACTIVE'/);
  assert.match(delivery,/!content\.variant_id/);
  assert.match(page,/productRepo\.contents\(item\.product_id,\s*\{\s*variantId:item\.variant_id\|\|null,\s*forOrder:true\s*\}\)/);
  assert.match(orders,/'variant_id',oi\.variant_id/);
});
test('OWNER role cannot be assigned through the normal role API/repository',()=>{
  const repo=fs.readFileSync(path.join(root,'src/repositories/users.repository.js'),'utf8');
  const api=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  assert.match(repo,/OWNER_BOOTSTRAP_ONLY/);
  assert.match(api,/OWNER_BOOTSTRAP_ONLY/);
});
test('gateway order checks payment readiness before reserving stock',()=>{
  const s=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  assert.match(s,/payment\.assertProviderReady\(\{testMode:paymentMode==='SANDBOX'\}\);[\s\S]*?orders\.createGatewayOrder/);
});
test('checkout and deposit retries reuse stable keys and prevent payment-mode crossover',()=>{
  const browser=fs.readFileSync(path.join(root,'public/js/pages.js'),'utf8');
  const controller=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  const orderService=fs.readFileSync(path.join(root,'src/services/order/order.service.js'),'utf8');

  assert.match(browser,/function beginIdempotentAction/);
  assert.match(browser,/idempotencyKey:checkoutAction\.key/);
  assert.match(browser,/idempotencyKey:depositAction\.key/);
  assert.match(browser,/completeIdempotentAction\(checkoutAction\)/);
  assert.match(browser,/completeIdempotentAction\(depositAction\)/);
  assert.match(controller,/assertOrderPaymentMode\(created\.order,'BALANCE'\)/);
  assert.match(controller,/assertOrderPaymentMode\(created\.order,paymentMode\)/);
  assert.equal((orderService.match(/await resolveIdempotencyConflict\(error,userId,idempotencyKey\)/g)||[]).length,2);
});
test('deposit idempotency is scoped and lookup is user-bound',()=>{
  const s=fs.readFileSync(path.join(root,'src/services/deposit/deposit.service.js'),'utf8');
  assert.match(s,/scopedIdempotencyKey\('dep',userId,idempotencyKey\)/);
  assert.match(s,/scopedIdempotencyKey\('pdep',userId,requestKey\)/);
  assert.match(s,/paymentService\.assertProviderReady\(\)/);
  assert.match(s,/where user_id=\$1 and \(idempotency_key=\$2/);
});
test('paid deposit webhook retries and expiry races are reconciled idempotently',()=>{
  const payment=fs.readFileSync(
    path.join(root,'src/services/payment/payment.service.js'),
    'utf8'
  );
  const expiry=fs.readFileSync(
    path.join(root,'src/services/deposit/expiration.service.js'),
    'utf8'
  );
  const cron=fs.readFileSync(
    path.join(root,'src/controllers/cron.controller.js'),
    'utf8'
  );

  assert.match(payment,/async function settlePaidDeposit/);
  assert.match(payment,/lateDepositPayment/);
  assert.match(payment,/PAYMENT_DEPOSIT_RECONCILIATION_REQUIRED/);
  assert.match(payment,/async function reconcilePaidDeposits/);
  assert.match(payment,/metadata->>'requestedStatus'='PAID'/);
  assert.match(
    expiry,
    /not exists\s*\(\s*select 1\s+from payments p[\s\S]*?p\.status in \('PENDING','PAID'\)/
  );
  assert.match(cron,/paymentService\.reconcilePaidDeposits/);
  assert.match(cron,/depositReconciliation/);
});

test('checkout idempotency key is independent of payment method and reflects intent',()=>{
  const browser=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );
  const template=fs.readFileSync(
    path.join(root,'views/pages/checkout.ejs'),
    'utf8'
  );

  assert.match(template,/data-checkout-intent=/);

  const start=browser.indexOf(
    'const checkoutAction=beginIdempotentAction('
  );
  const end=browser.indexOf('checkout.disabled=true;',start);

  assert.ok(start>=0&&end>start,'Checkout idempotency action is absent.');

  const action=browser.slice(start,end);
  assert.match(action,/checkout\.dataset\.checkoutIntent/);
  assert.doesNotMatch(action,/paymentMethod\s*:/);
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
  assert.match(s,/paymentExpiryFallbackMinutes/);
  assert.match(s,/fallbackExpiryMinutes\*60\*1000/);
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




test('Owner ticket status trigger centers its vertical dots',()=>{
  const ownerTicketView=fs.readFileSync(
    path.join(root,'views/owner/ticket-detail.ejs'),
    'utf8'
  );
  const css=fs.readFileSync(
    path.join(root,'public/css/pages.css'),
    'utf8'
  );

  assert.match(
    ownerTicketView,
    /<span class="owner-ticket-status-dots" aria-hidden="true"><\/span>/
  );
  assert.match(
    ownerTicketView,
    /<span data-jyyr-select-label hidden><%= ticketStatus %><\/span>/
  );
  assert.match(
    ownerTicketView,
    /<span class="jyyr-select-chevron" aria-hidden="true" hidden><\/span>/
  );
  assert.doesNotMatch(
    ownerTicketView,
    />[ \t]+<span class="owner-ticket-status-dots"/,
    'Markup ikon harus berada pada baris terpisah.'
  );

  const button=css.match(
    /\.owner-ticket-detail-page\s+\.owner-ticket-status-trigger\s*\{([^}]+)\}/
  );
  assert.ok(button,'CSS tombol status harus tersedia.');
  assert.match(button[1],/position\s*:\s*relative\s*;/);
  assert.match(button[1],/width\s*:\s*38px\s*;/);
  assert.match(button[1],/height\s*:\s*38px\s*;/);
  assert.match(button[1],/display\s*:\s*grid\s*;/);
  assert.match(button[1],/place-items\s*:\s*center\s*;/);
  assert.match(button[1],/border-radius\s*:\s*50%\s*;/);

  const dots=css.match(/\.owner-ticket-status-dots\s*\{([^}]+)\}/);
  assert.ok(dots,'CSS tiga titik harus tersedia.');
  assert.match(dots[1],/position\s*:\s*absolute\s*;/);
  assert.match(dots[1],/left\s*:\s*50%\s*;/);
  assert.match(dots[1],/top\s*:\s*50%\s*;/);
  assert.match(dots[1],/transform\s*:\s*translate\(-50%,-50%\)\s*;/);
  assert.match(
    dots[1],
    /box-shadow\s*:\s*0\s+-7px\s+0\s+currentColor,\s*0\s+7px\s+0\s+currentColor\s*;/
  );

  const card=css.match(
    /\.owner-ticket-detail-page\s+\.message-detail-card\s*\{([^}]+)\}/
  );
  assert.ok(card,'CSS kartu detail Owner harus tersedia.');
  assert.match(card[1],/backdrop-filter\s*:\s*none\s*;/);
  assert.match(card[1],/-webkit-backdrop-filter\s*:\s*none\s*;/);
});







test('Messages filter text is centered inside its chip',()=>{
  const css=fs.readFileSync(
    path.join(root,'public/css/pages.css'),
    'utf8'
  );

  const rule=css.match(/\.messages-filter\s*\{([^}]+)\}/);

  assert.ok(rule,'CSS messages filter harus tersedia.');
  assert.match(rule[1],/display\s*:\s*inline-flex\s*;/);
  assert.match(rule[1],/align-items\s*:\s*center\s*;/);
  assert.match(rule[1],/justify-content\s*:\s*center\s*;/);
  assert.match(rule[1],/box-sizing\s*:\s*border-box\s*;/);
});



test('Owner ticket cards use whole-card navigation',()=>{
  const ownerView=fs.readFileSync(
    path.join(root,'views/owner/index.ejs'),
    'utf8'
  );
  const css=fs.readFileSync(
    path.join(root,'public/css/pages.css'),
    'utf8'
  );

  const marker='class="message-chat-row owner-ticket-row"';
  assert.equal(
    (ownerView.match(/class="message-chat-row owner-ticket-row"/g)||[]).length,
    1
  );

  const markerIndex=ownerView.indexOf(marker);
  const cardStart=ownerView.lastIndexOf('<a',markerIndex);
  const cardEnd=ownerView.indexOf('</a>',markerIndex);

  assert.ok(cardStart>=0&&cardEnd>markerIndex,'Kartu harus berupa anchor.');
  const card=ownerView.slice(cardStart,cardEnd+4);

  assert.match(card,/href="\/owner\/tickets\/<%= row\.id %>"/);
  assert.match(card,/data-message-row/);
  assert.match(card,/data-message-search-text=/);
  assert.doesNotMatch(card,/owner-ticket-action|Lihat\s*\/\s*Balas/);
  assert.equal(
    (card.match(/<a\b/g)||[]).length,
    1,
    'Kartu tidak boleh berisi anchor bersarang.'
  );

  const rowRule=css.match(/\.owner-ticket-row\s*\{([^{}]+)\}/);
  assert.ok(rowRule,'CSS kartu tiket harus tersedia.');
  assert.match(
    rowRule[1],
    /grid-template-columns\s*:\s*48px\s+minmax\(0,1fr\)\s*;/
  );
  assert.match(rowRule[1],/cursor\s*:\s*pointer\s*;/);
  assert.doesNotMatch(css,/\.owner-ticket-action\b/);
});


test('Owner ticket detail route is protected and wired to its detail template',()=>{
  const ownerRoutes=fs.readFileSync(
    path.join(root,'src/routes/index.js'),
    'utf8'
  );
  const ownerPage=fs.readFileSync(
    path.join(root,'src/controllers/page.controller.js'),
    'utf8'
  );
  const ownerTicketView=fs.readFileSync(
    path.join(root,'views/owner/ticket-detail.ejs'),
    'utf8'
  );

  const ownerRouter=ownerRoutes.indexOf(
    'const owner=express.Router(); owner.use(requireAuth,requireOwner)'
  );
  const detailRoute=ownerRoutes.indexOf(
    "owner.get('/tickets/:id',asyncHandler(page.ownerTicketDetail));"
  );

  assert.ok(ownerRouter>=0,'Owner router must enforce authentication and Owner authorization');
  assert.ok(detailRoute>ownerRouter,'Owner ticket detail route must use the protected Owner router');
  assert.match(
    ownerPage,
    /async function ownerTicketDetail\(req,res,next\)[\s\S]*?repo\.detail\(req\.params\.id\)[\s\S]*?view:'owner\/ticket-detail'/
  );
  assert.match(ownerTicketView,/data-owner-ticket-form/);
  assert.match(ownerTicketView,/data-initial-status="<%= ticketStatus %>"/);
  assert.match(ownerTicketView,/class="[^"]*\bowner-ticket-status-menu\b[^"]*"/);
});

test('Owner ticket list no longer uses its legacy popup opener',()=>{
  const ownerView=fs.readFileSync(
    path.join(root,'views/owner/index.ejs'),
    'utf8'
  );
  const browser=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  assert.match(ownerView,/href="\/owner\/tickets\/<%= row\.id %>"/);
  assert.doesNotMatch(browser,/e\.target\.closest\('\[data-owner-ticket\]'\)/);
});

test('Owner ticket replies keep automatic REPLIED unless a different status is selected',()=>{
  const browser=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );
  const ownerTicketView=fs.readFileSync(
    path.join(root,'views/owner/ticket-detail.ejs'),
    'utf8'
  );
  const ticketService=fs.readFileSync(
    path.join(root,'src/services/support/ticket.service.js'),
    'utf8'
  );

  const start=browser.indexOf(
    "const tf=e.target.closest('[data-owner-ticket-form]')"
  );
  const end=browser.indexOf(
    "const rf=e.target.closest('[data-refund-form]')",
    start
  );

  assert.ok(start>=0&&end>start,'Owner ticket submit handler must exist');
  const handler=browser.slice(start,end);

  assert.ok(handler.includes('const initialStatus=String('));
  assert.ok(handler.includes('nextStatus&&nextStatus!==initialStatus'));
  assert.ok(handler.includes('if(hasReply){'));
  assert.ok(handler.includes('if(updateStatus){'));
  assert.ok(handler.includes("'/api/owner/tickets/'+fd.id+'/reply'"));
  assert.ok(handler.includes("'/api/owner/tickets/'+fd.id+'/status'"));
  assert.match(ticketService,/await repo\.setStatus\(ticketId,'REPLIED'\)/);

  const bodyField=ownerTicketView.match(
    /<textarea\b[^>]*name="body"[\s\S]*?<\/textarea>/
  );

  assert.ok(bodyField,'Owner ticket reply textarea must exist');
  assert.doesNotMatch(
    bodyField[0],
    /\brequired\b/,
    'Changing a status must not require a reply body'
  );
});

test('Messages search and composer legacy rules stay removed',()=>{
  const css=fs.readFileSync(
    path.join(root,'public/css/pages.css'),
    'utf8'
  );

  const start=css.indexOf('/* =========================================================\n   MESSAGES / CHAT UI');
  const end=css.indexOf('/* MESSAGES SEARCH INPUT — CANONICAL */');

  assert.ok(start>=0&&end>start,'Messages CSS and canonical search section must exist');

  const legacy=css.slice(start,end);
  const selectors=[
    '.messages-search',
    '.messages-search:focus-within',
    '.messages-search-icon',
    '.messages-search input',
    '.messages-search input::placeholder',
    '.messages-compose-form',
    '.messages-compose-field',
    '.messages-compose-field textarea',
    '.messages-compose-field textarea:focus',
    '.messages-compose-field textarea::placeholder',
    '.messages-send-button',
    '.messages-send-button .icon'
  ];

  for(const selector of selectors){
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.doesNotMatch(
      legacy,
      new RegExp('^[\\t ]*'+escaped+'[\\t ]*\\{','m'),
      `Legacy duplicate CSS rule remains: ${selector}`
    );
  }

  assert.equal(
    (css.match(/MESSAGES SEARCH INPUT — CANONICAL/g)||[]).length,
    1
  );
  assert.equal(
    (css.match(/MESSAGES COMPOSER — CANONICAL/g)||[]).length,
    1
  );
});


test('owner extended sections are routed',()=>{for(const r of ['roles','messages','storage','login-history','system','top-orders']) assert.ok(page.includes(`'${r}'`),r)});
test('explicit owner URL routes exist',()=>{
  assert.match(route,/owner\.get\('\/products\/create'/);

  for(const section of ['create_produk','edit_produk','content_produk']){
    assert.ok(
      route.includes(`owner.get('/products/${section}',asyncHandler(page.ownerPage('${section}')));`),
      section
    );
  }

  assert.match(route,/ownerApi\.get\('\/top-orders'/);

  const ownerView=fs.readFileSync(path.join(root,'views/owner/index.ejs'),'utf8');
  const browser=fs.readFileSync(path.join(root,'public/js/pages.js'),'utf8');

  assert.ok(ownerView.includes('data-owner-product-page='));
  assert.ok(browser.includes('/owner/products/edit_produk?id='));
  assert.ok(browser.includes('/owner/products/content_produk?id='));
});
test('owner order fulfillment status API is routed',()=>{assert.match(route,/ownerApi\.post\('\/orders\/:id\/status'/);assert.match(fs.readFileSync(path.join(root,'src/services/order/order.service.js'),'utf8'),/ownerUpdateStatus/)});
test('Owner product variants use structured inputs instead of JSON text',()=>{
  const pages=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );
  const routes=fs.readFileSync(
    path.join(root,'src/routes/index.js'),
    'utf8'
  );

  assert.match(pages,/function productVariantEditorMarkup/);
  assert.match(pages,/function readProductVariants/);
  assert.match(pages,/data-product-variant-add/);
  assert.match(pages,/data-product-variant-remove/);
  assert.match(pages,/productVariantEditorMarkup\(d\.variants\|\|\[\]\)/);
  assert.match(pages,/variants=readProductVariants\(pfm\)/);
  assert.match(pages,/variants=readProductVariants\(pem\)/);
  assert.doesNotMatch(pages,/variants_json/);
  assert.ok(
    pages.includes("'/api/owner/products/'+created.id+'/variants'"),
    'Product creation must preserve the existing variants endpoint.'
  );
  assert.ok(
    pages.includes("'/api/owner/products/'+id+'/variants'"),
    'Product edit must preserve the existing variants endpoint.'
  );
  assert.ok(
    routes.includes("ownerApi.put('/products/:id/variants'"),
    'The existing API route must remain canonical.'
  );
});

test('variant saves are no-op when unchanged and preserve fixed cart items',()=>{
  const repository=fs.readFileSync(path.join(root,'src/repositories/products.repository.js'),'utf8');
  const saveStart=repository.indexOf('async function saveVariants(productId,variants){');
  const saveEnd=repository.indexOf('\nasync function contents(',saveStart);
  assert.ok(saveStart>=0&&saveEnd>saveStart,'Variant repository function is absent.');

  const save=repository.slice(saveStart,saveEnd);
  const noOp=save.indexOf('if(unchanged) return active;');
  const pending=save.indexOf('const pending=');
  const mutation=save.indexOf('update product_variants set is_active=false');

  assert.ok(noOp>=0&&pending>noOp&&mutation>pending,'No-op, reservation guard, and mutation order must remain safe.');
  assert.ok(save.includes("'delete from cart_items where product_id=$1 and variant_id is not null'"),'Only variant cart lines may be removed.');

  const adminStart=repository.indexOf('async function adminList(');
  const adminEnd=repository.indexOf('\nasync function count(',adminStart);
  assert.ok(adminStart>=0&&adminEnd>adminStart,'Owner product query is absent.');

  const admin=repository.slice(adminStart,adminEnd);
  assert.ok(admin.includes("sum(greatest(pv.stock-pv.reserved_stock,0))"),'Owner stock must use available active-variant stock.');
  assert.ok(admin.includes('as stock')&&admin.includes('else p.stock'),'FIXED stock contract must be preserved.');
});
test('customer stock display excludes pending reservations for fixed products',()=>{
  const products=fs.readFileSync(
    path.join(root,'src/repositories/products.repository.js'),
    'utf8'
  );
  const cart=fs.readFileSync(
    path.join(root,'src/repositories/cart.repository.js'),
    'utf8'
  );
  const productService=fs.readFileSync(
    path.join(root,'src/services/product/product.service.js'),
    'utf8'
  );

  assert.ok(
    products.includes('else greatest(p.stock-p.reserved_stock,0) end as stock'),
    'Public catalog stock must exclude reserved FIXED stock.'
  );
  assert.ok(
    cart.includes('else greatest(p.stock-p.reserved_stock,0) end'),
    'Cart display stock must exclude reserved FIXED stock.'
  );
  assert.ok(
    productService.includes('product.stock=Math.max(0,Number(product.stock||0)-Number(product.reserved_stock||0));'),
    'Product detail stock must exclude reserved FIXED stock.'
  );
});
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
  assert.match(workflow,/cron:\s*'3-59\/5 \* \* \* \*'/);
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
      /coalesce\(\s*expires_at,\s*created_at \+ interval '60 minutes'\s*\) <= clock_timestamp\(\)/
    );
    assert.match(paymentSource, /provisioningReason:'PAYMENT_EXPIRED'/);
    assert.match(
      paymentSource,
      /expires_at=clock_timestamp\(\)\+interval '60 minutes'/
    );
  });

  test('expiration job checks current expiry while locking payment', () => {
    const fallbackChecks = expirySource.match(
      /coalesce\(expires_at, case when lower\(provider\)='buatqris' then created_at \+ interval '60 minutes' else created_at \+ interval '30 minutes' end\) < clock_timestamp\(\)/g
    ) || [];
    assert.ok(
      fallbackChecks.length >= 2,
      'Kandidat expiry dan query penguncian harus memakai fallback yang sama.'
    );
    assert.match(expirySource, /for update/);
  });

  test('BuatQris treats NULL expiry consistently with the 60-minute fallback', () => {
    assert.match(
      paymentSource,
      /coalesce\(\s*expires_at,\s*created_at \+ interval '60 minutes'/
    );
    assert.match(paymentSource, /expires_at is null/);
    assert.match(
      paymentSource,
      /set expires_at=created_at \+ interval '60 minutes'/
    );
    assert.match(
      paymentSource,
      /effective_expires_at/
    );
  });
}


test('mobile bottom navigation matches the floating dark capsule design', () => {
  const nav = fs.readFileSync(
    path.join(root, 'views/partials/bottom-nav.ejs'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(root, 'public/css/responsive.css'),
    'utf8'
  );

  assert.match(
    nav,
    /href="\/store"[\s\S]*?Toko[\s\S]*?href="\/orders"[\s\S]*?Pesanan[\s\S]*?href="\/"[\s\S]*?Beranda[\s\S]*?href="\/deposit"[\s\S]*?Wallet[\s\S]*?href="\/profile"[\s\S]*?Profil/
  );
  assert.match(styles, /border-radius:25px/);
  assert.match(styles, /backdrop-filter:blur\(24px\) saturate\(140%\)/);
  assert.match(styles, /\.bottom-nav \.bottom-item\[href="\/"\]::before/);
  assert.match(
    styles,
    /\.bottom-nav \.bottom-item\.active:not\(\[href="\/"\]\)::after/
  );
});


test('mobile bottom navigation hides tab labels visually while preserving accessible text', () => {
  const styles = fs.readFileSync(
    path.join(root, 'public/css/responsive.css'),
    'utf8'
  );

  assert.match(styles, /JYYR BOTTOM NAV ICON-ONLY LABELS/);
  assert.match(
    styles,
    /\.bottom-nav \.bottom-item > span\{[^}]*clip-path:inset\(50%\)!important/s
  );
  assert.match(styles, /overflow:hidden!important/);
});


test('mobile bottom navigation centers the home icon inside its circle', () => {
  const styles = fs.readFileSync(
    path.join(root, 'public/css/responsive.css'),
    'utf8'
  );

  assert.match(
    styles,
    /\.bottom-nav \.bottom-item\[href="\/"\]::before\{[^}]*box-sizing:border-box/s
  );
  assert.match(
    styles,
    /\.bottom-nav \.bottom-item\[href="\/"\] svg\{[^}]*top:clamp\(4px, calc\(7\.5vw - 25px\), 8px\)/s
  );
  assert.match(
    styles,
    /\.bottom-nav \.bottom-item\[href="\/"\] svg\{[^}]*transform:translate\(-50%,-50%\)/s
  );
});


test('mobile home button glow remains subtle', () => {
  const styles = fs.readFileSync(
    path.join(root, 'public/css/responsive.css'),
    'utf8'
  );
  const match = styles.match(
    /\.bottom-nav \.bottom-item\[href="\/"\]::before\s*\{([^{}]*)\}/s
  );

  assert.ok(match, 'Home button circle styles must exist');
  assert.match(match[1], /0 0 0 4px rgba\(38,100,255,\.05\)/);
  assert.match(match[1], /0 0 12px 2px rgba\(36,99,255,\.24\)/);
});


// JYYR NOTIFICATION AUDIT REGRESSION TESTS
test('notification page marks unread cards correctly', () => {
  const template = fs.readFileSync(
    path.join(root, 'views/pages/notifications.ejs'),
    'utf8'
  );

  assert.match(
    template,
    /class="notification-card <%= n\.is_read \? '' : 'unread' %>"/
  );
});

test('owner broadcast read status reports reader and recipient counts', () => {
  const repository = fs.readFileSync(
    path.join(root, 'src/repositories/notification.repository.js'),
    'utf8'
  );
  const ownerView = fs.readFileSync(
    path.join(root, 'views/owner/index.ejs'),
    'utf8'
  );

  assert.match(repository, /as read_count/);
  assert.match(repository, /as recipient_count/);
  assert.match(repository, /nr\.read_at is not null/);
  assert.match(repository, /nr\.deleted_at is null/);
  assert.ok(ownerView.includes('row.read_count'));
  assert.ok(ownerView.includes('row.recipient_count'));
});

test('ticket lifecycle sends notifications to the relevant party', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/services/support/ticket.service.js'),
    'utf8'
  );

  assert.ok(source.includes('async function notifyOwner'));
  assert.ok(source.includes('title:`Tiket baru ${t.ticket_number}`'));
  assert.ok(source.includes('title:`Balasan baru ${t.ticket_number}`'));
  assert.ok(source.includes('title:`Status tiket ${t.ticket_number} diperbarui`'));
  assert.ok(source.includes('notifications.notify(t.user_id'));
  assert.ok(source.includes('/owner/tickets/'));
});

test('failed and expired payment paths create user notifications', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/services/payment/payment.service.js'),
    'utf8'
  );

  assert.ok(source.includes('// JYYR DEPOSIT FAILURE NOTIFICATION'));
  assert.ok(source.includes('// JYYR ORDER PAYMENT FAILURE NOTIFICATION'));
  assert.ok(source.includes("title:'Deposit gagal'"));
  assert.ok(source.includes("title:'Deposit kedaluwarsa'"));
  assert.ok(source.includes("title:'Pembayaran gagal'"));
  assert.ok(source.includes("title:'Pembayaran kedaluwarsa'"));
});
