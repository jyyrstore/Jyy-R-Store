const crypto=require('crypto');
const {csrfForSession,safeEqual}=require('../config/security');
const {log}=require('../config/logging');
const {rateLimit}=require('express-rate-limit');
const {loadEnv}=require('../config/env');
const {requestPath}=require('../utils/request-path');

const limiterCache=new Map();


const sensitiveApiPrefixes=[
  '/auth',
  '/payment',
  '/deposit',
  '/orders',
  '/download',
  '/tickets',
  '/messages',
  '/owner'
];

function isSensitiveApiPath(req){
  const path=requestPath(req)||'';
  return sensitiveApiPrefixes.some(
    prefix=>path===prefix || path.startsWith(prefix+'/')
  );
}

function windowSpec(ms){
  const seconds=Math.max(
    1,
    Math.round(Number(ms||60000)/1000)
  );
  return `${seconds} s`;
}

async function getSharedLimiter(kind,windowMs,max){
  const env=loadEnv();

  if(
    !env.UPSTASH_REDIS_REST_URL ||
    !env.UPSTASH_REDIS_REST_TOKEN
  ){
    return null;
  }

  const key=`${kind}:${windowMs}:${max}`;

  if(!limiterCache.has(key)){
    limiterCache.set(
      key,
      (async()=>{
        const [{Ratelimit},{Redis}]=await Promise.all([
          import('@upstash/ratelimit'),
          import('@upstash/redis')
        ]);

        const redis=new Redis({
          url:env.UPSTASH_REDIS_REST_URL,
          token:env.UPSTASH_REDIS_REST_TOKEN
        });

        return new Ratelimit({
          redis,
          limiter:Ratelimit.slidingWindow(
            max,
            windowSpec(windowMs)
          ),
          prefix:`jyyr-store:${kind}`,
          analytics:false
        });
      })()
    );
  }

  return limiterCache.get(key);
}

function sharedOrLocalRateLimit(kind){
  const env=loadEnv();

  const local=rateLimit({
    windowMs:env.RATE_LIMIT_WINDOW_MS,
    max:
      kind==='sensitive'
        ? env.SENSITIVE_RATE_LIMIT_MAX
        : env.RATE_LIMIT_MAX,
    standardHeaders:'draft-8',
    legacyHeaders:false,
    skip:req=>
      requestPath(req)==='/api/payment/webhook' ||
      (
        kind==='general' &&
        isSensitiveApiPath(req)
      )
  });

  return async function sharedLimiter(req,res,next){
    if(requestPath(req)==='/api/payment/webhook'){
      return next();
    }

    if(
      kind==='general' &&
      isSensitiveApiPath(req)
    ){
      return next();
    }

    try{
      const limiter=await getSharedLimiter(
        kind,
        env.RATE_LIMIT_WINDOW_MS,
        kind==='sensitive'
          ? env.SENSITIVE_RATE_LIMIT_MAX
          : env.RATE_LIMIT_MAX
      );

      if(!limiter){
        return local(req,res,next);
      }

      const identifier=`ip:${req.ip}`;
      const result=await limiter.limit(identifier);

      res.setHeader(
        'x-ratelimit-limit',
        String(result.limit)
      );

      res.setHeader(
        'x-ratelimit-remaining',
        String(result.remaining)
      );

      if(result.reset){
        res.setHeader(
          'x-ratelimit-reset',
          String(
            Math.ceil(
              Number(result.reset)/1000
            )
          )
        );
      }

      if(!result.success){
        return res.status(429).json({
          success:false,
          error:{
            code:'RATE_LIMITED',
            message:'Too many requests. Please try again later.',
            retryAfter:Math.max(
              1,
              Math.ceil(
                (
                  Number(result.reset) -
                  Date.now()
                )/1000
              )
            )
          }
        });
      }

      return next();
    }catch(error){
      log(
        'warn',
        'distributed_rate_limit_unavailable',
        {
          kind,
          message:error?.message||String(error)
        }
      );

      return local(req,res,next);
    }
  };
}

function requestId(req,res,next){
  req.id=crypto.randomUUID();
  res.setHeader(
    'x-request-id',
    req.id
  );
  next();
}

function loggingMiddleware(req,res,next){
  const start=Date.now();

  res.on('finish',()=>{
    log(
      'info',
      'request',
      {
        requestId:req.id,
        method:req.method,
        path:requestPath(req),
        status:res.statusCode,
        durationMs:Date.now()-start,
        userId:req.user?.id||null
      }
    );
  });

  next();
}

function securityHeaders(req,res,next){
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'Cross-Origin-Opener-Policy',
    'same-origin'
  );

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  next();
}

function csrfMiddleware(req,res,next){
  const safe=[
    'GET',
    'HEAD',
    'OPTIONS'
  ];

  const token=csrfForSession(
    req.session||{}
  );

  req.csrfToken=()=>token;
  res.locals.csrfToken=token;

  if(
    !safe.includes(req.method) &&
    requestPath(req)!=='/api/payment/webhook'
  ){
    const sent=
      req.get('x-csrf-token') ||
      req.body?._csrf;

    if(!safeEqual(sent,token)){
      return res.status(403).json({
        success:false,
        error:{
          code:'CSRF_INVALID',
          message:'Security token is missing or invalid.'
        }
      });
    }
  }

  next();
}

function generalRateLimit(){
  return sharedOrLocalRateLimit('general');
}

function sensitiveRateLimit(){
  return sharedOrLocalRateLimit('sensitive');
}

module.exports={
  requestId,
  loggingMiddleware,
  securityHeaders,
  csrfMiddleware,
  generalRateLimit,
  sensitiveRateLimit
};
