function requestPath(req){
  const raw=String(req?.url||'');

  if(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)){
    try{
      return new URL(raw).pathname;
    }catch(error){
      // Fall through to relative-path handling.
    }
  }

  const queryIndex=raw.indexOf('?');

  return queryIndex===-1
    ? raw
    : raw.slice(0,queryIndex);
}

module.exports={requestPath};
