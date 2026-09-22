function setAuthSession(req,data){
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
      resolve();
    });
  });
}
module.exports={setAuthSession};
