function safeNextPath(value,fallback='/dashboard'){
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')) return fallback;
  return value;
}

function safeSameOriginUrl(value,fallbackPath,appUrl){
  const base=new URL(String(appUrl||''));
  const fallback=new URL(String(fallbackPath||'/'),base);
  if(typeof value!=='string'||!value.trim()) return fallback.toString();

  try{
    const target=new URL(value,base);
    if(target.origin!==base.origin||target.protocol!==base.protocol) return fallback.toString();
    return target.toString();
  }catch{
    return fallback.toString();
  }
}

module.exports={safeNextPath,safeSameOriginUrl};
