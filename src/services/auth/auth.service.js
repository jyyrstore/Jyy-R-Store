const { supabase } = require('../../config/supabase');
const profiles=require('../../repositories/profiles.repository');
const { query }=require('../../config/database'); const {loadEnv}=require('../../config/env');
async function register({email,password,username}){
  const existing=await profiles.findByUsername(username);
  if(existing) throw Object.assign(new Error('Username sudah digunakan.'),{status:409,code:'USERNAME_EXISTS',expose:true});
  const {data,error}=await supabase().auth.signUp({email,password,options:{data:{username},emailRedirectTo:`${loadEnv().APP_URL}/auth/callback`}});
  if(error) throw Object.assign(new Error(error.message),{status:400,code:'REGISTER_FAILED',expose:true});
  if(data.user) await profiles.create({id:data.user.id,username,email});
  return data;
}
async function login({email,password},{ip,userAgent}={}){
  const {data,error}=await supabase().auth.signInWithPassword({email,password});
  if(error){ await query("insert into login_history(user_id,device,browser,masked_ip,status,created_at) values(null,$1,$2,$3,'FAILED',now())",['Unknown',userAgent||null,ip||null]).catch(()=>{}); throw Object.assign(new Error('Email atau password tidak valid.'),{status:401,code:'INVALID_CREDENTIALS',expose:true}); }
  const profile=await profiles.findById(data.user.id);
  if(profile?.status==='BANNED'){ await query("insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'FAILED',now())",[data.user.id,'Unknown',userAgent||null,ip||null]).catch(()=>{}); throw Object.assign(new Error('Akun dinonaktifkan.'),{status:403,code:'ACCOUNT_BANNED',expose:true}); }
  if(profile?.status==='SUSPENDED'){ await query("insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'FAILED',now())",[data.user.id,'Unknown',userAgent||null,ip||null]).catch(()=>{}); throw Object.assign(new Error('Akun sedang ditangguhkan.'),{status:403,code:'ACCOUNT_SUSPENDED',expose:true}); }
  if(!profile) await profiles.create({id:data.user.id,username:data.user.email.split('@')[0].slice(0,32),email:data.user.email});
  await query('update profiles set last_login_at=now() where id=$1',[data.user.id]);
  await query('insert into wallets(user_id) values($1) on conflict do nothing',[data.user.id]);
  await query("insert into login_history(user_id,device,browser,masked_ip,status,created_at) values($1,$2,$3,$4,'SUCCESS',now())",[data.user.id,'Unknown',userAgent||null,ip||null]);
  return data;
}
async function logout(){ try{await supabase().auth.signOut();}catch{/* logout failure is intentionally ignored */} }
async function exchangeCode(code){ const {data,error}=await supabase().auth.exchangeCodeForSession(code); if(error) throw Object.assign(new Error('Kode autentikasi tidak valid atau sudah kedaluwarsa.'),{status:400,code:'AUTH_CODE_INVALID',expose:true}); return data; }
async function sendPasswordReset(email){ const {error}=await supabase().auth.resetPasswordForEmail(email,{redirectTo:`${loadEnv().APP_URL}/auth/callback?next=/auth/reset-password`}); if(error) throw Object.assign(new Error('Tidak dapat mengirim email reset password.'),{status:400,code:'RESET_FAILED',expose:true}); }
async function updatePassword({accessToken,refreshToken},password){ if(!accessToken||!refreshToken) throw Object.assign(new Error('Sesi reset password tidak valid.'),{status:401,code:'RESET_SESSION_INVALID',expose:true}); const client=supabase(); const {error:setError}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken}); if(setError) throw Object.assign(new Error('Sesi reset password tidak valid.'),{status:401,code:'RESET_SESSION_INVALID',expose:true}); const {error}=await client.auth.updateUser({password}); if(error) throw Object.assign(new Error('Password gagal diperbarui.'),{status:400,code:'PASSWORD_UPDATE_FAILED',expose:true}); }
module.exports={register,login,logout,exchangeCode,sendPasswordReset,updatePassword};
