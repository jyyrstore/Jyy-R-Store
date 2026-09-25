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

test('profile account uses a compact read view with expandable editor',()=>{
  const source=read('views/pages/profile.ejs');

  assert.match(source,/profile-account-view/);
  assert.match(source,/profile-detail-list/);
  assert.match(source,/data-profile-detail="username"/);
  assert.match(source,/data-profile-detail="display_name"/);
  assert.match(source,/data-profile-detail="phone"/);
  assert.match(source,/data-profile-detail="bio"/);
  assert.match(source,/details class="profile-edit-disclosure"/);
  assert.match(source,/id="profile-form"/);
});

test('profile account compact styles include responsive rows and bio counter',()=>{
  const source=read('public/css/pages.css');
  const scripts=read('public/js/pages.js');

  assert.match(source,/PROFILE ACCOUNT COMPACT UX V1/);
  assert.match(source,/\.profile-detail-row/);
  assert.match(source,/\.profile-bio-help/);
  assert.match(source,/@media\(max-width:600px\)/);
  assert.match(scripts,/data-profile-bio-count/);
  assert.match(scripts,/profile-edit-disclosure/);
});


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


test('owner users UI uses filtered admin repository and responsive table labels',()=>{
  const page=read('src/controllers/page.controller.js');
  const view=read('views/owner/index.ejs');
  const repo=read('src/repositories/users.repository.js');
  const css=read('public/css/pages.css');

  assert.match(
    page,
    /require\('\.\.\/repositories\/users\.repository'\)/
  );

  assert.match(
    page,
    /repo\.list\(filters\)/
  );

  assert.match(
    page,
    /repo\.count\(filters\)/
  );

  assert.match(
    repo,
    /USER_ROLES/
  );

  assert.match(
    repo,
    /USER_STATUSES/
  );

  assert.match(
    repo,
    /async function count/
  );

  for(const label of [
    'User',
    'Role',
    'Status',
    'Balance',
    'Orders',
    'Registered',
    'Aksi'
  ]){
    assert.match(
      view,
      new RegExp(`data-label="${label}"`)
    );
  }

  assert.match(view,/name="search"/);
  assert.match(view,/name="role"/);
  assert.match(view,/name="status"/);
  assert.match(css,/\.owner-users-table/);
  assert.match(css,/\.owner-users-filter/);
});



test('auth callback URLs stay environment-driven',()=>{
  const auth=read('src/services/auth/auth.service.js');
  const controller=read('src/controllers/api.controller.js');
  const env=read('src/config/env.js');

  assert.match(
    auth,
    /emailRedirectTo:\s*`\$\{loadEnv\(\)\.APP_URL\}\/auth\/callback`/
  );

  assert.match(
    auth,
    /redirectTo:\s*`\$\{loadEnv\(\)\.APP_URL\}\/auth\/callback\?next=\/auth\/reset-password`/
  );

  assert.match(
    controller,
    /exchangeCode\(req\.query\.code\)/
  );

  assert.doesNotMatch(
    auth,
    /jyyrstore\.vercel\.app\/auth\/callback/
  );

  assert.doesNotMatch(
    auth,
    /jyyrsh\.my\.id\/auth\/callback/
  );

  assert.doesNotMatch(
    controller,
    /jyyrstore\.vercel\.app\/auth\/callback/
  );

  assert.doesNotMatch(
    controller,
    /jyyrsh\.my\.id\/auth\/callback/
  );

  assert.match(
    env,
    /APP_URL:\s*process\.env\.APP_URL/
  );

  assert.match(
    env,
    /APP_ALLOWED_URLS:\s*String\(/
  );
});

test('global picker system removes user-facing native selectors',()=>{
  const app=read('views/app.ejs');
  const owner=read('views/owner/index.ejs');
  const store=read('views/pages/store.ejs');
  const pages=read('public/js/pages.js');
  const picker=read('public/js/pickers.js');
  const components=read('public/css/components.css');

  assert.match(
    app,
    /\/js\/pickers\.js/
  );

  assert.doesNotMatch(
    owner,
    /<\s*select\b/i
  );

  assert.doesNotMatch(
    store,
    /<\s*select\b/i
  );

  assert.doesNotMatch(
    pages,
    /<\s*select\b/i
  );

  assert.doesNotMatch(
    owner,
    /type=["'](?:date|datetime-local|time|month|week)["']/i
  );

  const files=
    pages.match(
      /class="jyyr-native-file-input"/g
    )||[];

  const inputs=
    pages.match(
      /type=["']file["']/gi
    )||[];

  assert.equal(
    files.length,
    inputs.length
  );

  assert.match(
    picker,
    /data-jyyr-select/
  );

  assert.match(
    picker,
    /data-jyyr-picker/
  );

  assert.match(
    picker,
    /data-jyyr-file-picker/
  );

  assert.match(
    components,
    /\.jyyr-select/
  );

  assert.match(
    components,
    /\.jyyr-picker-input/
  );

  assert.match(
    components,
    /\.jyyr-file-picker/
  );
});


// PRODUCT CONTENT ACCESS CONSISTENCY V3

test('public product detail is metadata-only and keeps VIEW tracking',()=>{
  const api=read('src/controllers/api.controller.js');
  const page=read('src/controllers/page.controller.js');
  const service=read('src/services/product/product.service.js');

  const apiMatch=api.match(
    /const productController=\{[\s\S]*?\nconst cartController=\{/
  );

  assert.ok(apiMatch);

  const apiProduct=apiMatch[0];

  assert.ok(
    apiProduct.includes(
      'product.detailBySlug('
    )
  );

  assert.ok(
    apiProduct.includes(
      'req.user?.id'
    )
  );

  assert.ok(
    !apiProduct.includes(
      'delete p.contents'
    )
  );

  const pageMatch=page.match(
    /async function productDetail\(req,res,next\)\{[\s\S]*?\n\s*async function dashboard/
  );

  assert.ok(pageMatch);

  const productDetail=pageMatch[0];

  assert.ok(
    productDetail.includes(
      'products.detailBySlug('
    )
  );

  assert.ok(
    productDetail.includes(
      'req.user?.id'
    )
  );

  assert.ok(
    !productDetail.includes(
      'product.contents'
    )
  );

  assert.ok(
    !productDetail.includes(
      'delivery.repository'
    )
  );

  assert.ok(
    !service.includes(
      'product.contents=await products.contents(product.id)'
    )
  );

  assert.ok(
    service.includes(
      "products.event(product.id,userId,'VIEW')"
    )
  );
});

test('product content delete keeps public/private bucket routing',()=>{
  const source=read('src/controllers/api.controller.js');

  assert.ok(
    source.includes(
      "const legacyPublic=path.startsWith('public-assets/')"
    )
  );

  assert.ok(
    source.includes(
      'loadEnv().PUBLIC_ASSET_BUCKET'
    )
  );

  assert.ok(
    source.includes(
      'loadEnv().PRIVATE_PRODUCT_BUCKET'
    )
  );

  assert.ok(
    source.includes(
      "path.replace(/^public-assets\\//,'')"
    )
  );

  assert.ok(
    source.includes(
      'storage.remove(bucket,objectPath)'
    )
  );
});

test('product duplicate preserves legacy public storage semantics',()=>{
  const source=read(
    'src/repositories/products.repository.js'
  );

  assert.ok(
    source.includes(
      'const sourceBucket=legacyPublic'
    )
  );

  assert.ok(
    source.includes(
      'const sourceObjectPath=legacyPublic'
    )
  );

  assert.ok(
    source.includes(
      'const destinationObjectPath='
    )
  );

  assert.ok(
    source.includes(
      'const destinationBucket=legacyPublic'
    )
  );

  assert.ok(
    source.includes(
      'storagePath=legacyPublic'
    )
  );

  assert.ok(
    source.includes(
      'bucket:destinationBucket'
    )
  );
});

test('product content preview migration is idempotent',()=>{
  const source=read(
    'database/migrations/035_product_content_preview_invariant.sql'
  );

  assert.ok(
    source.includes(
      'if not exists'
    )
  );

  assert.ok(
    source.includes(
      'pg_constraint'
    )
  );

  assert.ok(
    source.includes(
      'product_contents_preview_invariant'
    )
  );

  assert.ok(
    source.includes(
      "is_preview = (access_type = 'PREVIEW')"
    )
  );
});


// SINGLE THUMBNAIL PREVIEW V1

test('owner create product uses one thumbnail preview area',()=>{
  const pages=read('public/js/pages.js');
  const css=read('public/css/components.css');

  const createMatch=pages.match(
    /products:`<form data-owner-product-form[\s\S]*?<\/form>`,\s*services:/
  );

  assert.ok(createMatch);

  const createForm=createMatch[0];

  assert.equal(
    (createForm.match(/data-thumbnail-stage/g)||[]).length,
    1
  );

  assert.equal(
    (createForm.match(/data-thumbnail-empty/g)||[]).length,
    1
  );

  assert.equal(
    (createForm.match(/data-thumbnail-preview/g)||[]).length,
    1
  );

  const stageMatch=createForm.match(
    /<div\s+class="product-thumbnail-preview-stage"[\s\S]*?<\/div>\s*<div class="product-upload-info">/
  );

  assert.ok(stageMatch);

  const stage=stageMatch[0];

  assert.ok(
    stage.includes('data-thumbnail-empty')
  );

  assert.ok(
    stage.includes('data-thumbnail-preview')
  );

  assert.ok(
    css.includes('.product-thumbnail-preview-stage{')
  );

  assert.ok(
    css.includes(
      '.product-thumbnail-preview-stage .product-thumbnail-empty'
    )
  );

  assert.ok(
    css.includes(
      '.product-thumbnail-preview-stage .product-thumbnail-preview'
    )
  );
});
