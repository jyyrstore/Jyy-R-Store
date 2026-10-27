const products=require('../../repositories/products.repository');
const categories=require('../../repositories/categories.repository');
const { badRequest, notFound }=require('../../utils/error');
const slug=require('../../utils/slug');

function parsePriceFilter(value,name){
  if(value===undefined||value===null||value===''){
    return null;
  }

  const n=Number(value);

  if(!Number.isSafeInteger(n)||n<0){
    throw badRequest(
      'INVALID_PRICE_FILTER',
      `${name} harus berupa bilangan bulat >= 0.`
    );
  }

  return n;
}

async function catalog(q={}){
  const limit=Math.min(100,Math.max(1,Number(q.limit||20)));
  const page=Math.max(1,Number(q.page||1));
  const minPrice=parsePriceFilter(q.minPrice,'minPrice');
  const maxPrice=parsePriceFilter(q.maxPrice,'maxPrice');

  if(
    minPrice!==null &&
    maxPrice!==null &&
    minPrice>maxPrice
  ){
    throw badRequest(
      'INVALID_PRICE_RANGE',
      'minPrice tidak boleh lebih besar dari maxPrice.'
    );
  }

  const opts={
    search:q.search||'',
    category:q.category||'',
    sort:q.sort||'newest',
    minPrice,
    maxPrice,
    limit,
    offset:(page-1)*limit
  };

  const [items,total,cats]=await Promise.all([
    products.list(opts),
    products.count(opts),
    categories.list(true)
  ]);

  return {
    items,
    total,
    page,
    limit,
    categories:cats
  };
}

async function detailBySlug(slugValue,userId){
  const product=await products.findBySlug(slugValue);
  if(!product||product.status!=='PUBLISHED')
    throw notFound('Product not found.');

  await products.event(product.id,userId,'VIEW');
  product.view_count=Number(product.view_count||0)+1;
  product.variants=await products.listVariants(product.id);
  if(product.pricing_mode==='VARIANT'){
    product.price=product.variants.length?Math.min(...product.variants.map(v=>Number(v.price))):Number(product.price||0);
    product.stock=product.variants.reduce((sum,v)=>sum+Math.max(0,Number(v.stock)-Number(v.reserved_stock||0)),0);
  }else{
    product.stock=Math.max(0,Number(product.stock||0)-Number(product.reserved_stock||0));
  }

  return product;
}

async function uniqueSlug(value,excludeId=null){
  const base=slug(value)||'product';
  let candidate=base;
  for(let i=2;i<=1000;i++){
    const existing=await products.findBySlug(candidate);
    if(!existing || String(existing.id)===String(excludeId)) return candidate;
    candidate=base+'-'+i;
  }
  return base+'-'+Date.now().toString(36);
}

async function create(data){
  if(data.price<0||data.stock<0) throw badRequest('INVALID_PRODUCT','Harga/stock tidak valid.');
  const pricingMode=String(data.pricing_mode||'FIXED').toUpperCase();
  if(!['FIXED','VARIANT'].includes(pricingMode)) throw badRequest('INVALID_PRICING_MODE','Mode harga tidak valid.');
  data={...data,pricing_mode:pricingMode};
  let candidate=await uniqueSlug(data.slug||data.name);

  for(let attempt=0;attempt<5;attempt++){
    try{
      return await products.create({...data,slug:candidate});
    }catch(error){
      if(error?.code!=='23505' || !String(error?.constraint||'').includes('products_slug_key')) throw error;
      candidate=await uniqueSlug(candidate+'-'+(attempt+2));
    }
  }

  throw badRequest('PRODUCT_SLUG_CONFLICT','Slug produk sedang dipakai. Coba lagi.');
}

async function update(id,data){
  const current=await products.findById(id);
  if(!current) throw notFound('Product not found.');

  if(Object.prototype.hasOwnProperty.call(data,'pricing_mode')){
    const mode=String(data.pricing_mode||'FIXED').toUpperCase();
    if(!['FIXED','VARIANT'].includes(mode)) throw badRequest('INVALID_PRICING_MODE','Mode harga tidak valid.');
    if(mode!==current.pricing_mode && (Number(current.reserved_stock||0)>0 || await products.hasReservedVariants(id))) throw badRequest('PRODUCT_VARIANT_RESERVED','Mode harga tidak dapat diubah selama ada stok yang direservasi oleh pembayaran pending.');
    data={...data,pricing_mode:mode};
  }

  if(Object.prototype.hasOwnProperty.call(data,'stock')){
    const nextStock=Number(data.stock);
    const reservedStock=Number(current.reserved_stock||0);

    if(!Number.isSafeInteger(nextStock)||nextStock<0){
      throw badRequest(
        'INVALID_STOCK',
        'Stock produk harus berupa bilangan bulat >= 0.'
      );
    }

    if(nextStock<reservedStock){
      throw badRequest(
        'INVALID_STOCK',
        'Stock tidak boleh lebih kecil dari reserved_stock.'
      );
    }
  }

  let candidate=await uniqueSlug(data.slug||data.name||current.slug,id);

  for(let attempt=0;attempt<5;attempt++){
    try{
      return await products.update(id,{...data,slug:candidate});
    }catch(error){
      if(error?.code!=='23505' || !String(error?.constraint||'').includes('products_slug_key')) throw error;
      candidate=await uniqueSlug(candidate+'-'+(attempt+2),id);
    }
  }

  throw badRequest('PRODUCT_SLUG_CONFLICT','Slug produk sedang dipakai. Coba lagi.');
}

async function saveVariants(id,variants){
  const current=await products.findById(id);
  if(!current) throw notFound('Product not found.');
  if(current.pricing_mode==='VARIANT'&&(!Array.isArray(variants)||variants.length===0)) throw badRequest('PRODUCT_VARIANT_REQUIRED','Produk VARIANT harus memiliki minimal satu variasi aktif.');
  if(current.pricing_mode!=='VARIANT'&&Array.isArray(variants)&&variants.length) throw badRequest('PRODUCT_NOT_VARIANT','Ubah mode harga menjadi VARIANT terlebih dahulu.');
  return products.saveVariants(id,variants||[]);
}

module.exports={catalog,detailBySlug,create,update,saveVariants,categories};
