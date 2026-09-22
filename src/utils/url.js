function safeNextPath(value,fallback='/dashboard'){
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')) return fallback;
  return value;
}
module.exports={safeNextPath};
