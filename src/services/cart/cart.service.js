const cart=require('../../repositories/cart.repository');
const products=require('../../repositories/products.repository');
const { badRequest, notFound }=require('../../utils/error');
async function get(userId){ const data=await cart.get(userId); data.items=(data.items||[]).map(i=>({...i,quantity:Number(i.quantity),lineTotal:Number(i.price)*Number(i.quantity)})); data.total=data.items.reduce((a,i)=>a+i.lineTotal,0); return data; }
async function add(userId,productId,quantity){ const p=await products.findById(productId); if(!p||p.status!=='PUBLISHED') throw notFound('Product not found.'); if(quantity<1||quantity>100) throw badRequest('INVALID_QUANTITY','Quantity tidak valid.'); const c=await cart.upsertItem(userId,productId,quantity); await products.event(productId,userId,'CART_ADD'); return c; }
async function set(userId,itemId,quantity){ if(quantity<1||quantity>100) throw badRequest('INVALID_QUANTITY','Quantity tidak valid.'); return cart.setItem(userId,itemId,quantity); }
module.exports={get,add,set,remove:cart.removeItem,clear:cart.clear};
