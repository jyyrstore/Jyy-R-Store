const {loadEnv}=require('../src/config/env');
const {initSupabase,supabaseAdmin}=require('../src/config/supabase');

async function verifyStorage(){
  try{
    const env=loadEnv();

    if(
      !env.SUPABASE_URL||
      !(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY)
    ){
      throw new Error('Supabase server configuration is missing');
    }

    initSupabase(env);

    // Read-only: do not call initStorage(), which creates missing buckets.
    const {data,error}=await supabaseAdmin().storage.listBuckets();

    if(error)throw error;

    const buckets=new Map((data||[]).map(bucket=>[bucket.name,bucket]));
    const required=[
      {name:env.PUBLIC_ASSET_BUCKET,isPublic:true},
      {name:env.PRIVATE_PRODUCT_BUCKET,isPublic:false},
      {name:env.USER_UPLOAD_BUCKET,isPublic:false}
    ];

    if(new Set(required.map(bucket=>bucket.name)).size!==required.length){
      throw new Error('Configured Storage bucket names must be distinct');
    }

    let failed=false;

    for(const expected of required){
      const actual=buckets.get(expected.name);

      if(!actual){
        console.error(`Missing bucket: ${expected.name}`);
        failed=true;
        continue;
      }

      if(Boolean(actual.public)!==expected.isPublic){
        console.error(
          `Incorrect visibility for ${expected.name}: expected ${
            expected.isPublic?'public':'private'
          }, got ${actual.public?'public':'private'}`
        );
        failed=true;
        continue;
      }

      console.log(
        `Bucket OK: ${expected.name} (${
          expected.isPublic?'public':'private'
        })`
      );
    }

    if(failed){
      process.exitCode=1;
      return;
    }

    console.log('Storage verification passed.');
  }catch(error){
    console.error('Storage verification failed:',error.message);
    process.exitCode=1;
  }
}

verifyStorage();
