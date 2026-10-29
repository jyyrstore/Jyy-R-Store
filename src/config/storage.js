const { supabaseAdmin } = require('./supabase');
let envRef;

function validateBucketNames(targets) {
  const names = targets.map(({name}) => String(name || ''));

  if (names.some(name => !name || name.trim() !== name)) {
    throw new Error(
      'Storage bucket names must be non-empty and have no surrounding whitespace.'
    );
  }

  if (new Set(names).size !== names.length) {
    throw new Error('Configured Storage bucket names must be distinct.');
  }
}

function validateBucketVisibility(buckets, targets, {requireAll = false} = {}) {
  const byName = new Map(
    (buckets || []).map(bucket => [bucket.name, bucket])
  );

  for (const target of targets) {
    const actual = byName.get(target.name);

    if (!actual) {
      if (requireAll) {
        throw new Error(
          `Required Storage bucket "${target.name}" was not found after initialization.`
        );
      }
      continue;
    }

    if (Boolean(actual.public) !== target.isPublic) {
      throw new Error(
        `Storage bucket "${target.name}" has incorrect visibility: expected ${
          target.isPublic ? 'public' : 'private'
        }.`
      );
    }
  }
}

async function initStorage(env) {
  envRef = env;

  const targets = [
    { name: env.PUBLIC_ASSET_BUCKET, isPublic: true },
    { name: env.PRIVATE_PRODUCT_BUCKET, isPublic: false },
    { name: env.USER_UPLOAD_BUCKET, isPublic: false }
  ];

  validateBucketNames(targets);

  if (!env.SUPABASE_URL ||
      !(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return;
  }

  const client = supabaseAdmin();
  const {data: existing, error: listError} =
    await client.storage.listBuckets();

  if (listError) throw listError;

  // Fail before creating anything if an existing bucket is unsafe.
  validateBucketVisibility(existing, targets);

  const names = new Set((existing || []).map(bucket => bucket.name));
  let needsVerification = false;

  for (const bucket of targets) {
    if (names.has(bucket.name)) continue;

    const {error} = await client.storage.createBucket(
      bucket.name,
      {
        public: bucket.isPublic,
        fileSizeLimit: `${env.MAX_UPLOAD_MB}MB`
      }
    );

    if (error && !/already exists/i.test(String(error.message || error))) {
      throw error;
    }

    names.add(bucket.name);
    needsVerification = true;
  }

  // Re-read after create operations, including an "already exists" race.
  if (needsVerification) {
    const {data: verified, error: verifyError} =
      await client.storage.listBuckets();

    if (verifyError) throw verifyError;

    validateBucketVisibility(verified, targets, {requireAll: true});
  }
}
function getBucket(name) { return name || envRef?.PRIVATE_PRODUCT_BUCKET; }
async function uploadBuffer({ bucket, path, buffer, contentType, upsert = false }) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).upload(path, buffer, { contentType, upsert });
  if (error) throw error;
  return data;
}

async function createSignedUploadUrl(bucket,path,upsert=false){
  const {data,error}=await supabaseAdmin().storage
    .from(bucket)
    .createSignedUploadUrl(path,{upsert});
  if(error) throw error;
  return data;
}

async function fileExists(bucket,path){
  const parts=String(path).split('/');
  const name=parts.pop();
  const folder=parts.join('/');

  const {data,error}=await supabaseAdmin()
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
  const {data,error}=await supabaseAdmin()
    .storage
    .from(bucket)
    .info(path);

  if(error) throw error;
  return data || null;
}
async function listObjects(
  bucket,
  path='',
  {
    limit=1000,
    offset=0,
    sortBy={column:'name',order:'asc'}
  }={}
){
  const safeLimit=Math.min(
    1000,
    Math.max(1,Number(limit)||1000)
  );

  const safeOffset=Math.max(
    0,
    Number(offset)||0
  );

  const {data,error}=await supabaseAdmin()
    .storage
    .from(bucket)
    .list(path,{
      limit:safeLimit,
      offset:safeOffset,
      sortBy
    });

  if(error)throw error;

  return data||[];
}

async function remove(bucket, path) { const { error } = await supabaseAdmin().storage.from(bucket).remove([path]); if (error) throw error; }
async function copy(bucket, fromPath, toPath) {
  const storageBucket = supabaseAdmin().storage.from(bucket);

  if (typeof storageBucket.copy !== 'function') {
    throw new Error('Supabase Storage copy API is unavailable.');
  }

  const { data, error } = await storageBucket.copy(fromPath, toPath);

  if (error) throw error;

  return data;
}
function publicObjectPath(path){
  return String(path||'').replace(/^public-assets\//,'');
}

function publicUrl(bucket,path){
  const objectPath=
    bucket===envRef?.PUBLIC_ASSET_BUCKET
      ? publicObjectPath(path)
      : path;

  return supabaseAdmin()
    .storage
    .from(bucket)
    .getPublicUrl(objectPath)
    .data
    .publicUrl;
}
async function signedUrl(bucket, path, expiresIn) { const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, expiresIn); if (error) throw error; return data.signedUrl; }
module.exports = {
  initStorage,
  uploadBuffer,
  createSignedUploadUrl,
  fileExists,
  fileInfo,
  listObjects,
  resumableUploadUrl,
  remove,
  copy,
  publicUrl,
  publicObjectPath,
  signedUrl,
  getBucket
};
