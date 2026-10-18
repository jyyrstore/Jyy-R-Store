const { withTransaction, query }=require('../../config/database');
const deposits=require('../../repositories/deposits.repository');
const payments=require('../../repositories/payments.repository');
const paymentConfig=require('../../config/payment');
const provider=()=>paymentConfig.paymentProvider();
const resolvedPaymentUrl=paymentConfig.resolvedPaymentUrl;
const {loadEnv}=require('../../config/env');
const crypto=require('crypto');
const paymentService=require('../payment/payment.service');
const {badRequest}=require('../../utils/error');

function scopedIdempotencyKey(scope,userId,key){
  if(!key) return null;
  const digest=crypto.createHash('sha256')
    .update(`${String(userId)}:${String(key)}`)
    .digest('hex')
    .slice(0,56);
  return `${scope}_${digest}`;
}
async function create(userId,{amount,idempotencyKey,returnUrl}){
  if(!Number.isInteger(amount)||amount<1000) throw badRequest('INVALID_DEPOSIT','Minimum deposit adalah Rp 1.000.');

  const fallbackExpiryMinutes=
    paymentConfig.paymentExpiryFallbackMinutes(
      loadEnv().PAYMENT_PROVIDER
    );

  const scopedKey=scopedIdempotencyKey('dep',userId,idempotencyKey);
  const existing=scopedKey
    ? (await query(
      'select * from deposits where user_id=$1 and idempotency_key in ($2,$3) order by created_at desc limit 1',
      [userId,scopedKey,idempotencyKey]
    )).rows[0]
    : null;

  if(existing) return {deposit:existing,duplicate:true};

  try{
    return await withTransaction(async(client)=>{
      const deposit=await deposits.create({
        user_id:userId,
        amount,
        provider:loadEnv().PAYMENT_PROVIDER||'generic-json',
        status:'PENDING',
        idempotency_key:scopedKey||null,
        expires_at:new Date(Date.now()+fallbackExpiryMinutes*60*1000)
      },client);
      return {deposit,createProviderPayment:async()=>{}};
    });
  }catch(error){
    if(error?.code==='23505'&&idempotencyKey){
      const concurrent=(await query('select * from deposits where user_id=$1 and idempotency_key in ($2,$3) order by created_at desc limit 1',[userId,scopedKey,idempotencyKey])).rows[0];
      if(concurrent) return {deposit:concurrent,duplicate:true};
    }
    throw error;
  }
}

async function createAndPay(userId,{amount,idempotencyKey,returnUrl}){
  if(!Number.isInteger(amount)||amount<1000){
    throw badRequest('INVALID_DEPOSIT','Minimum deposit adalah Rp 1.000.');
  }

  const fallbackExpiryMinutes=
    paymentConfig.paymentExpiryFallbackMinutes(
      loadEnv().PAYMENT_PROVIDER
    );

  const requestKey=String(idempotencyKey||crypto.randomUUID());
  const paymentKey=scopedIdempotencyKey('pdep',userId,requestKey);

  paymentService.assertProviderReady();
  const paymentProvider=provider();

  const made=await create(userId,{
    amount,
    idempotencyKey:requestKey,
    returnUrl
  });

  const deposit=made.deposit;

  if(Number(deposit.amount)!==Number(amount)){
    throw Object.assign(
      new Error('Kunci idempotensi sudah digunakan dengan nominal berbeda.'),
      {status:409,code:'IDEMPOTENCY_KEY_REUSED',expose:true}
    );
  }

  /*
   * Lock deposit terlebih dahulu. Untuk permintaan dengan kunci yang sama,
   * transaksi ini memastikan hanya satu request yang membuat placeholder.
   *
   * Jangan mengunci row payment yang telah ada dari sini: webhook mengambil
   * lock payment sebelum deposit. Mengunci dengan urutan terbalik berisiko
   * menimbulkan deadlock.
   */
  const prepared=await withTransaction(async(client)=>{
    const locked=(await client.query(
      'select * from deposits where id=$1 and user_id=$2 for update',
      [deposit.id,userId]
    )).rows[0];

    if(!locked){
      throw Object.assign(
        new Error('Deposit tidak ditemukan.'),
        {status:404,code:'DEPOSIT_NOT_FOUND',expose:true}
      );
    }

    let existingPayment=null;

    if(locked.payment_id){
      existingPayment=(await client.query(
        'select * from payments where id=$1 and user_id=$2',
        [locked.payment_id,userId]
      )).rows[0]||null;
    }

    if(!existingPayment){
      existingPayment=(await client.query(
        'select * from payments where user_id=$1 and (idempotency_key=$2 or (order_id is null and idempotency_key=$3 and amount=$4)) order by created_at desc limit 1',
        [userId,paymentKey,requestKey,amount]
      )).rows[0]||null;
    }

    if(locked.status!=='PENDING'){
      return {
        deposit:locked,
        payment:existingPayment,
        callProvider:false
      };
    }

    if(existingPayment){
      const linked=(await client.query(
        "update deposits set payment_id=$2,reference=coalesce(reference,$3),updated_at=now() where id=$1 and user_id=$4 and status='PENDING' returning *",
        [
          locked.id,
          existingPayment.id,
          existingPayment.reference||null,
          userId
        ]
      )).rows[0]||locked;

      return {
        deposit:linked,
        payment:existingPayment,
        callProvider:false
      };
    }

    const expiresAt=new Date(Date.now()+fallbackExpiryMinutes*60*1000).toISOString();

    /*
     * Commit payment placeholder DAN tautan deposit sebelum memanggil
     * provider eksternal. Unique idempotency_key dan lock deposit menjadi
     * pengaman terhadap request lokal yang bersamaan.
     */
    const placeholder=(await client.query(
      `insert into payments(
        order_id,user_id,provider,reference,amount,status,
        raw_reference,idempotency_key,expires_at
      )
      values($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning *`,
      [
        null,
        userId,
        loadEnv().PAYMENT_PROVIDER||'generic-json',
        null,
        Number(locked.amount),
        'PENDING',
        {state:'PROVIDER_PENDING',depositId:locked.id},
        paymentKey,
        expiresAt
      ]
    )).rows[0];

    const linked=(await client.query(
      "update deposits set payment_id=$2,reference=coalesce(reference,$3),expires_at=$4,updated_at=now() where id=$1 and user_id=$5 and status='PENDING' returning *",
      [locked.id,placeholder.id,null,expiresAt,userId]
    )).rows[0];

    if(!linked){
      throw Object.assign(
        new Error('Deposit berubah saat payment disiapkan.'),
        {status:409,code:'DEPOSIT_STATE_CHANGED',expose:true}
      );
    }

    return {
      deposit:linked,
      payment:placeholder,
      callProvider:true
    };
  });

  if(!prepared.callProvider){
    const existingPayment=prepared.payment||
      (prepared.deposit.payment_id
        ? await payments.findById(prepared.deposit.payment_id)
        : null);

    const paymentUrl=existingPayment
      ? resolvedPaymentUrl(existingPayment,null)
      : null;

    /*
     * Placeholder tanpa referensi berarti hasil provisioning belum diketahui.
     * Jangan membuat transaksi provider baru dengan kunci yang sama secara
     * otomatis, sebab adapter BuatQris belum menjamin idempotensi di provider.
     */
    if(
      prepared.deposit.status==='PENDING' &&
      existingPayment &&
      existingPayment.status==='PENDING' &&
      !existingPayment.reference &&
      !paymentUrl
    ){
      throw Object.assign(
        new Error(
          'Pembayaran sedang diproses atau perlu rekonsiliasi. '+
          'Jangan membuat pembayaran eksternal lain dengan kunci yang sama.'
        ),
        {
          status:503,
          code:'PAYMENT_PROVISIONING_IN_PROGRESS',
          expose:true
        }
      );
    }

    return {
      deposit:prepared.deposit,
      payment:existingPayment,
      paymentUrl,
      duplicate:true
    };
  }

  /*
   * Panggilan provider berada di luar transaksi database. Hanya request yang
   * berhasil membuat placeholder yang sampai ke bagian ini.
   */
  let providerPayment;

  try{
    providerPayment=await paymentProvider.createPayment({
      orderId:`DEPOSIT-${prepared.deposit.id}`,
      amount:Number(prepared.deposit.amount),
      customer:{userId},
      returnUrl,
      idempotencyKey:paymentKey
    });
  }catch(error){
    /*
     * Error jaringan/timeout tidak membuktikan provider tidak membuat
     * transaksi. Simpan tanda untuk rekonsiliasi dan jangan mengulang create.
     */
    await query(
      "update payments set raw_reference=coalesce(raw_reference,'{}'::jsonb)||$2::jsonb,updated_at=now() where id=$1 and user_id=$3 and status='PENDING'",
      [
        prepared.payment.id,
        JSON.stringify({
          state:'PROVIDER_RESULT_UNKNOWN',
          errorCode:String(error?.code||'PROVIDER_CALL_FAILED').slice(0,80)
        }),
        userId
      ]
    ).catch(()=>{});

    throw error;
  }

  const expiresAt=
    providerPayment.expiresAt&&
    Number.isFinite(Date.parse(String(providerPayment.expiresAt)))
      ? new Date(providerPayment.expiresAt).toISOString()
      : new Date(Date.now()+fallbackExpiryMinutes*60*1000).toISOString();

  /*
   * Persist hasil ke placeholder yang sama. Urutan lock payment lalu deposit
   * konsisten dengan jalur webhook.
   */
  const payment=await withTransaction(async(client)=>{
    const current=(await client.query(
      'select * from payments where id=$1 and user_id=$2 for update',
      [prepared.payment.id,userId]
    )).rows[0];

    if(!current){
      throw Object.assign(
        new Error('Payment placeholder tidak ditemukan.'),
        {status:404,code:'PAYMENT_PLACEHOLDER_NOT_FOUND',expose:true}
      );
    }

    const saved=(await client.query(
      `update payments
       set provider=$2,
           reference=$3,
           amount=$4,
           raw_reference=$5,
           idempotency_key=$6,
           expires_at=$7,
           updated_at=now()
       where id=$1 and user_id=$8
       returning *`,
      [
        current.id,
        loadEnv().PAYMENT_PROVIDER||'generic-json',
        providerPayment.reference,
        Number(prepared.deposit.amount),
        {
          ...(providerPayment.raw||{}),
          paymentUrl:providerPayment.paymentUrl||null
        },
        paymentKey,
        expiresAt,
        userId
      ]
    )).rows[0];

    if(!saved){
      throw new Error('Hasil provider tidak dapat disimpan ke payment placeholder.');
    }

    await client.query(
      "update deposits set reference=coalesce(reference,$3),expires_at=$4,updated_at=now() where id=$1 and payment_id=$2 and user_id=$5 and status='PENDING'",
      [
        prepared.deposit.id,
        saved.id,
        saved.reference,
        expiresAt,
        userId
      ]
    );

    return saved;
  });

  return {
    deposit:{
      ...prepared.deposit,
      reference:payment.reference,
      payment_id:payment.id,
      expires_at:payment.expires_at
    },
    payment,
    paymentUrl:resolvedPaymentUrl(payment,providerPayment.paymentUrl)
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
