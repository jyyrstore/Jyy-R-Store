const products=require('../../repositories/products.repository');
const categories=require('../../repositories/categories.repository');
const { badRequest, notFound }=require('../../utils/error');
const slug=require('../../utils/slug');
async function catalog(q){ const limit=Math.min(100,Number(q.limit||20)); const page=Math.max(1,Number(q.page||1)); const opts={search:q.search||'',category:q.category||'',sort:q.sort||'newest',minPrice:q.minPrice??null,maxPrice:q.maxPrice??null,limit,offset:(page-1)*limit}; const [items,total,cats]=await Promise.all([products.list(opts),products.count(opts),categories.list(true)]); return {items,total,page,limit,categories:cats}; }
async function detailBySlug(slugValue,userId){ const product=await products.findBySlug(slugValue); if(!product||product.status!=='PUBLISHED') throw notFound('Product not found.'); product.contents=await products.contents(product.id); if(userId) await products.event(product.id,userId,'VIEW'); return product; }
async function create(data){ if(data.price<0||data.stock<0) throw badRequest('INVALID_PRODUCT','Harga/stock tidak valid.'); return products.create({...data,slug:slug(data.slug||data.name)}); }
async function update(id,data){ return products.update(id,{...data,slug:slug(data.slug||data.name)}); }
module.exports={catalog,detailBySlug,create,update,categories};
