const cart=require('../../repositories/cart.repository');
const products=require('../../repositories/products.repository');
const { badRequest, notFound }=require('../../utils/error');
const {
  normalizeRecipientContact,
  normalizeStoredContact
}=require('../../utils/recipient-contact');

async function get(userId){
  const data=await cart.get(userId);

  data.items=(data.items||[]).map(i=>({
    ...i,
    quantity:Number(i.quantity),
    lineTotal:Number(i.price)*Number(i.quantity)
  }));

  data.total=data.items.reduce(
    (a,i)=>a+i.lineTotal,
    0
  );

  data.recipientContact=normalizeStoredContact(data);

  return data;
}

async function setContact(userId,contact){
  const normalized=normalizeRecipientContact(contact);
  await cart.saveDefaultRecipientContact(userId,normalized);
  return normalized;
}

async function add(userId,productId,quantity,variantId=null){
  const p=await products.findById(productId);
  if(!p||p.status!=='PUBLISHED') throw notFound('Product not found.');
  if(quantity<1||quantity>100) throw badRequest('INVALID_QUANTITY','Quantity tidak valid.');
  const selectedVariantId=String(variantId||'').trim()||null;
  if(p.pricing_mode==='VARIANT'&&!selectedVariantId) throw badRequest('PRODUCT_VARIANT_REQUIRED','Pilih nominal variasi produk terlebih dahulu.');
  if(p.pricing_mode!=='VARIANT'&&selectedVariantId) throw badRequest('PRODUCT_VARIANT_INVALID','Produk ini tidak menggunakan variasi.');
  if(selectedVariantId){
    const v=await products.findVariant(productId,selectedVariantId);
    if(!v) throw notFound('Variasi produk tidak ditemukan atau sudah tidak aktif.');
    if(Number(v.stock)-Number(v.reserved_stock||0)<quantity) throw badRequest('INSUFFICIENT_STOCK',`Stok ${v.label} tidak mencukupi.`);
  }else if(Number(p.stock)-Number(p.reserved_stock||0)<quantity){
    throw badRequest('INSUFFICIENT_STOCK','Stok produk tidak mencukupi.');
  }
  const c=await cart.upsertItem(userId,productId,quantity,selectedVariantId);
  await products.event(productId,userId,'CART_ADD');
  return c;
}

async function set(userId,itemId,quantity){
  if(quantity<1||quantity>100){
    throw badRequest(
      'INVALID_QUANTITY',
      'Quantity tidak valid.'
    );
  }

  return cart.setItem(
    userId,
    itemId,
    quantity
  );
}

module.exports={
  get,
  setContact,
  add,
  set,
  remove:cart.removeItem,
  clear:cart.clear
};
