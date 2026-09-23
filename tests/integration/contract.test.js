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
  assert.match(workflow,/https:\/\/jyyrstore\.vercel\.app\/api\/cron\/expire/);
});
