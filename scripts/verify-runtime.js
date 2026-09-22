#!/usr/bin/env node
require('dotenv').config();

const url=process.argv[2]||process.env.APP_URL;
if(!url){
  console.error('Usage: node scripts/verify-runtime.js https://your-domain.example');
  process.exit(2);
}
(async()=>{
  const target=new URL(url);
  const res=await fetch(target,{redirect:'manual'});
  const required=[
    ['content-security-policy', res.headers.get('content-security-policy')],
    ['permissions-policy', res.headers.get('permissions-policy')],
    ['referrer-policy', res.headers.get('referrer-policy')],
    ['x-content-type-options', res.headers.get('x-content-type-options')]
  ];
  const missing=required.filter(([,v])=>!v);
  if(res.headers.get('x-powered-by')) missing.push(['x-powered-by must be absent',res.headers.get('x-powered-by')]);
  if(missing.length){
    console.error('SECURITY HEADER CHECK FAILED');
    for(const [name,value] of missing) console.error(` - ${name}: ${value||'MISSING'}`);
    process.exit(1);
  }
  console.log(`runtime=${target.origin}`);
  console.log(`status=${res.status}`);
  for(const [name,value] of required) console.log(`${name}=${value}`);
  console.log(`x-powered-by=${res.headers.get('x-powered-by')||'absent'}`);
  console.log('SECURITY HEADER CHECK PASSED');
})().catch(error=>{
  console.error(`runtime verification error: ${error.message}`);
  process.exit(1);
});
