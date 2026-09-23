const { withTransaction }=require('../../config/database');
const provider=()=>require('../../config/payment').paymentProvider();
const delivery=require('../../repositories/delivery.repository');
const notifications=require('../../repositories/notification.repository');
const { badRequest, notFound, forbidden }=require('../../utils/error');
const {loadEnv}=require('../../config/env');
const profiles=require('../../repositories/profiles.repository');

const PAYMENT_CREATABLE_ORDER_STATUSES=new Set(['PENDING']);

const PAYMENT_TRANSITIONS={
  PENDING:new Set(['PENDING','PAID','FAILED','EXPIRED','CANCELLED']),
  PAID:new Set(['PAID']),
  FAILED:new Set(['FAILED']),
  EXPIRED:new Set(['EXPIRED']),
  CANCELLED:new Set(['CANCELLED']),
  REFUNDED:new Set(['REFUNDED'])
};

async function createForOrder(userId,order,returnUrl){
  const profile=await profiles.findById(userId).catch(()=>null);

  const customerName=String(
    profile?.full_name||
    profile?.display_name||
    profile?.name||
    profile?.username||
    profile?.email?.split('@')[0]||
    'Customer'
  );

  const customerEmail=profile?.email||null;

  return withTransaction(async(client)=>{
    const locked=(await client.query('select * from orders where id=$1 for update',[order.id])).rows[0];
    if(!locked) throw notFound('Order not found.');
    if(locked.user_id!==userId) throw forbidden();
    if(!PAYMENT_CREATABLE_ORDER_STATUSES.has(String(locked.status||'').toUpperCase())){
      throw badRequest('ORDER_PAYMENT_STATE_INVALID','Payment hanya dapat dibuat untuk order yang masih PENDING.');
    }

    const existing=(await client.query(
      "select * from payments where order_id=$1 and status='PENDING' order by created_at desc limit 1 for update",
      [locked.id]
    )).rows[0];

    if(existing){
      return {
        payment:existing,
        paymentUrl:existing.raw_reference?.paymentUrl||existing.raw_reference?.payment_url||null,
        duplicate:true
      };
    }

    const idempotencyKey=`order:${locked.id}:payment`;
    const result=await provider().createPayment({
      orderId:locked.id,
      amount:locked.total,
      customer:{
        userId,
        givenNames:customerName,
        email:customerEmail
      },
      returnUrl,
      idempotencyKey
    });

    try{
      const p=(await client.query(
        'insert into payments(order_id,user_id,provider,reference,amount,status,raw_reference,idempotency_key,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',
        [
          locked.id,
          userId,
          loadEnv().PAYMENT_PROVIDER||'generic-json',
          result.reference,
          locked.total,
          'PENDING',
          {...(result.raw||{}),paymentUrl:result.paymentUrl||null},
          idempotencyKey,
          result.expiresAt||null
        ]
      )).rows[0];
      return {payment:p,paymentUrl:result.paymentUrl};
    }catch(error){
      if(error?.code==='23505'){
        const concurrent=(await client.query(
          "select * from payments where order_id=$1 and status='PENDING' order by created_at desc limit 1 for update",
          [locked.id]
        )).rows[0];
        if(concurrent){
          return {
            payment:concurrent,
            paymentUrl:concurrent.raw_reference?.paymentUrl||concurrent.raw_reference?.payment_url||null,
            duplicate:true
          };
        }
      }
      throw error;
    }
  });
}

async function getStatus(id,userId){
  const p=await require('../../repositories/payments.repository').findById(id);
  if(!p||p.user_id!==userId)throw notFound('Payment not found.');
  return p;
}

async function processWebhook(rawBody,signature,payload){
  const ok=provider().verifyWebhook(rawBody,signature);
  if(!ok) throw Object.assign(new Error('Invalid webhook signature'),{status:401,code:'WEBHOOK_SIGNATURE_INVALID',expose:true});
  const parsed=provider().parseWebhook(payload,rawBody);
  if(!parsed.eventId||!parsed.reference)throw badRequest('INVALID_WEBHOOK','Webhook payload is incomplete.');
  return withTransaction(async(client)=>{
    const prior=(await client.query('select id from payment_events where provider_event_id=$1',[parsed.eventId])).rows[0];
    if(prior)return {duplicate:true};
    const payment=(await client.query('select * from payments where reference=$1 for update',[parsed.reference])).rows[0];
    if(!payment){
      return {
        duplicate:false,
        ignored:true,
        reason:'PAYMENT_REFERENCE_NOT_FOUND',
        reference:parsed.reference
      };
    }
    if(Number(parsed.amount)!==Number(payment.amount))throw badRequest('PAYMENT_AMOUNT_MISMATCH','Payment amount does not match transaction amount.');
    const statusMap={
      PAID:'PAID',
      SUCCESS:'PAID',
      FAILED:'FAILED',
      EXPIRED:'EXPIRED',
      CANCELLED:'CANCELLED',
      REFUNDED:'REFUNDED',
      PENDING:'PENDING'
    };

    const next=statusMap[String(parsed.status||'').toUpperCase()];

    if(!next){
      throw badRequest(
        'INVALID_PAYMENT_STATUS',
        'Webhook payment status tidak dikenal.'
      );
    }

    const current=String(payment.status||'PENDING').toUpperCase();
    const allowed=PAYMENT_TRANSITIONS[current];

    if(!allowed || !allowed.has(next)){
      await client.query(
        'insert into payment_events(payment_id,provider,provider_event_id,payload,processed_at) values($1,$2,$3,$4,now())',
        [
          payment.id,
          loadEnv().PAYMENT_PROVIDER||'generic-json',
          parsed.eventId,
          payload
        ]
      );

      await client.query(
        'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
        [
          'PAYMENT_WEBHOOK_IGNORED',
          'payment',
          payment.id,
          {
            reference:parsed.reference,
            currentStatus:current,
            requestedStatus:next,
            reason:'INVALID_STATE_TRANSITION'
          }
        ]
      );

      return {
        duplicate:false,
        ignored:true,
        paymentStatus:current,
        requestedStatus:next,
        paymentId:payment.id
      };
    }

    await client.query(
      'insert into payment_events(payment_id,provider,provider_event_id,payload,processed_at) values($1,$2,$3,$4,now())',
      [
        payment.id,
        loadEnv().PAYMENT_PROVIDER||'generic-json',
        parsed.eventId,
        payload
      ]
    );

    await client.query(
      'update payments set status=$2,raw_reference=$3,paid_at=case when $2=\'PAID\' then coalesce(paid_at,now()) else paid_at end,updated_at=now() where id=$1',
      [payment.id,next,payload]
    );

    if(!payment.order_id){
      const dep=(await client.query('select * from deposits where payment_id=$1 for update',[payment.id])).rows[0];
      if(dep && next==='PAID' && dep.status!=='SUCCESS'){
        const wallet=(await client.query('select * from wallets where user_id=$1 for update',[payment.user_id])).rows[0] || (await client.query('insert into wallets(user_id) values($1) returning *',[payment.user_id])).rows[0];
        const before=Number(wallet.balance), after=before+Number(dep.amount);
        await client.query("update wallets set balance=$2,updated_at=now() where user_id=$1",[payment.user_id,after]);
        await client.query("insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference,status) values($1,$2,'DEPOSIT',$3,$4,$5,$6,'COMPLETED')",[wallet.id,payment.user_id,dep.amount,before,after,dep.reference||parsed.reference]);
        await client.query("update deposits set status='SUCCESS',webhook_status='PAID',paid_at=now(),updated_at=now() where id=$1",[dep.id]);
        await notifications.create({user_id:payment.user_id,type:'DEPOSIT',title:'Deposit berhasil',body:`Deposit ${dep.reference||parsed.reference} sebesar Rp${Number(dep.amount).toLocaleString('id-ID')} berhasil ditambahkan.`,link:'/deposit'},client);
      } else if(dep && ['FAILED','EXPIRED','CANCELLED','REFUNDED'].includes(next) && dep.status==='PENDING'){
        const depStatus=next==='REFUNDED'?'REFUNDED':next;
        await client.query('update deposits set status=$2,webhook_status=$3,updated_at=now() where id=$1',[dep.id,depStatus,next]);
      }
      await client.query('insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)', ['PAYMENT_WEBHOOK','payment',payment.id,{reference:parsed.reference,status:next,depositId:dep?.id||null}]);
      return {duplicate:false,paymentStatus:next,depositId:dep?.id||null};
    }
    const order=(await client.query('select * from orders where id=$1 for update',[payment.order_id])).rows[0];
    if(!order)throw notFound('Order not found.');
    if(next==='PAID' && order.status!=='PAID'){
      const items=(await client.query('select * from order_items where order_id=$1',[order.id])).rows;
      for(const i of items){
        const p=(await client.query('select stock,reserved_stock from products where id=$1 for update',[i.product_id])).rows[0];
        if(!p||Number(p.reserved_stock)<Number(i.quantity)||Number(p.stock)<Number(i.quantity))throw badRequest('FULFILLMENT_STOCK_CONFLICT','Product stock is no longer available for this paid order.');
        await client.query('update products set stock=stock-$2,reserved_stock=greatest(reserved_stock-$2,0),purchase_count=purchase_count+$2,updated_at=now() where id=$1',[i.product_id,i.quantity]);
        await client.query("insert into product_events(product_id,user_id,event_type) values($1,$2,'PURCHASE')",[i.product_id,payment.user_id]);
        await delivery.createEntitlement({userId:payment.user_id,productId:i.product_id,orderId:order.id},client);
      }
      await client.query("update orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=$1",[order.id]);
      await notifications.create({user_id:payment.user_id,type:'PAYMENT',title:'Pembayaran berhasil',body:`Pembayaran untuk ${order.order_number} berhasil diverifikasi.`,link:`/orders/${order.id}`},client);
      await notifications.create({user_id:payment.user_id,type:'ORDER',title:'Produk siap digunakan',body:`Order ${order.order_number} sudah dibayar dan akses content tersedia.`,link:`/orders/${order.id}`},client);
    } else if(['FAILED','EXPIRED','CANCELLED'].includes(next) && order.status==='PENDING'){
      await client.query("update orders set status=$2,updated_at=now() where id=$1",[order.id,next]);
      const items=(await client.query('select product_id,quantity from order_items where order_id=$1',[order.id])).rows;
      for(const i of items)await client.query('update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.product_id,i.quantity]);
    }
    await client.query('insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)', ['PAYMENT_WEBHOOK','payment',payment.id,{reference:parsed.reference,status:next,orderId:order.id}]);
    return {duplicate:false,paymentStatus:next,orderId:order.id};
  });
}
module.exports={createForOrder,getStatus,processWebhook};
