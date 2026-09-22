const fs=require('fs');const path=require('path');const envFile=path.join(__dirname,'..','.env.example');const text=fs.readFileSync(envFile,'utf8');const vars=[...text.matchAll(/^([A-Z0-9_]+)=/gm)].map(m=>m[1]);const secret=vars.filter(v=>/SECRET|PASSWORD|TOKEN|KEY/.test(v));console.log('Environment contract:');for(const v of vars)console.log(`${v} = ${secret.includes(v)?'server-only / secret':'configured by owner'}`);if(
  !vars.includes('SUPABASE_SECRET_KEY') &&
  !vars.includes('SUPABASE_SERVICE_ROLE_KEY')
){
  process.exitCode=1;
}
