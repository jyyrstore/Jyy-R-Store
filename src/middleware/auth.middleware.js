const { supabasePublic } = require('../config/supabase');
const { query } = require('../config/database');
const AUTH_REFRESH_WINDOW_SECONDS = 120;
const refreshInFlight = new Map();

function jwtExpiry(accessToken){
  try{
    const parts=String(accessToken||'').split('.');
    if(parts.length!==3) return null;

    const payload=JSON.parse(
      Buffer.from(parts[1],'base64url').toString('utf8')
    );

    const exp=Number(payload.exp);
    return Number.isFinite(exp) ? exp : null;
  }catch{
    return null;
  }
}

function clearAuth(req,res){
  delete req.session.auth;
  req.user=null;
  req.profile=null;
  res.locals.currentUser=null;
  res.locals.profile=null;
}

async function refreshAuthSession(refreshToken){
  if(!refreshToken){
    throw new Error('AUTH_REFRESH_TOKEN_MISSING');
  }

  const existing=refreshInFlight.get(refreshToken);
  if(existing) return existing;

  const promise=(async()=>{
    const {data,error}=await supabasePublic().auth.refreshSession({
      refresh_token:refreshToken
    });

    if(
      error ||
      !data?.session?.access_token ||
      !data?.session?.refresh_token
    ){
      throw error || new Error('AUTH_REFRESH_FAILED');
    }

    return data.session;
  })();

  refreshInFlight.set(refreshToken,promise);

  try{
    return await promise;
  }finally{
    if(refreshInFlight.get(refreshToken)===promise){
      refreshInFlight.delete(refreshToken);
    }
  }
}

async function authMiddleware(req,res,next){
  try{
    req.user=null;
    req.profile=null;

    if(!req.session?.auth){
      res.locals.currentUser=null;
      res.locals.profile=null;
      return next();
    }

    const stored=req.session.auth;

    if(
      !stored.accessToken ||
      !stored.refreshToken ||
      !stored.userId
    ){
      clearAuth(req,res);
      return next();
    }

    let accessToken=stored.accessToken;
    let refreshToken=stored.refreshToken;

    /*
     * exp is only used to decide whether a refresh is needed.
     * It is NOT trusted as proof of identity.
     * getClaims() performs the actual JWT verification.
     */
    const exp=jwtExpiry(accessToken);
    const now=Math.floor(Date.now()/1000);

    if(
      exp !== null &&
      exp <= now + AUTH_REFRESH_WINDOW_SECONDS
    ){
      const refreshed=await refreshAuthSession(refreshToken);

      accessToken=refreshed.access_token;
      refreshToken=refreshed.refresh_token;

      req.session.auth={
        accessToken,
        refreshToken,
        userId:refreshed.user?.id || stored.userId
      };
    }

    const client=supabasePublic();

    /*
     * For ES256/asymmetric JWTs this verifies against cached JWKS
     * instead of calling the Auth /user endpoint on every request.
     */
    const claimsResult=await client.auth.getClaims(accessToken);

    let user=null;

    if(
      !claimsResult.error &&
      claimsResult.data?.claims?.sub
    ){
      const claims=claimsResult.data.claims;

      if(String(claims.sub)!==String(stored.userId)){
        clearAuth(req,res);
        return next();
      }

      user={
        id:claims.sub,
        email:claims.email || null,
        phone:claims.phone || null
      };
    }else{
      /*
       * Rare fallback:
       * if local JWKS verification cannot complete, ask the Auth
       * server to verify the token before accepting the request.
       */
      const verified=await client.auth.getUser(accessToken);

      if(
        verified.error ||
        !verified.data?.user?.id ||
        String(verified.data.user.id)!==String(stored.userId)
      ){
        clearAuth(req,res);
        return next();
      }

      user=verified.data.user;
    }

    const result=await query(
      'select id, username, email, role, status, avatar_path, created_at, last_login_at from profiles where id=$1',
      [user.id]
    );

    const profile=result.rows[0] || null;

    if(!profile){
      req.user=user;
      req.profile=null;
      res.locals.currentUser=user;
      res.locals.profile=null;
      return next();
    }

    if(['BANNED','SUSPENDED'].includes(profile.status)){
      delete req.session.auth;

      if(req.originalUrl.startsWith('/api/')){
        return res.status(403).json({
          success:false,
          error:{
            code:'ACCOUNT_DISABLED',
            message:'Account is not active.'
          }
        });
      }

      return res.redirect(
        '/auth/login?error=account-disabled'
      );
    }

    req.user=user;
    req.profile=profile;

    res.locals.currentUser=user;
    res.locals.profile=profile;

    return next();
  }catch(e){
    next(e);
  }
}

function requireAuth(req,res,next){ if(!req.user) return req.originalUrl.startsWith('/api/') ? res.status(401).json({success:false,error:{code:'UNAUTHORIZED',message:'Authentication required'}}) : res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl)}`); next(); }
module.exports={authMiddleware,requireAuth};
