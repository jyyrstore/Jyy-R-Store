const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'); const path=require('path');
const root=path.join(__dirname,'..','..');
function walk(dir){const out=[];for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory()&&!['node_modules','.git'].includes(name))out.push(...walk(p));else if(/\.(js|ejs|html|css|sql|md)$/.test(name))out.push(p)}return out}
const files=walk(root);
test('service role key never appears in public/views source',()=>{for(const dir of ['public','views']){for(const f of walk(path.join(root,dir))){assert.doesNotMatch(fs.readFileSync(f,'utf8'),/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?[^$\s<"']+/)}}});
test('browser source has no role-based localStorage authorization',()=>{for(const f of walk(path.join(root,'public'))){const s=fs.readFileSync(f,'utf8');assert.doesNotMatch(s,/localStorage\s*\.\s*(role|permission|admin)/i)}});
test('private delivery uses signed URLs',()=>{const s=fs.readFileSync(path.join(root,'src/services/delivery/delivery.service.js'),'utf8');assert.match(s,/signedUrl\(/);assert.match(s,/entitlement\(/)});
test('payment webhook has signature + idempotency controls',()=>{const s=fs.readFileSync(path.join(root,'src/services/payment/payment.service.js'),'utf8');assert.match(s,/verifyWebhook\(/);assert.match(s,/payment_events/);assert.match(s,/for update/)});
test('critical secret files are gitignored',()=>{const s=fs.readFileSync(path.join(root,'.gitignore'),'utf8');assert.match(s,/\.env/);assert.match(s,/node_modules/)});

test('server-auth callback rejects external open redirects',()=>{const s=fs.readFileSync(path.join(root,'src/utils/url.js'),'utf8');assert.match(s,/startsWith\('\/\/'\)/);assert.match(s,/safeNextPath/)});
test('direct client message/ticket insert policies are removed',()=>{const m=fs.readFileSync(path.join(root,'database/policies/messages.sql'),'utf8');const t=fs.readFileSync(path.join(root,'database/policies/tickets.sql'),'utf8');assert.doesNotMatch(m,/for insert/i);assert.doesNotMatch(t,/create\s+policy\s+tickets_insert_self[^;]*for\s+insert/i) });
test('user message API and owner reply API are wired',()=>{const r=fs.readFileSync(path.join(root,'src/routes/index.js'),'utf8');assert.match(r,/apiRouter\.get\('\/messages'/);assert.match(r,/ownerApi\.post\('\/messages\/:userId\/reply'/)});


test('session and CSRF never fall back to hardcoded secrets',()=>{
  const session=fs.readFileSync(path.join(root,'src/config/session.js'),'utf8');
  const security=fs.readFileSync(path.join(root,'src/config/security.js'),'utf8');
  assert.doesNotMatch(session,/dev-insecure-session/);
  assert.doesNotMatch(security,/dev-csrf/);
  assert.match(session,/SESSION_SECRET is required/);
  assert.match(security,/CSRF_SECRET is required/);
});

test('webhook event insert is concurrency-safe and occurs once per event',()=>{
  const s=fs.readFileSync(path.join(root,'src/services/payment/payment.service.js'),'utf8');
  assert.match(s,/on conflict \(provider_event_id\) do nothing returning id/i);
  assert.equal((s.match(/insert into payment_events/g)||[]).length,1);
});

test('deposit payment persistence does not infer provider failure from local errors',()=>{
  const s=fs.readFileSync(path.join(root,'src/services/deposit/deposit.service.js'),'utf8');
  assert.doesNotMatch(s,/update deposits set status='FAILED'/i);
  assert.match(s,/status='PENDING'/i);
});


test('auth middleware uses a request-scoped public Supabase client',()=>{
  const s=fs.readFileSync(path.join(root,'src/middleware/auth.middleware.js'),'utf8');
  assert.match(s,/supabasePublic\(\)/);
  assert.doesNotMatch(s,/supabase\(\)/);
});


test('payment returnUrl is normalized before provider use',()=>{
  const s=fs.readFileSync(path.join(root,'src/controllers/api.controller.js'),'utf8');
  assert.match(s,/safeSameOriginUrl\(req\.body\.returnUrl/);
});
