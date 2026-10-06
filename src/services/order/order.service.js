const { withTransaction, query }=require('../../config/database');
const carts=require('../../repositories/cart.repository');
const products=require('../../repositories/products.repository');
const notifications=require('../notification/notification.service');
const delivery=require('../../repositories/delivery.repository');
const { randomId }=require('../../utils/crypto');
const { idr }=require('../../utils/currency');
const { badRequest, notFound }=require('../../utils/error');
const { normalizeStoredContact }=require('../../utils/recipient-contact');
const { sendOrderPaidEmail }=require('../email/order-notification.service');
function orderNumber(){ const d=new Date(); const part=d.toISOString().slice(0,10).replace(/-/g,''); return `JYR-${part}-${randomId().slice(-6).toUpperCase()}`; }

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBuyNowProductId(value){
  const id=String(value||'').trim();

  if(!id)return null;

  if(!UUID_RE.test(id)){
    throw badRequest(
      'INVALID_PRODUCT',
      'Produk pembelian langsung tidak valid.'
    );
  }

  return id;
}

async function directCheckoutContext(
  client,
  userId,
  productId,
  {gateway=false}={}
){
  const product=(
    await client.query(
      `select
         id,
         slug,
         name,
         price,
         stock,
         reserved_stock,
         status
       from products
       where id=$1
       for update`,
      [productId]
    )
  ).rows[0];

  if(!product||product.status!=='PUBLISHED'){
    throw badRequest(
      'PRODUCT_UNAVAILABLE',
      'Produk tidak tersedia.'
    );
  }

  const available=gateway
    ? Number(product.stock)-Number(product.reserved_stock||0)
    : Number(product.stock);

  if(available<1){
    throw badRequest(
      'INSUFFICIENT_STOCK',
      `Stock ${product.name} tidak mencukupi.`
    );
  }

  const contactRow=(
    await client.query(
      `select
         coalesce(
           c.recipient_email,
           (
             select rc.recipient_email
             from public.recipient_contacts rc
             where rc.user_id=$1
               and rc.is_default=true
             order by rc.updated_at desc
             limit 1
           )
         ) as recipient_email,
         coalesce(
           c.recipient_country_code,
           (
             select rc.recipient_country_code
             from public.recipient_contacts rc
             where rc.user_id=$1
               and rc.is_default=true
             order by rc.updated_at desc
             limit 1
           )
         ) as recipient_country_code,
         coalesce(
           c.recipient_dial_code,
           (
             select rc.recipient_dial_code
             from public.recipient_contacts rc
             where rc.user_id=$1
               and rc.is_default=true
             order by rc.updated_at desc
             limit 1
           )
         ) as recipient_dial_code,
         coalesce(
           c.recipient_phone,
           (
             select rc.recipient_phone
             from public.recipient_contacts rc
             where rc.user_id=$1
               and rc.is_default=true
             order by rc.updated_at desc
             limit 1
           )
         ) as recipient_phone
       from (
         select $1::uuid as user_id
       ) u
       left join carts c on c.user_id=u.user_id`,
      [userId]
    )
  ).rows[0]||{};

  const contact=normalizeStoredContact(contactRow);

  if(!contact){
    throw badRequest(
      'RECIPIENT_CONTACT_REQUIRED',
      'Lengkapi kontak penerima sebelum checkout.'
    );
  }

  const item={
    id:null,
    item_id:null,
    product_id:product.id,
    slug:product.slug,
    quantity:1,
    name:product.name,
    price:Number(product.price),
    stock:Number(product.stock),
    reserved_stock:Number(product.reserved_stock||0),
    status:product.status,
    lineTotal:Number(product.price)
  };

  return {
    items:[item],
    contact
  };
}

async function preview(
  userId,
  {buyNowProductId=null}={}
){
  const directProductId=normalizeBuyNowProductId(
    buyNowProductId
  );

  const c=await carts.get(userId);
  const recipient=normalizeStoredContact(c);

  if(directProductId){
    const product=await products.findById(
      directProductId
    );

    if(!product||product.status!=='PUBLISHED'){
      throw badRequest(
        'PRODUCT_UNAVAILABLE',
        'Produk tidak tersedia.'
      );
    }

    if(
      Number(product.stock)-
      Number(product.reserved_stock||0)<1
    ){
      throw badRequest(
        'INSUFFICIENT_STOCK',
        `Stock ${product.name} tidak mencukupi.`
      );
    }

    const item={
      id:null,
      product_id:product.id,
      slug:product.slug,
      name:product.name,
      quantity:1,
      price:Number(product.price),
      stock:Number(product.stock),
      lineTotal:Number(product.price)
    };

    return {
      items:[item],
      subtotal:item.lineTotal,
      total:item.lineTotal,
      recipientContact:recipient
        ? {
            email:recipient.email,
            countryCode:recipient.countryCode,
            countryName:recipient.countryName,
            dialCode:recipient.dialCode,
            phone:recipient.phone
          }
        : null,
      directBuyNow:true,
      buyNowProductId:product.id,
      buyNowSlug:product.slug
    };
  }

  const items=(c.items||[]).map(i=>({
    ...i,
    quantity:Number(i.quantity),
    lineTotal:Number(i.price)*Number(i.quantity)
  }));

  const total=idr(
    items.reduce(
      (sum,item)=>sum+item.lineTotal,
      0
    )
  );

  return {
    items,
    subtotal:total,
    total,
    recipientContact:recipient
      ? {
          email:recipient.email,
          countryCode:recipient.countryCode,
          countryName:recipient.countryName,
          dialCode:recipient.dialCode,
          phone:recipient.phone
        }
      : null,
    directBuyNow:false,
    buyNowProductId:null,
    buyNowSlug:null
  };
}

async function createWalletOrder(
  userId,
  idempotencyKey,
  {buyNowProductId=null}={}
){
  const existing=await query(
    'select * from orders where user_id=$1 and idempotency_key=$2',
    [userId,idempotencyKey||null]
  );

  if(idempotencyKey&&existing.rows[0]){
    return {
      order:existing.rows[0],
      duplicate:true
    };
  }

  const directProductId=normalizeBuyNowProductId(
    buyNowProductId
  );

  const result=await withTransaction(async(client)=>{
    let items;
    let contact;
    const directBuyNow=Boolean(directProductId);

    if(directBuyNow){
      const context=await directCheckoutContext(
        client,
        userId,
        directProductId,
        {gateway:false}
      );

      items=context.items;
      contact=context.contact;
    }else{
      const cartRes=await client.query(
        `select
           coalesce(
             c.recipient_email,
             (
               select rc.recipient_email
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_email,
           coalesce(
             c.recipient_country_code,
             (
               select rc.recipient_country_code
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_country_code,
           coalesce(
             c.recipient_dial_code,
             (
               select rc.recipient_dial_code
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_dial_code,
           coalesce(
             c.recipient_phone,
             (
               select rc.recipient_phone
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_phone,
           ci.id item_id,
           ci.product_id,
           ci.quantity,
           p.name,
           p.price,
           p.stock,
           p.status,
           p.id
         from cart_items ci
         join carts c on c.id=ci.cart_id
         join products p on p.id=ci.product_id
         where c.user_id=$1
         for update of c,p`,
        [userId]
      );

      if(!cartRes.rows.length){
        throw badRequest(
          'CART_EMPTY',
          'Cart kosong.'
        );
      }

      contact=normalizeStoredContact(
        cartRes.rows[0]
      );

      if(!contact){
        throw badRequest(
          'RECIPIENT_CONTACT_REQUIRED',
          'Lengkapi kontak penerima di Keranjang sebelum checkout.'
        );
      }

      items=cartRes.rows.map(item=>({
        ...item,
        quantity:Number(item.quantity),
        price:Number(item.price),
        lineTotal:Number(item.price)*Number(item.quantity)
      }));
    }

    let total=0;

    for(const item of items){
      if(item.status!=='PUBLISHED'){
        throw badRequest(
          'PRODUCT_UNAVAILABLE',
          `Produk ${item.name} tidak tersedia.`
        );
      }

      if(
        !directBuyNow &&
        Number(item.quantity)>Number(item.stock)
      ){
        throw badRequest(
          'INSUFFICIENT_STOCK',
          `Stock ${item.name} tidak mencukupi.`
        );
      }

      total+=Number(item.lineTotal);
    }

    total=idr(total);

    const wallet=(
      await client.query(
        'select * from wallets where user_id=$1 for update',
        [userId]
      )
    ).rows[0]||(
      await client.query(
        'insert into wallets(user_id) values($1) returning *',
        [userId]
      )
    ).rows[0];

    if(Number(wallet.balance)<total){
      throw badRequest(
        'INSUFFICIENT_BALANCE',
        'Saldo tidak mencukupi.'
      );
    }

    const order=(
      await client.query(
        `insert into orders(
          order_number,
          user_id,
          subtotal,
          total,
          payment_method,
          status,
          idempotency_key,
          paid_at,
          recipient_email,
          recipient_country_code,
          recipient_dial_code,
          recipient_phone
        )
        values(
          $1,
          $2,
          $3,
          $3,
          'BALANCE',
          'PAID',
          $4,
          now(),
          $5,
          $6,
          $7,
          $8
        )
        returning *`,
        [
          orderNumber(),
          userId,
          total,
          idempotencyKey||null,
          contact.email,
          contact.countryCode,
          contact.dialCode,
          contact.phone
        ]
      )
    ).rows[0];

    for(const item of items){
      await client.query(
        `insert into order_items(
          order_id,
          product_id,
          product_name,
          unit_price,
          quantity,
          line_total
        )
        values($1,$2,$3,$4,$5,$6)`,
        [
          order.id,
          item.product_id,
          item.name,
          item.price,
          item.quantity,
          Number(item.lineTotal)
        ]
      );

      await client.query(
        'update products set stock=stock-$2,purchase_count=purchase_count+$2 where id=$1',
        [
          item.product_id,
          item.quantity
        ]
      );

      await client.query(
        "insert into product_events(product_id,user_id,event_type) values($1,$2,'PURCHASE')",
        [
          item.product_id,
          userId
        ]
      );

      await delivery.createEntitlement(
        {
          userId,
          productId:item.product_id,
          orderId:order.id
        },
        client
      );
    }

    const before=Number(wallet.balance);
    const after=before-total;

    await client.query(
      'update wallets set balance=$2,updated_at=now() where user_id=$1',
      [userId,after]
    );

    await client.query(
      `insert into wallet_transactions(
        wallet_id,
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference,
        status
      )
      values(
        $1,
        $2,
        'PURCHASE',
        $3,
        $4,
        $5,
        $6,
        'COMPLETED'
      )`,
      [
        wallet.id,
        userId,
        total,
        before,
        after,
        order.order_number
      ]
    );

    if(!directBuyNow){
      await carts.clear(userId,client);
    }

    await notifications.notify(
      userId,
      {
        type:'ORDER',
        title:'Pembelian berhasil',
        body:`Order ${order.order_number} berhasil dibayar dengan saldo.`,
        link:`/orders/${order.id}`
      },
      client
    );

    await notifications.notify(
      userId,
      {
        type:'PAYMENT',
        title:'Pembayaran berhasil',
        body:`Pembayaran ${order.order_number} berhasil.`,
        link:`/orders/${order.id}`
      },
      client
    );

    return {
      order,
      directBuyNow
    };
  });

  if(result?.order?.recipient_email){
    await sendOrderPaidEmail(result.order).catch(error=>{
      console.warn(
        '[ORDER EMAIL] wallet order-paid notification failed:',
        error?.message||String(error)
      );
    });
  }

  return result;
}

async function createGatewayOrder(
  userId,
  {idempotencyKey,returnUrl,buyNowProductId=null}
){
  const existing=idempotencyKey
    ? (
        await query(
          'select * from orders where user_id=$1 and idempotency_key=$2',
          [userId,idempotencyKey]
        )
      ).rows[0]
    : null;

  if(existing){
    return {
      order:existing,
      duplicate:true
    };
  }

  const directProductId=normalizeBuyNowProductId(
    buyNowProductId
  );

  return withTransaction(async(client)=>{
    let items;
    let contact;

    if(directProductId){
      const context=await directCheckoutContext(
        client,
        userId,
        directProductId,
        {gateway:true}
      );

      items=context.items;
      contact=context.contact;
    }else{
      const cartRes=await client.query(
        `select
           coalesce(
             c.recipient_email,
             (
               select rc.recipient_email
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_email,
           coalesce(
             c.recipient_country_code,
             (
               select rc.recipient_country_code
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_country_code,
           coalesce(
             c.recipient_dial_code,
             (
               select rc.recipient_dial_code
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_dial_code,
           coalesce(
             c.recipient_phone,
             (
               select rc.recipient_phone
               from public.recipient_contacts rc
               where rc.user_id=c.user_id
                 and rc.is_default=true
               order by rc.updated_at desc
               limit 1
             )
           ) as recipient_phone,
           ci.id item_id,
           ci.product_id,
           ci.quantity,
           p.name,
           p.price,
           p.stock,
           p.reserved_stock,
           p.status,
           p.id
         from cart_items ci
         join carts c on c.id=ci.cart_id
         join products p on p.id=ci.product_id
         where c.user_id=$1
         for update`,
        [userId]
      );

      if(!cartRes.rows.length){
        throw badRequest(
          'CART_EMPTY',
          'Cart kosong.'
        );
      }

      contact=normalizeStoredContact(
        cartRes.rows[0]
      );

      if(!contact){
        throw badRequest(
          'RECIPIENT_CONTACT_REQUIRED',
          'Lengkapi kontak penerima di Keranjang sebelum checkout.'
        );
      }

      items=cartRes.rows.map(item=>({
        ...item,
        quantity:Number(item.quantity),
        price:Number(item.price)
      }));
    }

    let total=0;

    for(const item of items){
      if(item.status!=='PUBLISHED'){
        throw badRequest(
          'PRODUCT_UNAVAILABLE',
          `Produk ${item.name} tidak tersedia.`
        );
      }

      if(
        !directProductId &&
        Number(item.stock)-Number(item.reserved_stock||0)<
        Number(item.quantity)
      ){
        throw badRequest(
          'INSUFFICIENT_STOCK',
          `Stock ${item.name} tidak mencukupi.`
        );
      }

      item.lineTotal=
        Number(item.price)*Number(item.quantity);

      total+=item.lineTotal;
    }

    total=idr(total);

    const order=(
      await client.query(
        `insert into orders(
          order_number,
          user_id,
          subtotal,
          total,
          payment_method,
          status,
          idempotency_key,
          recipient_email,
          recipient_country_code,
          recipient_dial_code,
          recipient_phone
        )
        values(
          $1,
          $2,
          $3,
          $3,
          'GATEWAY',
          'PENDING',
          $4,
          $5,
          $6,
          $7,
          $8
        )
        returning *`,
        [
          orderNumber(),
          userId,
          total,
          idempotencyKey||null,
          contact.email,
          contact.countryCode,
          contact.dialCode,
          contact.phone
        ]
      )
    ).rows[0];

    for(const item of items){
      await client.query(
        `insert into order_items(
          order_id,
          product_id,
          product_name,
          unit_price,
          quantity,
          line_total
        )
        values($1,$2,$3,$4,$5,$6)`,
        [
          order.id,
          item.product_id,
          item.name,
          item.price,
          item.quantity,
          item.lineTotal
        ]
      );

      await client.query(
        'update products set reserved_stock=reserved_stock+$2 where id=$1',
        [
          item.product_id,
          item.quantity
        ]
      );
    }

    return {
      order,
      items,
      directBuyNow:Boolean(directProductId)
    };
  });
}

async function ownerUpdateStatus(ownerId,orderId,status){
  const allowed=new Set(['PENDING','PAID','PROCESSING','COMPLETED','CANCELLED']);
  if(!allowed.has(status)) throw badRequest('INVALID_ORDER_STATUS','Status order tidak valid untuk aksi owner.');
  return withTransaction(async(client)=>{
    const order=(await client.query('select * from orders where id=$1 for update',[orderId])).rows[0];
    if(!order) throw notFound('Order tidak ditemukan.');
    const from=order.status;
    const valid=(from==='PAID'&&status==='PROCESSING')||(from==='PROCESSING'&&status==='COMPLETED')||(from==='PENDING'&&status==='CANCELLED')||(from===status);
    if(!valid) throw badRequest('INVALID_ORDER_TRANSITION',`Perubahan status ${from} → ${status} tidak diizinkan.`);
    if(from===status) return order;
    if(status==='CANCELLED'){
      const items=(await client.query('select product_id,quantity from order_items where order_id=$1',[orderId])).rows;
      for(const i of items) await client.query('update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.product_id,i.quantity]);
    }
    const updated=(await client.query("update orders set status=$2::order_status,completed_at=case when $2::order_status='COMPLETED'::order_status then now() else completed_at end,updated_at=now() where id=$1 returning *",[orderId,status])).rows[0];
    await client.query('insert into activity_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5)',[ownerId,'OWNER_ORDER_STATUS','order',orderId,{from,to:status}]);
    await notifications.notify(order.user_id,{type:'ORDER',title:`Status order ${order.order_number} diperbarui`,body:`Status order sekarang ${status}.`,link:`/orders/${orderId}`},client);
    return updated;
  });
}

async function getUserOrders(userId,opts){ return require('../../repositories/orders.repository').listForUser(userId,opts); }
module.exports={preview,createWalletOrder,createGatewayOrder,getUserOrders,ownerUpdateStatus};
