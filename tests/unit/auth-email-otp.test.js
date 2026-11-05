const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Module=require('node:module');

const USER_ID='otp-user-001';
const EMAIL='otp@example.test';
const VALID_CODE='1234';
const SECRET='test-csrf-secret-with-at-least-32-bytes';
const servicePath=require.resolve('../../src/services/auth/auth.service');

function digest(code){
 return crypto.createHmac('sha256',SECRET)
  .update(JSON.stringify([
   USER_ID,
   EMAIL,
   String(code)
  ]))
  .digest('hex');
}

let state;

function resetState(){
 state={
  trace:[],
  queryLog:[],
  transactionActive:false,
  adminUpdateDuringTransaction:null,
  beforeAdminUpdate:null,
  generateLinkParams:null,
  verifyOtpParams:null,
  profile:{id:USER_ID,email:EMAIL},
  loginProfile:{id:USER_ID,status:'ACTIVE'},
  otp:{
   user_id:USER_ID,
   email:EMAIL,
   code_hash:digest(VALID_CODE),
   expires_at:new Date(Date.now()+5*60*1000),
   attempt_count:0,
   attempt_window_started_at:new Date(Date.now()-1000)
  },
  authUser:{
   id:USER_ID,
   email:EMAIL,
   email_confirmed_at:null
  },
  adminUpdateResult:{
   data:{
    user:{
     id:USER_ID,
     email:EMAIL,
     email_confirmed_at:new Date().toISOString()
    }
   },
   error:null
  },
  generateLinkResult:{
   data:{
    user:{id:USER_ID,email:EMAIL},
    properties:{
     hashed_token:'test-magiclink-token-hash',
     verification_type:'magiclink'
    }
   },
   error:null
  },
  verifyOtpResult:{
   data:{
    user:{
     id:USER_ID,
     email:EMAIL,
     email_confirmed_at:new Date().toISOString()
    },
    session:{
     access_token:'test-access-token',
     refresh_token:'test-refresh-token',
     user:{id:USER_ID,email:EMAIL}
    }
   },
   error:null
  },
  signInResult:{
   data:{
    user:{
     id:USER_ID,
     email:EMAIL,
     email_confirmed_at:new Date().toISOString()
    },
    session:{
     access_token:'test-access-token',
     refresh_token:'test-refresh-token'
    }
   },
   error:null
  }
 };
}

const databaseMock={
 async query(sql,params=[]){
  const normalized=sql.replace(/\s+/g,' ').trim().toLowerCase();
  state.queryLog.push(normalized);

  if(
   normalized.startsWith('update email_verification_otps')&&
   normalized.includes('where user_id=$1 and code_hash=$3')
  ){
   const matches=
    state.otp&&
    state.otp.user_id===params[0]&&
    state.otp.code_hash===params[2];

   if(matches){
    state.otp.code_hash=params[1];
   }

   return {rows:[],rowCount:matches?1:0};
  }

  if(normalized.startsWith('delete from email_verification_otps')){
   if(normalized.includes('and code_hash=$2')){
    if(
     state.otp&&
     state.otp.user_id===params[0]&&
     state.otp.code_hash===params[1]
    ){
     state.otp=null;
    }
   }else if(state.otp&&state.otp.user_id===params[0]){
    state.otp=null;
   }

   return {rows:[],rowCount:1};
  }

  return {rows:[]};
 },

 async withTransaction(callback){
  state.trace.push('transaction-begin');
  state.transactionActive=true;

  const client={
   async query(sql,params=[]){
    const normalized=sql.replace(/\s+/g,' ').trim().toLowerCase();
    state.trace.push(`transaction-query:${normalized}`);

    if(normalized.startsWith('select id from profiles')){
     return {rows:state.profile?[{id:USER_ID}]:[]};
    }

    if(normalized.startsWith('select email,code_hash,expires_at')){
     return {
      rows:state.otp?[{...state.otp}]:[]
     };
    }

    if(
     normalized.startsWith('update email_verification_otps')&&
     normalized.includes('set code_hash=$2')
    ){
     const matches=
      state.otp&&
      state.otp.user_id===params[0]&&
      state.otp.code_hash===params[2];

     if(matches){
      state.otp.code_hash=params[1];
     }

     return {rows:[],rowCount:matches?1:0};
    }

    if(
     normalized.startsWith('update email_verification_otps')&&
     normalized.includes('set attempt_count=$2')
    ){
     if(state.otp&&state.otp.user_id===params[0]){
      state.otp.attempt_count=params[1];
      state.otp.attempt_window_started_at=params[2];
     }

     return {rows:[],rowCount:1};
    }

    return {rows:[],rowCount:1};
   }
  };

  try{
   const result=await callback(client);
   state.trace.push('transaction-commit');
   return result;
  }catch(error){
   state.trace.push('transaction-rollback');
   throw error;
  }finally{
   state.transactionActive=false;
  }
 }
};

const adminClient={
 auth:{
  admin:{
   async getUserById(){
    return {
     data:{user:state.authUser},
     error:null
    };
   },

   async updateUserById(){
    state.trace.push('admin-confirm');
    state.adminUpdateDuringTransaction=state.transactionActive;

    if(state.beforeAdminUpdate){
     await state.beforeAdminUpdate();
    }

    const result=state.adminUpdateResult;

    if(result?.data?.user?.email_confirmed_at){
     state.authUser.email_confirmed_at=
      result.data.user.email_confirmed_at;
    }

    return result;
   },

   async generateLink(params){
    state.trace.push('admin-generate-link');
    state.generateLinkParams=params;
    return state.generateLinkResult;
   }
  }
 }
};

const publicClient={
 auth:{
  async signInWithPassword(){
   return state.signInResult;
  },
  async verifyOtp(params){
   state.trace.push('public-verify-otp');
   state.verifyOtpParams=params;
   return state.verifyOtpResult;
  },
  async signOut(){
   return {error:null};
  }
 }
};

const mocks=new Map([
 [
  '../../utils/normalization',
  {
   maskIp:()=> '127.0.0.1',
   parseUserAgent:()=>({device:'test',browser:'test'})
  }
 ],
 [
  '../../config/supabase',
  {
   supabasePublic:()=>publicClient,
   supabaseAdmin:()=>adminClient
  }
 ],
 [
  '../../repositories/profiles.repository',
  {
   findByEmail:async()=>state.profile,
   findById:async()=>state.loginProfile,
   findByUsername:async()=>null,
   create:async()=>state.profile
  }
 ],
 [
  '../../config/database',
  databaseMock
 ],
 [
  '../../config/env',
  {
   loadEnv:()=>({CSRF_SECRET:SECRET})
  }
 ],
 [
  '../email/mail-queue.service',
  {
   sendTemplate:async()=>({messageId:'test-email'})
  }
 ]
]);

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(parent?.filename===servicePath&&mocks.has(request)){
  return mocks.get(request);
 }

 return originalLoad.call(this,request,parent,isMain);
};

let auth;

try{
 auth=require(servicePath);
}finally{
 Module._load=originalLoad;
}

resetState();

test('OTP valid menghasilkan sesi Supabase melalui magic link satu kali',async()=>{
 resetState();

 const result=await auth.verifyEmailOtp(EMAIL,VALID_CODE,{
  ip:'127.0.0.1',
  userAgent:'unit-test'
 });

 assert.equal(result.user.id,USER_ID);
 assert.equal(result.session.access_token,'test-access-token');
 assert.equal(state.adminUpdateDuringTransaction,false);

 const commitIndex=state.trace.indexOf('transaction-commit');
 const adminIndex=state.trace.indexOf('admin-confirm');
 const generateIndex=state.trace.indexOf('admin-generate-link');
 const verifyIndex=state.trace.indexOf('public-verify-otp');

 assert.ok(commitIndex>=0);
 assert.ok(adminIndex>commitIndex);
 assert.ok(generateIndex>adminIndex);
 assert.ok(verifyIndex>generateIndex);

 assert.deepEqual(
  state.generateLinkParams,
  {type:'magiclink',email:EMAIL}
 );

 assert.deepEqual(
  state.verifyOtpParams,
  {
   token_hash:'test-magiclink-token-hash',
   type:'magiclink'
  }
 );

 assert.equal(state.otp,null);

 assert.ok(state.queryLog.some(sql=>
  sql.startsWith('update profiles set last_login_at=')
 ));

 assert.ok(state.queryLog.some(sql=>
  sql.startsWith('insert into wallets')
 ));

 assert.ok(state.queryLog.some(sql=>
  sql.includes("'success'")
 ));
});

test('OTP tetap wajib meski email sudah confirmed',async()=>{
 resetState();

 state.authUser.email_confirmed_at=new Date().toISOString();

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,'9999'),
  error=>error.code==='EMAIL_OTP_INVALID'
 );

 assert.equal(state.otp.attempt_count,1);
 assert.equal(state.trace.includes('admin-confirm'),false);
 assert.equal(state.trace.includes('admin-generate-link'),false);
});

test('magic link ditolak jika user ID tidak sesuai',async()=>{
 resetState();

 state.generateLinkResult.data.user.id='different-user';

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_OTP_SESSION_FAILED'
 );

 assert.equal(state.trace.includes('public-verify-otp'),false);
});

for(const status of ['BANNED','SUSPENDED']){
 test(`OTP menolak akun ${status}`,async()=>{
  resetState();
  state.loginProfile.status=status;

  await assert.rejects(
   auth.verifyEmailOtp(EMAIL,VALID_CODE,{
    ip:'127.0.0.1',
    userAgent:'unit-test'
   }),
   error=>error.code===(
    status==='BANNED'
     ?'ACCOUNT_BANNED'
     :'ACCOUNT_SUSPENDED'
   )
  );

  assert.ok(state.queryLog.some(sql=>
   sql.includes("'failed'")
  ));

  assert.equal(
   state.queryLog.some(sql=>
    sql.startsWith('update profiles set last_login_at=')
   ),
   false
  );
 });
}

test('OTP salah: attempt count bertambah dan Admin API tidak dipanggil',async()=>{
 resetState();

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,'9999'),
  error=>error.code==='EMAIL_OTP_INVALID'
 );

 assert.equal(state.otp.attempt_count,1);
 assert.equal(state.trace.includes('admin-confirm'),false);
});

test('OTP kedaluwarsa ditolak tanpa menambah attempt count',async()=>{
 resetState();
 state.otp.expires_at=new Date(Date.now()-1000);

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_OTP_EXPIRED'
 );

 assert.equal(state.otp.attempt_count,0);
 assert.equal(state.trace.includes('admin-confirm'),false);
});

test('batas lima percobaan OTP tetap berlaku',async()=>{
 resetState();
 state.otp.attempt_count=5;

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_OTP_ATTEMPT_LIMIT'
 );

 assert.equal(state.otp.attempt_count,5);
 assert.equal(state.trace.includes('admin-confirm'),false);
});

test('OTP yang sedang direservasi tidak dapat diverifikasi bersamaan',async()=>{
 resetState();
 state.otp.code_hash='VERIFYING:existing-reservation';

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_OTP_IN_PROGRESS'
 );

 assert.equal(state.otp.attempt_count,0);
 assert.equal(state.trace.includes('admin-confirm'),false);
});

test('Admin API gagal: hash OTP sebelumnya dipulihkan',async()=>{
 resetState();
 state.adminUpdateResult={
  data:{user:null},
  error:{message:'Supabase temporarily unavailable'}
 };

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_CONFIRMATION_FAILED'
 );

 assert.equal(state.adminUpdateDuringTransaction,false);
 assert.equal(state.otp.code_hash,digest(VALID_CODE));
});

test('pemulihan kegagalan tidak menimpa OTP baru dari resend',async()=>{
 resetState();
 state.adminUpdateResult={
  data:{user:null},
  error:{message:'Supabase temporarily unavailable'}
 };
 state.beforeAdminUpdate=async()=>{
  state.otp.code_hash='newer-otp-issued-by-resend';
 };

 await assert.rejects(
  auth.verifyEmailOtp(EMAIL,VALID_CODE),
  error=>error.code==='EMAIL_CONFIRMATION_FAILED'
 );

 assert.equal(state.otp.code_hash,'newer-otp-issued-by-resend');
});

test('login menerima email confirmed meski row OTP stale masih ada',async()=>{
 resetState();

 state.authUser.email_confirmed_at=new Date().toISOString();
 state.signInResult.data.user.email_confirmed_at=
  state.authUser.email_confirmed_at;

 const result=await auth.login(
  {email:EMAIL,password:'test-password'},
  {ip:'127.0.0.1',userAgent:'unit-test'}
 );

 assert.equal(result.user.id,USER_ID);
 assert.ok(state.otp,'test harus menyisakan row OTP stale');
 assert.equal(
  state.queryLog.some(sql=>sql.includes('from email_verification_otps')),
  false,
  'login tidak boleh menolak user confirmed berdasarkan row OTP stale'
 );
});
