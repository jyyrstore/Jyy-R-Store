const { withTransaction, query }=require('../../config/database'); const deposits=require('../../repositories/deposits.repository'); const payments=require('../../repositories/payments.repository'); const notifications=require('../../repositories/notification.repository'); const provider=()=>require('../../config/payment').paymentProvider(); const {loadEnv}=require('../../config/env'); const {badRequest}=require('../../utils/error');
async function create(userId,{amount,idempotencyKey,returnUrl}){
  if(!Number.isInteger(amount)||amount<1000) throw badRequest('INVALID_DEPOSIT','Minimum deposit adalah Rp 1.000.');

  const existing=idempotencyKey
    ? (await query('select * from deposits where user_id=$1 and idempotency_key=$2',[userId,idempotencyKey])).rows[0]
    : null;

  if(existing) return {deposit:existing,duplicate:true};

  try{
    return await withTransaction(async(client)=>{
      const deposit=await deposits.create({
        user_id:userId,
        amount,
        provider:loadEnv().PAYMENT_PROVIDER||'generic-json',
        status:'PENDING',
        idempotency_key:idempotencyKey||null,
        expires_at:new Date(Date.now()+30*60*1000)
      },client);
      return {deposit,createProviderPayment:async()=>{}};
    });
  }catch(error){
    if(error?.code==='23505'&&idempotencyKey){
      const concurrent=(await query('select * from deposits where user_id=$1 and idempotency_key=$2',[userId,idempotencyKey])).rows[0];
      if(concurrent) return {deposit:concurrent,duplicate:true};
    }
    throw error;
  }
}
async function createAndPay(userId,{amount,idempotencyKey,returnUrl}){
  const paymentProvider=provider();

  if(typeof paymentProvider.configured==='function'&&!paymentProvider.configured()){
    throw Object.assign(new Error('Payment provider belum dikonfigurasi.'),{
      status:503,
      code:'PAYMENT_PROVIDER_NOT_CONFIGURED',
      expose:true
    });
  }

  const made=await create(userId,{amount,idempotencyKey,returnUrl});
  let deposit=made.deposit;

  if(made.duplicate){
    if(deposit.status!=='PENDING') return made;

    if(deposit.payment_id){
      const existingPayment=await payments.findById(deposit.payment_id);
      return {
        ...made,
        payment:existingPayment,
        paymentUrl:existingPayment?.raw_reference?.paymentUrl||existingPayment?.raw_reference?.payment_url||null
      };
    }
  }

  if(idempotencyKey){
    const existingPayment=(await query(
      'select * from payments where user_id=$1 and idempotency_key=$2 order by created_at desc limit 1',
      [userId,idempotencyKey]
    )).rows[0];

    if(existingPayment){
      await query(
        "update deposits set payment_id=$2,reference=coalesce(reference,$3),updated_at=now() where id=$1 and status='PENDING'",
        [deposit.id,existingPayment.id,existingPayment.reference]
      );
      return {
        deposit:{...deposit,reference:existingPayment.reference,payment_id:existingPayment.id},
        payment:existingPayment,
        paymentUrl:existingPayment.raw_reference?.paymentUrl||existingPayment.raw_reference?.payment_url||null,
        duplicate:true
      };
    }
  }

  const providerPayment=await paymentProvider.createPayment({
    orderId:`DEPOSIT-${deposit.id}`,
    amount,
    customer:{userId},
    returnUrl,
    idempotencyKey
  });

  const payment=await withTransaction(async(client)=>{
    let existing=null;

    if(idempotencyKey){
      existing=(await client.query(
        'select * from payments where idempotency_key=$1 for update',
        [idempotencyKey]
      )).rows[0]||null;
    }

    const current=existing||(
      await client.query(
        'insert into payments(order_id,user_id,provider,reference,amount,status,raw_reference,idempotency_key,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',
        [
          null,
          userId,
          loadEnv().PAYMENT_PROVIDER||'generic-json',
          providerPayment.reference,
          amount,
          'PENDING',
          {...(providerPayment.raw||{}),paymentUrl:providerPayment.paymentUrl||null},
          idempotencyKey||null,
          providerPayment.expiresAt||null
        ]
      )
    ).rows[0];

    await client.query(
      "update deposits set payment_id=$2,reference=coalesce(reference,$3),updated_at=now() where id=$1 and status='PENDING'",
      [deposit.id,current.id,current.reference||providerPayment.reference]
    );

    return current;
  });

  return {
    deposit:{...deposit,reference:payment.reference,payment_id:payment.id},
    payment,
    paymentUrl:payment.raw_reference?.paymentUrl||payment.raw_reference?.payment_url||providerPayment.paymentUrl
  };
}
async function list(userId,options={}){
  return deposits.listForUser(
    userId,
    options
  );
}

async function count(userId){
  return deposits.countForUser(userId);
}

module.exports={
  createAndPay,
  list,
  count
};
