const { supabasePublic } = require('../config/supabase');
const { query } = require('../config/database');
async function authMiddleware(req,res,next){
  try {
    req.user = null; req.profile = null;
    if (!req.session?.auth) { res.locals.currentUser=null; res.locals.profile=null; return next(); }
    const session = req.session.auth;
    const client = supabasePublic();
    const set = await client.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
    if (set.error || !set.data?.user) { delete req.session.auth; res.locals.currentUser=null; return next(); }
    if (set.data.session && set.data.session.access_token !== session.accessToken) {
      req.session.auth = { accessToken:set.data.session.access_token, refreshToken:set.data.session.refresh_token, userId:set.data.user.id };
    }
    const result = await query('select id, username, email, role, status, avatar_path, created_at, last_login_at from profiles where id=$1',[set.data.user.id]);
    const profile=result.rows[0] || null;
    if (!profile) { res.locals.currentUser=set.data.user; res.locals.profile=null; req.user=set.data.user; return next(); }
    if (['BANNED','SUSPENDED'].includes(profile.status)) { delete req.session.auth; if (req.originalUrl.startsWith('/api/')) return res.status(403).json({success:false,error:{code:'ACCOUNT_DISABLED',message:'Account is not active.'}}); return res.redirect('/auth/login?error=account-disabled'); }
    req.user=set.data.user; req.profile=profile; res.locals.currentUser=set.data.user; res.locals.profile=profile;
    next();
  } catch (e) { next(e); }
}
function requireAuth(req,res,next){ if(!req.user) return req.originalUrl.startsWith('/api/') ? res.status(401).json({success:false,error:{code:'UNAUTHORIZED',message:'Authentication required'}}) : res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl)}`); next(); }
module.exports={authMiddleware,requireAuth};
