function safeNextPath(value,fallback='/dashboard'){
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')) return fallback;
  return value;
}

function safeSameOriginUrl(value,fallbackPath,appUrl){
  const raw=Array.isArray(appUrl)
    ?appUrl
    :String(appUrl||'').split(',');

  const allowed=raw
    .map(item=>{
      try{return new URL(String(item).trim());}
      catch{return null;}
    })
    .filter(Boolean);

  if(!allowed.length) throw new Error('APP_URL is not configured.');

  const base=allowed[0];
  const fallback=new URL(String(fallbackPath||'/'),base);

  if(typeof value!=='string'||!value.trim()) return fallback.toString();

  try{
    const target=new URL(value,base);
    const allowedOrigin=allowed.some(
      origin=>target.origin===origin.origin &&
        target.protocol===origin.protocol
    );

    if(!allowedOrigin) return fallback.toString();

    return target.toString();
  }catch{
    return fallback.toString();
  }
}

module.exports={safeNextPath,safeSameOriginUrl};
