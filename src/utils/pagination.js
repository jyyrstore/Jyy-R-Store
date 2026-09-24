function pageParams(query={}) {
  const page=Math.max(
    1,
    Number.parseInt(query.page,10)||1
  );

  const limit=Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(query.limit,10)||20
    )
  );

  return {
    page,
    limit,
    offset:(page-1)*limit
  };
}

function paginationUrl(req,param,page,extra={}){
  const url=new URL(
    req.originalUrl||req.url,
    'http://localhost'
  );

  url.searchParams.set(param,String(page));

  for(const [key,value] of Object.entries(extra)){
    if(value===undefined||value===null||value===''){
      url.searchParams.delete(key);
    }else{
      url.searchParams.set(key,String(value));
    }
  }

  return url.pathname+
    (
      url.searchParams.toString()
        ? `?${url.searchParams.toString()}`
        : ''
    );
}

module.exports={
  pageParams,
  paginationUrl
};
