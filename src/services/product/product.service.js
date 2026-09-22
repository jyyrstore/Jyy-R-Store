const products=require('../../repositories/products.repository');
const categories=require('../../repositories/categories.repository');
const { badRequest, notFound }=require('../../utils/error');
const slug=require('../../utils/slug');

async function catalog(q){ const limit=Math.min(100,Number(q.limit||20)); const page=Math.max(1,Number(q.page||1)); const opts={search:q.search||'',category:q.category||'',sort:q.sort||'newest',minPrice:q.minPrice??null,maxPrice:q.maxPrice??null,limit,offset:(page-1)*limit}; const [items,total,cats]=await Promise.all([products.list(opts),products.count(opts),categories.list(true)]); return {items,total,page,limit,categories:cats}; }

async function detailBySlug(slugValue,userId){ const product=await products.findBySlug(slugValue); if(!product||product.status!=='PUBLISHED') throw notFound('Product not found.'); product.contents=await products.contents(product.id); if(userId) await products.event(product.id,userId,'VIEW'); return product; }

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

module.exports={catalog,detailBySlug,create,update,categories};
