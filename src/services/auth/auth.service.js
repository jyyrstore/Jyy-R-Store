const crypto=require('crypto');
const { maskIp, parseUserAgent } = require('../../utils/normalization');
const { supabasePublic,supabaseAdmin }=require('../../config/supabase');
const profiles=require('../../repositories/profiles.repository');
const { query,withTransaction }=require('../../config/database');
const {loadEnv}=require('../../config/env');
const {sendTemplate}=require('../email/mail-queue.service');


const EMAIL_OTP_WINDOW_MS=60*60*1000;
const EMAIL_OTP_RESEND_DELAY_MS=60*1000;
const EMAIL_OTP_MAX_SENDS=3;
const EMAIL_OTP_MAX_ATTEMPTS=5;

function authFailure(message,status,code){
 return Object.assign(new Error(message),{
  status,
  code,
  expose:true
 });
}

function emailOtpSecret(){
 const secret=String(loadEnv().CSRF_SECRET||'');
 if(Buffer.byteLength(secret)<32){
  throw authFailure(
   'Konfigurasi keamanan OTP belum siap.',
   503,
   'EMAIL_OTP_CONFIG_MISSING'
  );
 }
 return secret;
}

function assertEmailOtpDeliveryReady(){
 const env=loadEnv();
 if(
  !env.SMTP_HOST||
  !env.SMTP_USER||
  !env.SMTP_PASSWORD||
  !(env.SMTP_FROM||env.EMAIL_FROM)
 ){
  throw authFailure(
   'Pengiriman email OTP belum dikonfigurasi.',
   503,
   'EMAIL_OTP_CONFIG_MISSING'
  );
 }
 emailOtpSecret();
}

function emailOtpDigest(userId,email,code){
 return crypto.createHmac('sha256',emailOtpSecret())
  .update(JSON.stringify([
   String(userId),
   String(email).trim().toLowerCase(),
   String(code)
  ]))
  .digest('hex');
}

async function issueEmailVerificationOtp(userId,email){
 const code=String(crypto.randomInt(0,10000)).padStart(4,'0');
 const codeHash=emailOtpDigest(userId,email,code);

 const result=await withTransaction(async client=>{
  // Lock profile so concurrent resend requests serialize,
  // including the case where no OTP row exists yet.
  const profile=(await client.query(
   'select id from profiles where id=$1 for update',
   [userId]
  )).rows[0];

  if(!profile){
   return {
    error:{
     status:404,
     code:'EMAIL_OTP_INVALID',
     message:'Permintaan verifikasi tidak valid.'
    }
   };
  }

  const current=(await client.query(
   'select * from email_verification_otps where user_id=$1 for update',
   [userId]
  )).rows[0]||null;

  const now=Date.now();
  let attemptCount=Number(current?.attempt_count||0);
  let attemptWindow=current?.attempt_window_started_at||new Date(now);

  if(current){
   const attemptStart=new Date(
    current.attempt_window_started_at
   ).getTime();

   if(
    !Number.isFinite(attemptStart)||
    now-attemptStart>=EMAIL_OTP_WINDOW_MS
   ){
    attemptCount=0;
    attemptWindow=new Date(now);
   }
  }

  let sendCount=1;
  let sendWindow=new Date(now);

  if(current){
   const sendStart=new Date(
    current.send_window_started_at
   ).getTime();

   if(
    Number.isFinite(sendStart)&&
    now-sendStart<EMAIL_OTP_WINDOW_MS
   ){
    if(Number(current.send_count||0)>=EMAIL_OTP_MAX_SENDS){
     return {
      error:{
       status:429,
       code:'EMAIL_OTP_SEND_LIMIT',
       message:'Batas pengiriman OTP tercapai. Coba lagi setelah satu jam.'
      }
     };
    }

    const lastSent=new Date(current.sent_at).getTime();

    if(
     Number.isFinite(lastSent)&&
     now-lastSent<EMAIL_OTP_RESEND_DELAY_MS
    ){
     return {
      error:{
       status:429,
       code:'EMAIL_OTP_RESEND_COOLDOWN',
       message:'Tunggu sebentar sebelum meminta OTP baru.'
      }
     };
    }

    sendCount=Number(current.send_count||0)+1;
    sendWindow=current.send_window_started_at;
   }
  }

  await client.query(
   `insert into email_verification_otps(
      user_id,email,code_hash,expires_at,
      attempt_count,attempt_window_started_at,
      send_count,send_window_started_at,
      sent_at,created_at,updated_at
    )
    values(
      $1,$2,$3,now()+interval '10 minutes',
      $4,$5,$6,$7,now(),now(),now()
    )
    on conflict(user_id) do update set
      email=excluded.email,
      code_hash=excluded.code_hash,
      expires_at=excluded.expires_at,
      attempt_count=excluded.attempt_count,
      attempt_window_started_at=excluded.attempt_window_started_at,
      send_count=excluded.send_count,
      send_window_started_at=excluded.send_window_started_at,
      sent_at=now(),
      updated_at=now()`,
   [
    userId,
    String(email).trim().toLowerCase(),
    codeHash,
    attemptCount,
    attemptWindow,
    sendCount,
    sendWindow
   ]
  );

  return {ok:true};
 });

 if(result.error){
  throw authFailure(
   result.error.message,
   result.error.status,
   result.error.code
  );
 }

 return code;
}

async function deliverEmailVerificationOtp(userId,email){
 const code=await issueEmailVerificationOtp(userId,email);

 try{
  const sent=await sendTemplate({
   to:email,
   template:'email-verification-otp',
   title:'Verifikasi email Jyyr Store',
   body:`Kode OTP email Anda: ${code}. Kode berlaku selama 10 menit dan hanya dapat digunakan satu kali.`
  });

  if(sent?.skipped){
   throw new Error('EMAIL_TRANSPORT_SKIPPED');
  }

  return true;
 }catch{
  // Never leave a usable code when delivery did not succeed.
  await query(
   `update email_verification_otps
    set code_hash='',
        expires_at=now(),
        sent_at=now()-interval '1 minute',
        updated_at=now()
    where user_id=$1
      and code_hash=$2`,
   [userId,emailOtpDigest(userId,email,code)]
  ).catch(()=>{});

  return false;
 }
}

async function register({email,password,username}){
 const normalizedEmail=String(email||'').trim().toLowerCase();

 const existing=await profiles.findByUsername(username);
 if(existing){
  throw authFailure(
   'Username sudah digunakan.',
   409,
   'USERNAME_EXISTS'
  );
 }

 assertEmailOtpDeliveryReady();

 const admin=supabaseAdmin();
 const {data,error}=await admin.auth.admin.createUser({
  email:normalizedEmail,
  password,
  email_confirm:false,
  user_metadata:{username}
 });

 if(error){
  const duplicate=
   ['email_exists','user_already_exists'].includes(
    String(error.code||'').toLowerCase()
   )||
   /already registered|already exists/i.test(
    String(error.message||'')
   );

  throw authFailure(
   duplicate?'Email atau username sudah digunakan.':'Registrasi gagal diproses.',
   duplicate?409:400,
   duplicate?'EMAIL_EXISTS':'REGISTER_FAILED'
  );
 }

 const userId=data?.user?.id;
 if(!userId){
  throw authFailure(
   'Akun belum dapat dibuat. Silakan coba lagi.',
   503,
   'REGISTER_FAILED'
  );
 }

 try{
  await profiles.create({
   id:userId,
   username,
   email:normalizedEmail
  });
 }catch(error){
  await admin.auth.admin.deleteUser(userId).catch(()=>{});

  if(
   error?.code==='23505'&&
   String(error.constraint||'').toLowerCase().includes('username')
  ){
   throw authFailure(
    'Username sudah digunakan.',
    409,
    'USERNAME_EXISTS'
   );
  }

  throw authFailure(
   'Profil akun gagal dibuat. Silakan coba lagi.',
   500,
   'REGISTER_PROFILE_FAILED'
  );
 }

 const emailSent=await deliverEmailVerificationOtp(
  userId,
  normalizedEmail
 );

 return {
  email:normalizedEmail,
  emailSent
 };
}

async function verifyEmailOtp(email,code){
 const normalizedEmail=String(email||'').trim().toLowerCase();
 const profile=await profiles.findByEmail(normalizedEmail);

 if(!profile){
  throw authFailure(
   'OTP tidak valid atau sudah kedaluwarsa.',
   400,
   'EMAIL_OTP_INVALID'
  );
 }

 const admin=supabaseAdmin();
 const authLookup=await admin.auth.admin.getUserById(profile.id);
 const authUser=authLookup.data?.user;

 if(
  authLookup.error||
  !authUser||
  String(authUser.email||'').trim().toLowerCase()!==normalizedEmail
 ){
  throw authFailure(
   'OTP tidak valid atau sudah kedaluwarsa.',
   400,
   'EMAIL_OTP_INVALID'
  );
 }

 if(authUser.email_confirmed_at){
  await query(
   'delete from email_verification_otps where user_id=$1',
   [profile.id]
  ).catch(()=>{});
  return {verified:true};
 }

 const result=await withTransaction(async client=>{
  await client.query(
   'select id from profiles where id=$1 for update',
   [profile.id]
  );

  const otp=(await client.query(
   `select email,code_hash,expires_at,
           attempt_count,attempt_window_started_at
    from email_verification_otps
    where user_id=$1
    for update`,
   [profile.id]
  )).rows[0];

  if(
   !otp||
   String(otp.email||'').trim().toLowerCase()!==normalizedEmail
  ){
   return {
    error:{
     status:400,
     code:'EMAIL_OTP_INVALID',
     message:'OTP tidak valid atau sudah kedaluwarsa.'
    }
   };
  }

  const expiresAt=new Date(otp.expires_at).getTime();
  if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){
   return {
    error:{
     status:400,
     code:'EMAIL_OTP_EXPIRED',
     message:'OTP sudah kedaluwarsa. Minta kode baru.'
    }
   };
  }

  const storedCodeHash=String(otp.code_hash||'');

  if(storedCodeHash.startsWith('VERIFYING:')){
   return {
    error:{
     status:409,
     code:'EMAIL_OTP_IN_PROGRESS',
     message:'Verifikasi sedang diproses. Coba lagi sebentar.'
    }
   };
  }

  let attemptCount=Number(otp.attempt_count||0);
  let attemptWindow=otp.attempt_window_started_at;
  const attemptStart=new Date(attemptWindow).getTime();

  if(
   !Number.isFinite(attemptStart)||
   Date.now()-attemptStart>=EMAIL_OTP_WINDOW_MS
  ){
   attemptCount=0;
   attemptWindow=new Date();
  }

  if(attemptCount>=EMAIL_OTP_MAX_ATTEMPTS){
   return {
    error:{
     status:429,
     code:'EMAIL_OTP_ATTEMPT_LIMIT',
     message:'Terlalu banyak percobaan OTP. Coba lagi setelah satu jam.'
    }
   };
  }

  const expected=Buffer.from(
   emailOtpDigest(profile.id,normalizedEmail,code),
   'hex'
  );
  const stored=Buffer.from(storedCodeHash,'hex');

  const valid=
   stored.length===expected.length&&
   crypto.timingSafeEqual(stored,expected);

  if(!valid){
   const nextAttemptCount=attemptCount+1;

   await client.query(
    `update email_verification_otps
     set attempt_count=$2,
         attempt_window_started_at=$3,
         updated_at=now()
     where user_id=$1`,
    [profile.id,nextAttemptCount,attemptWindow]
   );

   return {
    error:{
     status:nextAttemptCount>=EMAIL_OTP_MAX_ATTEMPTS?429:400,
     code:nextAttemptCount>=EMAIL_OTP_MAX_ATTEMPTS
      ?'EMAIL_OTP_ATTEMPT_LIMIT'
      :'EMAIL_OTP_INVALID',
     message:nextAttemptCount>=EMAIL_OTP_MAX_ATTEMPTS
      ?'Terlalu banyak percobaan OTP. Coba lagi setelah satu jam.'
      :'OTP tidak sesuai.'
    }
   };
  }

  const reservationToken=
   `VERIFYING:${crypto.randomBytes(16).toString('hex')}`;

  const reservation=await client.query(
   `update email_verification_otps
    set code_hash=$2,
        updated_at=now()
    where user_id=$1
      and code_hash=$3`,
   [profile.id,reservationToken,storedCodeHash]
  );

  if(reservation.rowCount!==1){
   return {
    error:{
     status:409,
     code:'EMAIL_OTP_IN_PROGRESS',
     message:'Verifikasi sedang diproses. Coba lagi sebentar.'
    }
   };
  }

  return {
   verified:true,
   reservationToken,
   storedCodeHash
  };
 });

 if(result.error){
  throw authFailure(
   result.error.message,
   result.error.status,
   result.error.code
  );
 }

 try{
  const {data,error}=await admin.auth.admin.updateUserById(
   profile.id,
   {email_confirm:true}
  );

  if(error||!data?.user?.email_confirmed_at){
   throw authFailure(
    'Email belum dapat dikonfirmasi. Silakan coba lagi.',
    503,
    'EMAIL_CONFIRMATION_FAILED'
   );
  }
 }catch(error){
  // Restore only while this request still owns the reservation.
  // A newer OTP issued by resend must never be overwritten.
  await query(
   `update email_verification_otps
    set code_hash=$2,
        updated_at=now()
    where user_id=$1
      and code_hash=$3
      and expires_at>now()`,
   [profile.id,result.storedCodeHash,result.reservationToken]
  ).catch(()=>{});

  if(error?.code==='EMAIL_CONFIRMATION_FAILED'){
   throw error;
  }

  throw authFailure(
   'Email belum dapat dikonfirmasi. Silakan coba lagi.',
   503,
   'EMAIL_CONFIRMATION_FAILED'
  );
 }

 // The confirmed Auth user is authoritative even if cleanup fails.
 // Delete only the reservation owned by this verification request.
 await query(
  `delete from email_verification_otps
   where user_id=$1
     and code_hash=$2`,
  [profile.id,result.reservationToken]
 ).catch(()=>{});

 return {verified:true};
}
async function resendEmailOtp(email){
 const normalizedEmail=String(email||'').trim().toLowerCase();
 const genericMessage=
  'Jika email terdaftar dan belum diverifikasi, OTP akan dikirim.';

 const profile=await profiles.findByEmail(normalizedEmail);
 if(!profile){
  return {accepted:true,message:genericMessage};
 }

 const admin=supabaseAdmin();
 const lookup=await admin.auth.admin.getUserById(profile.id);
 const user=lookup.data?.user;

 if(
  lookup.error||
  !user||
  user.email_confirmed_at||
  String(user.email||'').trim().toLowerCase()!==normalizedEmail
 ){
  return {accepted:true,message:genericMessage};
 }

 assertEmailOtpDeliveryReady();

 const sent=await deliverEmailVerificationOtp(
  profile.id,
  normalizedEmail
 );

 if(!sent){
  throw authFailure(
   'Email OTP belum dapat dikirim. Silakan coba lagi.',
   503,
   'EMAIL_OTP_DELIVERY_FAILED'
  );
 }

 return {accepted:true,message:genericMessage};
}

async function login({email,password},{ip,userAgent}={}){

 const client=supabasePublic();
 const {data,error}=await client.auth.signInWithPassword({email,password});

 if(error){
 const loginMeta=parseUserAgent(userAgent);

 await query(
 "insert into login_history(user_id,device,browser,masked_ip,status,created_at) values(null,$1,$2,$3,'FAILED',now())",
 [loginMeta.device,loginMeta.browser,maskIp(ip)]
 ).catch(()=>{});

 if(
  error?.code==='email_not_confirmed'||
  /email not confirmed/i.test(String(error?.message||''))
 ){
  throw authFailure(
   'Email belum diverifikasi. Masukkan OTP 4 digit untuk melanjutkan.',
   403,
   'EMAIL_NOT_VERIFIED'
  );
 }

 throw Object.assign(new Error('Email atau password tidak valid.'),{
 status:401,
 code:'INVALID_CREDENTIALS',
 expose:true
 });
 }

  if(!data.user.email_confirmed_at){
  throw authFailure(
   'Email belum diverifikasi. Masukkan OTP 4 digit untuk melanjutkan.',
   403,
   'EMAIL_NOT_VERIFIED'
  );
 }

 const profile=await profiles.findById(data.user.id);

 if(profile?.status==='BANNED'){
 const loginMeta=parseUserAgent(userAgent);

 await query(
 "insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'FAILED',now())",
 [data.user.id,loginMeta.device,loginMeta.browser,maskIp(ip)]
 ).catch(()=>{});

 throw Object.assign(new Error('Akun dinonaktifkan.'),{
 status:403,
 code:'ACCOUNT_BANNED',
 expose:true
 });
 }

 if(profile?.status==='SUSPENDED'){
 const loginMeta=parseUserAgent(userAgent);

 await query(
 "insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'FAILED',now())",
 [data.user.id,loginMeta.device,loginMeta.browser,maskIp(ip)]
 ).catch(()=>{});

 throw Object.assign(new Error('Akun sedang ditangguhkan.'),{
 status:403,
 code:'ACCOUNT_SUSPENDED',
 expose:true
 });
 }

 if(!profile){
 await profiles.create({
 id:data.user.id,
 username:data.user.email.split('@')[0].slice(0,32),
 email:data.user.email
 });
 }

 await query('update profiles set last_login_at=now() where id=$1',[data.user.id]);
 await query('insert into wallets(user_id) values($1) on conflict do nothing',[data.user.id]);
 const loginMeta=parseUserAgent(userAgent);

 await query(
 "insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'SUCCESS',now())",
 [data.user.id,loginMeta.device,loginMeta.browser,maskIp(ip)]
 );

 return data;
}

async function logout(){
 try{
 await supabasePublic().auth.signOut();
 }catch{/* logout failure is intentionally ignored */}
}

async function exchangeCode(code){
 const {data,error}=await supabasePublic().auth.exchangeCodeForSession(code);

 if(error){
 throw Object.assign(new Error('Kode autentikasi tidak valid atau sudah kedaluwarsa.'),{
 status:400,
 code:'AUTH_CODE_INVALID',
 expose:true
 });
 }

 return data;
}

async function verifyRecoveryToken(tokenHash){
 if(typeof tokenHash!=='string'||!tokenHash.trim()){
  throw Object.assign(
   new Error('Tautan reset password tidak valid atau sudah kedaluwarsa.'),
   {status:400,code:'RESET_TOKEN_INVALID',expose:true}
  );
 }

 const {data,error}=await supabasePublic().auth.verifyOtp({
  token_hash:tokenHash.trim(),
  type:'recovery'
 });

 if(
  error ||
  !data?.session?.access_token ||
  !data?.session?.refresh_token ||
  !data?.user?.id
 ){
  throw Object.assign(
   new Error('Tautan reset password tidak valid atau sudah kedaluwarsa.'),
   {status:400,code:'RESET_TOKEN_INVALID',expose:true}
  );
 }

 return data;
}

async function sendPasswordReset(email){
 const {error}=await supabasePublic().auth.resetPasswordForEmail(
 email,
 {
 redirectTo:`${loadEnv().APP_URL}/auth/callback?next=/auth/reset-password`
 }
 );

 if(error){
 throw Object.assign(new Error('Tidak dapat mengirim email reset password.'),{
 status:400,
 code:'RESET_FAILED',
 expose:true
 });
 }
}

async function updatePassword({accessToken,refreshToken},password){
 if(!accessToken||!refreshToken){
 throw Object.assign(new Error('Sesi reset password tidak valid.'),{
 status:401,
 code:'RESET_SESSION_INVALID',
 expose:true
 });
 }

 const client=supabasePublic();

 const {error:setError}=await client.auth.setSession({
 access_token:accessToken,
 refresh_token:refreshToken
 });

 if(setError){
 throw Object.assign(new Error('Sesi reset password tidak valid.'),{
 status:401,
 code:'RESET_SESSION_INVALID',
 expose:true
 });
 }

 const {error}=await client.auth.updateUser({password});

 if(error){
 throw Object.assign(new Error('Password gagal diperbarui.'),{
 status:400,
 code:'PASSWORD_UPDATE_FAILED',
 expose:true
 });
 }
}

module.exports={register,login,verifyEmailOtp,resendEmailOtp,logout,exchangeCode,verifyRecoveryToken,sendPasswordReset,updatePassword};
