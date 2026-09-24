function paginationMeta(total,page,limit=5){
  const size=Math.max(
    1,
    Number.parseInt(limit,10)||5
  );

  const totalItems=Math.max(
    0,
    Number.parseInt(total,10)||0
  );

  const totalPages=Math.ceil(
    totalItems/size
  );

  const current=Math.min(
    Math.max(
      1,
      Number.parseInt(page,10)||1
    ),
    Math.max(1,totalPages)
  );

  if(totalPages<=1){
    return {
      page:current,
      limit:size,
      total:totalItems,
      totalPages,
      pages:totalPages?[1]:[],
      showPrevious:false,
      showFirst:false,
      hasNext:false,
      showLast:false
    };
  }

  let start=current<=3 ? 1 : current-1;

  if(start+2>totalPages){
    start=Math.max(1,totalPages-2);
  }

  const end=Math.min(
    totalPages,
    start+2
  );

  return {
    page:current,
    limit:size,
    total:totalItems,
    totalPages,
    pages:Array.from(
      {length:end-start+1},
      (_,index)=>start+index
    ),
    showPrevious:current>=4,
    showFirst:current>=5,
    hasNext:current<totalPages,
    showLast:current<totalPages
  };
}

module.exports={paginationMeta};
