const crypto = require('crypto');
const { csrfForSession, safeEqual } = require('../config/security');
const { log } = require('../config/logging');
const { rateLimit } = require('express-rate-limit');
const { loadEnv } = require('../config/env');
function requestId(req, res, next) { req.id = crypto.randomUUID(); res.setHeader('x-request-id', req.id); next(); }
function loggingMiddleware(req, res, next) { const start=Date.now(); res.on('finish',()=>log('info','request',{requestId:req.id,method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-start,userId:req.user?.id||null})); next(); }
function securityHeaders(req,res,next){ res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); next(); }
function csrfMiddleware(req,res,next){
  const safe=['GET','HEAD','OPTIONS'];
  const token=csrfForSession(req.session || {});
  res.locals.csrfToken=token;
  if (!safe.includes(req.method) && req.path !== '/api/payment/webhook') {
    const sent=req.get('x-csrf-token') || req.body?._csrf;
    if (!safeEqual(sent, token)) return res.status(403).json({success:false,error:{code:'CSRF_INVALID',message:'Security token is missing or invalid.'}});
  }
  next();
}
function generalRateLimit(){ const e=loadEnv(); return rateLimit({windowMs:e.RATE_LIMIT_WINDOW_MS,max:e.RATE_LIMIT_MAX,standardHeaders:'draft-8',legacyHeaders:false,skip:(req)=>req.path==='/api/payment/webhook'}); }
function sensitiveRateLimit(){ const e=loadEnv(); return rateLimit({windowMs:e.RATE_LIMIT_WINDOW_MS,max:e.SENSITIVE_RATE_LIMIT_MAX,standardHeaders:'draft-8',legacyHeaders:false}); }
module.exports={requestId,loggingMiddleware,securityHeaders,csrfMiddleware,generalRateLimit,sensitiveRateLimit};
