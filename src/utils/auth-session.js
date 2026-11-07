function setAuthSession(req,data,{rememberMe}={}){
  const session=data?.session;
  const user=data?.user;
  if(!req?.session?.regenerate) throw new Error('Session regeneration is unavailable.');
  if(!session?.access_token || !session?.refresh_token || !user?.id){
    throw new Error('Authenticated session payload is incomplete.');
  }
  return new Promise((resolve,reject)=>{
    req.session.regenerate(err=>{
      if(err) return reject(err);
      req.session.auth={
        accessToken:session.access_token,
        refreshToken:session.refresh_token,
        userId:user.id
      };

      if(typeof rememberMe==='boolean'){
        req.session.cookie.maxAge=rememberMe
          ?30*24*60*60*1000
          :null;
      }

      resolve();
    });
  });
}
module.exports={setAuthSession};
