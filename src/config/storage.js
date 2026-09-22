const { supabase } = require('./supabase');
let envRef;
async function initStorage(env) {
  envRef = env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const client = supabase();
  const existing = await client.storage.listBuckets();
  if (existing.error) throw existing.error;
  const names = new Set((existing.data || []).map((b) => b.name));
  const targets = [
    { name: env.PUBLIC_ASSET_BUCKET, isPublic: true },
    { name: env.PRIVATE_PRODUCT_BUCKET, isPublic: false },
    { name: env.USER_UPLOAD_BUCKET, isPublic: false }
  ];
  for (const bucket of targets) {
    if (!names.has(bucket.name)) {
      const { error } = await client.storage.createBucket(bucket.name, { public: bucket.isPublic, fileSizeLimit: `${env.MAX_UPLOAD_MB}MB` });
      if (error && !/already exists/i.test(error.message)) throw error;
    }
  }
}
function getBucket(name) { return name || envRef?.PRIVATE_PRODUCT_BUCKET; }
async function uploadBuffer({ bucket, path, buffer, contentType, upsert = false }) {
  const { data, error } = await supabase().storage.from(bucket).upload(path, buffer, { contentType, upsert });
  if (error) throw error;
  return data;
}

async function createSignedUploadUrl(bucket,path,upsert=false){
  const {data,error}=await supabase().storage
    .from(bucket)
    .createSignedUploadUrl(path,{upsert});
  if(error) throw error;
  return data;
}

async function fileExists(bucket,path){
  const parts=String(path).split('/');
  const name=parts.pop();
  const folder=parts.join('/');

  const {data,error}=await supabase()
    .storage
    .from(bucket)
    .list(folder,{limit:100,search:name});

  if(error) throw error;

  return Boolean((data||[]).some(item=>item.name===name));
}

function resumableUploadUrl(){
  if(!envRef?.SUPABASE_URL){
    throw new Error('Supabase URL is not configured.');
  }

  const hostname=new URL(envRef.SUPABASE_URL).hostname;
  const projectRef=hostname.split('.')[0];

  if(!projectRef){
    throw new Error('Invalid Supabase project URL.');
  }

  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}
async function fileInfo(bucket,path){
  const {data,error}=await supabase()
    .storage
    .from(bucket)
    .info(path);

  if(error) throw error;
  return data || null;
}
async function remove(bucket, path) { const { error } = await supabase().storage.from(bucket).remove([path]); if (error) throw error; }
function publicUrl(bucket, path) { return supabase().storage.from(bucket).getPublicUrl(path).data.publicUrl; }
async function signedUrl(bucket, path, expiresIn) { const { data, error } = await supabase().storage.from(bucket).createSignedUrl(path, expiresIn); if (error) throw error; return data.signedUrl; }
module.exports = { initStorage, uploadBuffer, createSignedUploadUrl, fileExists, fileInfo, resumableUploadUrl, remove, publicUrl, signedUrl, getBucket };
