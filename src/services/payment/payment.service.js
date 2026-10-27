const crypto = require('crypto');
const { log } = require('../../config/logging');
const { withTransaction, query }=require('../../config/database');
const paymentConfig=require('../../config/payment');
const provider=(name)=>paymentConfig.paymentProvider(name);
const resolvedPaymentUrl=paymentConfig.resolvedPaymentUrl;
const delivery=require('../../repositories/delivery.repository');
const carts=require('../../repositories/cart.repository');
const notifications=require('../notification/notification.service');
const { badRequest, notFound, forbidden }=require('../../utils/error');
const {loadEnv}=require('../../config/env');
const profiles=require('../../repositories/profiles.repository');
const { sendOrderPaidEmail }=require('../email/order-notification.service');

const PAYMENT_CREATABLE_ORDER_STATUSES=new Set(['PENDING']);

const PAYMENT_PUBLIC_ID_ALPHABET='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generatePublicPaymentId(){
  const value=Array.from(
    {length:8},
    ()=>PAYMENT_PUBLIC_ID_ALPHABET[
      crypto.randomInt(0,PAYMENT_PUBLIC_ID_ALPHABET.length)
    ]
  ).join('');

  return `JYYR-PAYY-${value.slice(0,4)}-${value.slice(4)}`;
}

const PAYMENT_TRANSITIONS={
  PENDING:new Set(['PENDING','PAID','FAILED','EXPIRED','CANCELLED']),
  PAID:new Set(['PAID']),
  FAILED:new Set(['FAILED']),
  EXPIRED:new Set(['EXPIRED']),
  CANCELLED:new Set(['CANCELLED']),
  REFUNDED:new Set(['REFUNDED'])
};

function assertProviderReady({testMode}={}){
  const currentEnv=loadEnv();
  const effectiveTestMode=
    testMode===undefined
      ? currentEnv.BUATQRIS_TEST_MODE
      : Boolean(testMode);

  if(
    String(currentEnv.PAYMENT_PROVIDER||'').toLowerCase()==='buatqris' &&
    currentEnv.NODE_ENV==='production' &&
    effectiveTestMode &&
    !currentEnv.BUATQRIS_ALLOW_PRODUCTION_SANDBOX
  ){
    throw Object.assign(
      new Error('BuatQris sandbox belum diizinkan untuk Production.'),
      {status:503,code:'BUATQRIS_SANDBOX_MODE',expose:true}
    );
  }

  const activeProvider=provider();
  if(
    typeof activeProvider.configured==='function' &&
    !activeProvider.configured()
  ){
    throw Object.assign(
      new Error('Payment provider belum dikonfigurasi.'),
      {status:503,code:'PAYMENT_PROVIDER_NOT_CONFIGURED',expose:true}
    );
  }

  return true;
}

async function createForOrder(userId,order,returnUrl,options={}){
  const providerName=String(
    loadEnv().PAYMENT_PROVIDER||'generic-json'
  ).toLowerCase();

  const paymentMode=String(
    options.paymentMode ||
    (
      String(order?.payment_method||'').toUpperCase()==='SANDBOX'
        ? 'SANDBOX'
        : 'LIVE'
    )
  ).toUpperCase();

  if(!['SANDBOX','LIVE'].includes(paymentMode)){
    throw badRequest(
      'INVALID_PAYMENT_MODE',
      'Mode pembayaran tidak valid.'
    );
  }

  // Mode payment harus cocok dengan metode yang tersimpan pada order.
  // Jangan izinkan order Saldo atau order dengan mode lain membuat intent.
  const persistedOrderMethod=String(
    order?.payment_method||''
  ).toUpperCase();

  const persistedOrderMode=
    persistedOrderMethod==='SANDBOX'
      ? 'SANDBOX'
      : ['GATEWAY','LIVE'].includes(persistedOrderMethod)
        ? 'LIVE'
        : null;

  if(!persistedOrderMode){
    throw badRequest(
      'ORDER_PAYMENT_METHOD_INVALID',
      'Pembayaran online hanya tersedia untuk order gateway.'
    );
  }

  if(persistedOrderMode!==paymentMode){
    throw badRequest(
      'PAYMENT_MODE_MISMATCH',
      'Mode pembayaran tidak cocok dengan metode pembayaran order.'
    );
  }

  if(paymentMode==='SANDBOX' && providerName!=='buatqris'){
    throw badRequest(
      'SANDBOX_PROVIDER_UNSUPPORTED',
      'Mode Sandbox hanya didukung oleh BuatQris.'
    );
  }

  const testMode=paymentMode==='SANDBOX';
  assertProviderReady({testMode});

  const profile=await profiles.findById(userId).catch(()=>null);

  const customerName=String(
    profile?.full_name||
    profile?.display_name||
    profile?.name||
    profile?.username||
    profile?.email?.split('@')[0]||
    'Customer'
  );

  const customerEmail=order?.recipient_email||profile?.email||null;
  const idempotencyKey=`order:${order.id}:payment`;

  /*
   * Transaction #1:
   * - lock order
   * - reuse an existing payment intent when possible
   * - otherwise create a local PENDING payment placeholder
   *
   * The placeholder is intentionally persisted BEFORE the external
   * provider call so reserved_stock always has a payment record that
   * the expiration worker can eventually release.
   */
  const prepared=await withTransaction(async(client)=>{
    const locked=(
      await client.query(
        'select * from orders where id=$1 for update',
        [order.id]
      )
    ).rows[0];

    if(!locked)throw notFound('Order not found.');
    if(locked.user_id!==userId)throw forbidden();

    if(!PAYMENT_CREATABLE_ORDER_STATUSES.has(
      String(locked.status||'').toUpperCase()
    )){
      throw badRequest(
        'ORDER_PAYMENT_STATE_INVALID',
        'Payment hanya dapat dibuat untuk order yang masih PENDING.'
      );
    }

    let existing=(
      await client.query(
        "select * from payments where order_id=$1 and status='PENDING' order by created_at desc limit 1 for update",
        [locked.id]
      )
    ).rows[0];

    if(existing && providerName==='buatqris'){
      const raw=existing.raw_reference||{};
      const storedTest=raw.isTest ?? raw.is_test;
      const inferredMode=
        storedTest==null
          ? null
          : (
              storedTest===true ||
              storedTest===1 ||
              ['true','1','yes','test'].includes(
                String(storedTest).toLowerCase()
              )
                ? 'SANDBOX'
                : 'LIVE'
            );
      const storedMode=String(raw.paymentMode||'').toUpperCase()||inferredMode;

      if(storedMode && storedMode!==paymentMode){
        throw badRequest(
          'PAYMENT_MODE_MISMATCH',
          'Order ini sudah memiliki payment intent dengan mode berbeda. Jangan membuat transaksi kedua.'
        );
      }
    }

    if(existing){
      // Baris payment sudah terkunci; gunakan waktu aktual database.
      const expiryCheck=providerName==='buatqris'
        ? (await client.query(
            `select
               (
                 coalesce(
                   expires_at,
                   created_at + interval '60 minutes'
                 ) <= clock_timestamp()
               ) as expired,
               (
                 expires_at is null
               ) as missing_expiry,
               coalesce(
                 expires_at,
                 created_at + interval '60 minutes'
               ) as effective_expires_at
             from payments
             where id=$1`,
            [existing.id]
          )).rows[0]
        : null;

      if(providerName==='buatqris' && expiryCheck?.missing_expiry){
        await client.query(
          `update payments
           set expires_at=created_at + interval '60 minutes',
               updated_at=clock_timestamp()
           where id=$1
             and expires_at is null`,
          [existing.id]
        );

        existing.expires_at=expiryCheck.effective_expires_at;
      }

      if(providerName==='buatqris' && expiryCheck?.expired){
        return {
          provisioningBlocked:true,
          provisioningReason:'PAYMENT_EXPIRED',
          payment:existing
        };
      }

      const paymentUrl=resolvedPaymentUrl(existing,null);

      /*
       * A placeholder has no provider reference/payment URL yet.
       * It is safe to retry the same provider idempotency key.
       */
      if(existing.reference||paymentUrl){
        return {
          existing:true,
          payment:existing,
          paymentUrl
        };
      }

      /*
       * BuatQris belum memiliki kontrak idempotensi provider yang
       * terverifikasi. Placeholder tanpa reference mungkin sedang
       * diproses, atau transaksi eksternal sudah dibuat tetapi
       * responsnya hilang. Jangan membuat QR kedua secara otomatis.
       */
      const retryKnownNotSent =
        existing.raw_reference?.state === 'PROVIDER_REQUEST_NOT_SENT';

      /*
       * Jangan ulangi provisioning yang hasilnya belum pasti.
       * Hanya error yang diketahui terjadi sebelum request dikirim
       * yang boleh mencoba lagi menggunakan payment placeholder sama.
       */
      if(providerName==='buatqris' && !retryKnownNotSent){
        return {
          provisioningBlocked:true,
          payment:existing
        };
      }

      /*
       * Klaim retry di dalam transaksi saat payment masih terkunci.
       * Permintaan bersamaan akan melihat state selain NOT_SENT
       * dan tidak boleh memanggil provider lagi.
       */
      if(providerName==='buatqris' && retryKnownNotSent){
        const claimed=await client.query(
          "update payments set raw_reference=coalesce(raw_reference,'{}'::jsonb)||$2::jsonb,expires_at=clock_timestamp()+interval '60 minutes',updated_at=clock_timestamp() where id=$1 and status='PENDING' and coalesce(expires_at,created_at+interval '60 minutes')>clock_timestamp() returning id",
          [
            existing.id,
            JSON.stringify({
              state:'PROVIDER_RETRY_IN_PROGRESS',
              paymentMode,
              isTest:testMode
            })
          ]
        );

        if(!claimed.rowCount){
          return {
            provisioningBlocked:true,
            provisioningReason:'PAYMENT_EXPIRED',
            payment:existing
          };
        }
      }

      // Provider lain boleh mencoba ulang menggunakan kunci idempotensi
      // yang sama apabila kontrak adapter/provider mendukungnya.
      return {
        existing:false,
        paymentId:existing.id,
        orderId:locked.id,
        amount:Number(locked.total),
        idempotencyKey,
        customer:{
          userId,
          givenNames:customerName,
          email:customerEmail
        }
      };
    }

    let placeholder=null;

    for(let attempt=0;attempt<5;attempt++){
      const publicId=generatePublicPaymentId();

      const inserted=await client.query(
        `insert into payments(
          order_id,
          user_id,
          provider,
          reference,
          amount,
          status,
          raw_reference,
          idempotency_key,
          expires_at,
          public_id
        )
        values(
          $1,
          $2,
          $3,
          null,
          $4,
          'PENDING',
          $5,
          $6,
          case
            when lower($3)='buatqris'
              then now()+interval '60 minutes'
            else now()+interval '30 minutes'
          end,
          $7
        )
        on conflict (public_id) do nothing
        returning *`,
        [
          locked.id,
          userId,
          loadEnv().PAYMENT_PROVIDER||'generic-json',
          Number(locked.total),
          {
            state:'PROVIDER_PENDING',
            paymentMode,
            isTest:testMode
          },
          idempotencyKey,
          publicId
        ]
      );

      if(inserted.rows[0]){
        placeholder=inserted.rows[0];
        break;
      }
    }

    if(!placeholder){
      throw Object.assign(
        new Error('Tidak dapat membuat ID pembayaran publik yang unik.'),
        {code:'PAYMENT_PUBLIC_ID_COLLISION'}
      );
    }

    existing=placeholder;

    return {
      existing:false,
      paymentId:existing.id,
      orderId:locked.id,
      amount:Number(locked.total),
      idempotencyKey,
      customer:{
        userId,
        givenNames:customerName,
        email:customerEmail
      }
    };
  });

  if(prepared.provisioningBlocked){
    const expired=prepared.provisioningReason==='PAYMENT_EXPIRED';

    throw Object.assign(
      new Error(
        expired
          ? 'Pembayaran lokal sudah kedaluwarsa. Proses expiry harus menyelesaikannya sebelum order baru dibuat.'
          : 'Status pembayaran belum dapat dipastikan. Jangan membuat QR baru; transaksi perlu direkonsiliasi.'
      ),
      {
        status:503,
        code:expired
          ? 'PAYMENT_EXPIRED_REQUIRES_RECONCILIATION'
          : 'PAYMENT_PROVISIONING_IN_PROGRESS',
        expose:true
      }
    );
  }

  if(prepared.existing){
    return {
      payment:prepared.payment,
      paymentUrl:prepared.paymentUrl,
      duplicate:true
    };
  }

  /*
   * Provider call is outside the DB transaction.
   * The local placeholder already protects reserved_stock.
   */
  let result;
  try{
    result=await provider().createPayment({
      orderId:prepared.orderId,
      amount:prepared.amount,
      customer:prepared.customer,
      returnUrl,
      testMode,
      idempotencyKey:prepared.idempotencyKey
    });
  }catch(error){
    /*
     * Timeout atau error jaringan tidak membuktikan provider gagal
     * membuat transaksi. Simpan status rekonsiliasi tanpa menghapus
     * metadata yang sudah ada. Retry BuatQris akan diblokir di atas.
     */
    if(providerName==='buatqris'){
      const definitelyNotSent = new Set([
        'BUATQRIS_NOT_CONFIGURED',
        'BUATQRIS_INVALID_AMOUNT',
        'BUATQRIS_FEE_CONFIG_INVALID',
        'BUATQRIS_METHOD_CONFIG_INVALID'
      ]).has(String(error?.code||''));
      await query(
        "update payments set raw_reference=coalesce(raw_reference,'{}'::jsonb)||$2::jsonb,updated_at=now() where id=$1 and status='PENDING'",
        [
          prepared.paymentId,
          JSON.stringify({
            state: definitelyNotSent
              ? 'PROVIDER_REQUEST_NOT_SENT'
              : 'PROVIDER_RESULT_UNKNOWN',
            errorCode:String(
              error?.code||'PROVIDER_CALL_FAILED'
            ).slice(0,80)
          })
        ]
      ).catch(()=>{});
    }
    throw error;
  }

  /*
   * Transaction #2:
   * attach the provider result to the existing local payment intent.
   *
   * Provider expiry is preferred, but never allow NULL to remove the
   * local safety expiry that protects reserved_stock.
   */
  const fallbackExpiryMinutes=
    paymentConfig.paymentExpiryFallbackMinutes(providerName);
  const expiresAt=
    result.expiresAt &&
    Number.isFinite(Date.parse(String(result.expiresAt)))
      ? result.expiresAt
      : new Date(Date.now()+fallbackExpiryMinutes*60*1000).toISOString();

  const saved=await withTransaction(async(client)=>{
    const current=(
      await client.query(
        'select * from payments where id=$1 for update',
        [prepared.paymentId]
      )
    ).rows[0];

    if(!current){
      throw notFound('Payment record not found.');
    }

    if(current.status!=='PENDING'){
      return current;
    }

    const updated=(
      await client.query(
        `update payments
         set provider=$2,
             reference=$3,
             amount=$4,
             raw_reference=$5,
             idempotency_key=$6,
             expires_at=$7,
             updated_at=now()
         where id=$1
         returning *`,
        [
          prepared.paymentId,
          loadEnv().PAYMENT_PROVIDER||'generic-json',
          result.reference,
          prepared.amount,
          {
            ...(result.raw||{}),
            paymentMode,
            providerReportedIsTest:
              result.raw?.isTest ?? result.raw?.is_test ?? null,
            isTest:testMode,
            paymentUrl:result.paymentUrl||null
          },
          prepared.idempotencyKey,
          expiresAt
        ]
      )
    ).rows[0];

    if(!updated){
      throw new Error('Payment provider result could not be persisted.');
    }

    return updated;
  });

  return {
    payment:saved,
    paymentUrl:resolvedPaymentUrl(saved,result.paymentUrl)
  };
}

async function getStatus(id,userId){
  const paymentsRepo=require('../../repositories/payments.repository');
  const requestedId=String(id||'').trim();
  const publicIdPattern=/^JYYR-PAYY-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

  const p=publicIdPattern.test(requestedId)
    ? await paymentsRepo.findByPublicId(requestedId.toUpperCase())
    : await paymentsRepo.findById(requestedId);

  if(!p||p.user_id!==userId)throw notFound('Payment not found.');
  return p;
}


function isTestFlag(value) {
  return value === true ||
    value === 1 ||
    ['true', '1', 'yes', 'test'].includes(
      String(value ?? '').trim().toLowerCase()
    );
}


async function simulateSandboxPayment(id,userId){
  const env=loadEnv();
  const providerName=String(env.PAYMENT_PROVIDER||'').toLowerCase();

  if(providerName!=='buatqris'){
    throw Object.assign(
      new Error('Simulasi hanya tersedia saat provider BuatQris aktif.'),
      {status:503,code:'SANDBOX_PROVIDER_UNSUPPORTED',expose:true}
    );
  }

  if(
    env.NODE_ENV==='production' &&
    !env.BUATQRIS_ALLOW_PRODUCTION_SANDBOX
  ){
    throw Object.assign(
      new Error('Sandbox Production belum diizinkan.'),
      {status:503,code:'SANDBOX_PRODUCTION_DISABLED',expose:true}
    );
  }

  const paymentsRepo=require('../../repositories/payments.repository');
  const payment=await paymentsRepo.findById(id);

  if(!payment || String(payment.user_id)!==String(userId)){
    throw notFound('Payment not found.');
  }

  const raw=payment.raw_reference||{};
  const storedTest=raw.isTest ?? raw.is_test;

  if(
    String(payment.provider||'').toLowerCase()!=='buatqris' ||
    !payment.order_id ||
    !payment.reference ||
    String(raw.paymentMode||'').toUpperCase()!=='SANDBOX' ||
    !isTestFlag(storedTest)
  ){
    throw badRequest(
      'SANDBOX_PAYMENT_REQUIRED',
      'Simulasi hanya berlaku untuk pembayaran BuatQris Sandbox.'
    );
  }

  const owner=(await query(
    `select 1 from profiles
     where id=$1
       and role='OWNER'
       and status not in ('BANNED','SUSPENDED')
       and deleted_at is null
     limit 1`,
    [userId]
  )).rows[0];

  if(!owner){
    throw Object.assign(
      new Error('Simulasi hanya dapat digunakan oleh Owner aktif.'),
      {status:403,code:'SANDBOX_OWNER_ONLY',expose:true}
    );
  }

  const order=(await query(
    'select id,user_id,status,payment_method from orders where id=$1',
    [payment.order_id]
  )).rows[0];

  if(
    !order ||
    String(order.user_id)!==String(userId) ||
    String(order.payment_method||'').toUpperCase()!=='SANDBOX'
  ){
    throw badRequest(
      'SANDBOX_ORDER_REQUIRED',
      'Pesanan ini bukan pesanan Sandbox milik Owner.'
    );
  }

  const paymentStatus=String(payment.status||'').toUpperCase();
  const orderStatus=String(order.status||'').toUpperCase();

  // Klik ulang setelah simulasi berhasil tetap aman/idempoten.
  if(
    paymentStatus==='PAID' &&
    orderStatus==='PAID' &&
    String(raw._sandboxResult||'').toUpperCase()==='PAID'
  ){
    return {
      duplicate:true,
      sandbox:true,
      paymentStatus:'PAID',
      orderStatus:'PAID',
      orderId:order.id,
      sandboxAccessGranted:true,
      stockAndRevenueSideEffectsSuppressed:true
    };
  }

  if(paymentStatus!=='PENDING' || orderStatus!=='PENDING'){
    throw Object.assign(
      new Error(
        'Simulasi hanya tersedia saat pembayaran dan pesanan masih PENDING.'
      ),
      {status:409,code:'SANDBOX_PAYMENT_NOT_PENDING',expose:true}
    );
  }

  if(!env.BUATQRIS_SIGNING_SECRET){
    throw Object.assign(
      new Error('BUATQRIS_SIGNING_SECRET belum dikonfigurasi di server.'),
      {
        status:503,
        code:'BUATQRIS_SIGNING_SECRET_NOT_CONFIGURED',
        expose:true
      }
    );
  }

  const amount=Number(raw.totalAmount ?? raw.total_amount);
  if(!Number.isSafeInteger(amount) || amount<=0){
    throw badRequest(
      'SANDBOX_AMOUNT_UNAVAILABLE',
      'Nominal total BuatQris tidak tersedia; simulasi dibatalkan.'
    );
  }

  // Gunakan alur webhook asli: verifikasi HMAC, transisi status,
  // pencatatan event, dan pemberian akses Sandbox.
  const payload={
    event:'payment.success',
    status:'success',
    transaction_id:String(payment.reference),
    total_amount:amount,
    is_test:true,
    paid_at:new Date().toISOString()
  };

  const rawBody=Buffer.from(JSON.stringify(payload),'utf8');
  const signature='sha256='+crypto
    .createHmac('sha256',env.BUATQRIS_SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');

  const result=await processWebhook(
    rawBody,
    signature,
    payload,
    'buatqris'
  );

  // Request lain mungkin berhasil lebih dahulu. Verifikasi hasil akhir DB.
  if(result?.duplicate){
    const freshPayment=await paymentsRepo.findById(id);
    const freshOrder=(await query(
      'select id,status from orders where id=$1 and user_id=$2',
      [payment.order_id,userId]
    )).rows[0];

    if(
      String(freshPayment?.status||'').toUpperCase()==='PAID' &&
      String(freshPayment?.raw_reference?._sandboxResult||'').toUpperCase()==='PAID' &&
      String(freshOrder?.status||'').toUpperCase()==='PAID'
    ){
      return {
        duplicate:true,
        sandbox:true,
        paymentStatus:'PAID',
        orderStatus:'PAID',
        orderId:freshOrder.id,
        sandboxAccessGranted:true,
        stockAndRevenueSideEffectsSuppressed:true
      };
    }
  }

  if(
    result?.ignored ||
    result?.paymentStatus!=='PAID' ||
    result?.orderStatus!=='PAID'
  ){
    throw Object.assign(
      new Error(
        'Server belum dapat mengonfirmasi pembayaran Sandbox sebagai PAID.'
      ),
      {status:409,code:'SANDBOX_SIMULATION_NOT_CONFIRMED',expose:true}
    );
  }

  return result;
}

async function reconcileBuatQrisStatus(id, userId) {
  const paymentsRepository = require('../../repositories/payments.repository');
  const initial = await paymentsRepository.findById(id);

  if (!initial || String(initial.user_id) !== String(userId)) {
    throw notFound('Payment not found.');
  }

  if (
    String(initial.status || '').toUpperCase() !== 'PENDING' ||
    String(initial.provider || '').toLowerCase() !== 'buatqris' ||
    !initial.reference
  ) {
    return initial;
  }

  const env = loadEnv();
  if (!env.BUATQRIS_SIGNING_SECRET) {
    log('warn', 'buatqris_status_reconciliation_unavailable', {
      paymentId: String(initial.id),
      reason: 'SIGNING_SECRET_NOT_CONFIGURED'
    });
    return initial;
  }

  const selectedProvider = provider('buatqris');
  if (typeof selectedProvider.checkStatus !== 'function') {
    return initial;
  }

  /*
   * Klaim pemeriksaan secara atomik. Polling frontend umumnya berjalan
   * tiap beberapa detik; maksimal satu pemeriksaan per pembayaran
   * setiap 10 detik per baris database.
   */
  const claimedResult = await query(
    `update payments
       set raw_reference =
         coalesce(raw_reference, '{}'::jsonb) ||
         jsonb_build_object(
           '_buatqrisStatusCheckedAt',
           clock_timestamp()::text
         )
     where id = $1
       and user_id = $2
       and status = 'PENDING'
       and lower(provider) = 'buatqris'
       and case
         when pg_input_is_valid(
           raw_reference->>'_buatqrisStatusRetryAfter',
           'timestamp with time zone'
         )
         then (raw_reference->>'_buatqrisStatusRetryAfter')::timestamptz
                <= clock_timestamp()
         else true
       end
       and case
         when pg_input_is_valid(
           raw_reference->>'_buatqrisStatusCheckedAt',
           'timestamp with time zone'
         )
         then (raw_reference->>'_buatqrisStatusCheckedAt')::timestamptz
                <= clock_timestamp() - interval '10 seconds'
         else true
       end
     returning *`,
    [id, userId]
  );

  if (!claimedResult.rows[0]) {
    return (await paymentsRepository.findById(id)) || initial;
  }

  const payment = claimedResult.rows[0];
  const savedRaw = payment.raw_reference || {};

  const latestPayment = async () =>
    (await paymentsRepository.findById(id).catch(() => null)) || payment;

  const rejectStatus = (reason) => {
    log('warn', 'buatqris_status_reconciliation_rejected', {
      paymentId: String(payment.id),
      reference: String(payment.reference),
      reason
    });
  };

  try {
    const remote = await selectedProvider.checkStatus(payment.reference);

    // Provider merespons; hapus jeda rate-limit sebelumnya.
    try {
      await query(
        `update payments
            set raw_reference =
              coalesce(raw_reference, '{}'::jsonb)
                - '_buatqrisStatusRateLimitCount'
                - '_buatqrisStatusRetryAfter'
          where id = $1
            and user_id = $2
            and status = 'PENDING'
            and lower(provider) = 'buatqris'`,
        [id, userId]
      );
    } catch (cleanupError) {
      log('warn', 'buatqris_status_backoff_cleanup_failed', {
        paymentId: String(id),
        code: String(
          cleanupError?.code || 'BACKOFF_CLEANUP_FAILED'
        ).slice(0, 80)
      });
    }

    // ID yang diperiksa harus persis sama dengan referensi tersimpan.
    if (String(remote.transaction_id || '') !== String(payment.reference)) {
      rejectStatus('TRANSACTION_ID_MISMATCH');
      return latestPayment();
    }

    const expectedTotal = Number(
      savedRaw.totalAmount ?? savedRaw.total_amount
    );
    const reportedTotal = Number(remote.total_amount);

    // Total provider harus cocok dengan total tagihan termasuk kode unik.
    if (
      !Number.isSafeInteger(expectedTotal) ||
      expectedTotal <= 0 ||
      !Number.isSafeInteger(reportedTotal) ||
      reportedTotal !== expectedTotal
    ) {
      rejectStatus('TOTAL_AMOUNT_MISMATCH');
      return latestPayment();
    }

    const expectedAmount = Number(savedRaw.amount ?? payment.amount);
    if (
      remote.amount != null &&
      (
        !Number.isSafeInteger(Number(remote.amount)) ||
        Number(remote.amount) !== expectedAmount
      )
    ) {
      rejectStatus('BASE_AMOUNT_MISMATCH');
      return latestPayment();
    }

    const storedIsTest = isTestFlag(
      savedRaw.isTest ?? savedRaw.is_test
    );

    if (
      remote.is_test != null &&
      isTestFlag(remote.is_test) !== storedIsTest
    ) {
      rejectStatus('TEST_MODE_MISMATCH');
      return latestPayment();
    }

    if (
      remote.qris_method != null &&
      paymentConfig.qrisMethodConflictsWithTestMode(
        remote.qris_method,
        storedIsTest
      )
    ) {
      rejectStatus('QRIS_METHOD_MODE_MISMATCH');
      return latestPayment();
    }

    const remoteStatus = String(remote.status || '').toLowerCase();

    // Status pending hanya memperbarui waktu pemeriksaan; tidak melunasi order.
    if (remoteStatus === 'pending') {
      return latestPayment();
    }

    const events = {
      success: 'payment.success',
      expired: 'payment.expired',
      failed: 'payment.failed'
    };
    const event = events[remoteStatus];

    if (!event) {
      rejectStatus('UNKNOWN_PROVIDER_STATUS');
      return latestPayment();
    }

    /*
     * Status dibaca dari API provider terautentikasi melalui HTTPS.
     * Buat payload internal yang ditandatangani dengan signing secret
     * server, lalu gunakan processor event yang sama dengan webhook.
     * Processor tetap memvalidasi nominal, mode, Owner, idempotensi,
     * dan transisi status sebelum memberikan entitlement.
     */
    const payload = {
      event,
      transaction_id: String(remote.transaction_id),
      status: remoteStatus,
      amount: Number(remote.amount ?? expectedAmount),
      total_amount: reportedTotal,
      is_test: storedIsTest,
      ...(remote.qris_method != null
        ? {qris_method: String(remote.qris_method)}
        : {}),
      ...(remote.paid_at ? {paid_at: remote.paid_at} : {}),
      _reconciled_via: 'api_check_status'
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = 'sha256=' + crypto
      .createHmac('sha256', env.BUATQRIS_SIGNING_SECRET)
      .update(rawBody)
      .digest('hex');

    await processWebhook(
      rawBody,
      signature,
      payload,
      'buatqris'
    );

    return latestPayment();
  } catch (error) {
    if (error?.code === 'BUATQRIS_STATUS_RATE_LIMITED') {
      const previousCount = Number(
        savedRaw._buatqrisStatusRateLimitCount
      );

      const nextCount =
        Number.isSafeInteger(previousCount) && previousCount >= 0
          ? Math.min(previousCount + 1, 5)
          : 1;

      const retrySeconds = Math.min(
        300,
        30 * (2 ** (nextCount - 1))
      );

      try {
        await query(
          `update payments
              set raw_reference =
                coalesce(raw_reference, '{}'::jsonb) ||
                jsonb_build_object(
                  '_buatqrisStatusRateLimitCount', $3::integer,
                  '_buatqrisStatusRetryAfter',
                    (
                      clock_timestamp() +
                      make_interval(secs => $4::double precision)
                    )::text
                )
            where id = $1
              and user_id = $2
              and status = 'PENDING'
              and lower(provider) = 'buatqris'`,
          [id, userId, nextCount, retrySeconds]
        );
      } catch (backoffError) {
        log('warn', 'buatqris_status_backoff_persist_failed', {
          paymentId: String(id),
          code: String(
            backoffError?.code || 'BACKOFF_PERSIST_FAILED'
          ).slice(0, 80)
        });
      }
    }

    log('warn', 'buatqris_status_reconciliation_failed', {
      paymentId: String(payment.id),
      reference: String(payment.reference),
      code: String(error?.code || 'STATUS_CHECK_FAILED').slice(0, 80),
      message: String(error?.message || error).slice(0, 180)
    });

    // Jangan mengarang status akhir jika provider/API/database bermasalah.
    return latestPayment();
  }
}

async function reconcilePendingBuatQris({limit = 50} = {}) {
  const cap = Math.min(100, Math.max(1, Number(limit) || 50));
  const candidates = (await query(
    `with pending_payments as (
       select
         id,
         user_id,
         status,
         coalesce(
           case
             when raw_reference->>'expired_at' ~
               '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,9})?)?$'
              and pg_input_is_valid(
                raw_reference->>'expired_at',
                'timestamp without time zone'
              )
             then (
               (raw_reference->>'expired_at')::timestamp without time zone
                 at time zone 'Asia/Jakarta'
             )
             when raw_reference->>'expired_at' ~
               '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,9})?)?[ ]*(Z|[+-][0-9]{2}:?[0-9]{2})$'
              and pg_input_is_valid(
                raw_reference->>'expired_at',
                'timestamp with time zone'
              )
             then (raw_reference->>'expired_at')::timestamptz
             else null
           end,
           expires_at,
           created_at + interval '60 minutes'
         ) as reconciliation_expires_at,
         case
           when pg_input_is_valid(
             raw_reference->>'_buatqrisStatusCheckedAt',
             'timestamp with time zone'
           )
           then (raw_reference->>'_buatqrisStatusCheckedAt')::timestamptz
           else null
         end as last_status_check_at
       from payments
       where status = 'PENDING'
         and lower(provider) = 'buatqris'
         and reference is not null
     )
     select id, user_id, status
       from pending_payments
      where last_status_check_at is null
         or last_status_check_at <=
              statement_timestamp() - interval '4 minutes'
      order by
        last_status_check_at asc nulls first,
        reconciliation_expires_at asc
      limit $1`,
    [cap]
  )).rows;

  let transitioned = 0;
  let stillPending = 0;
  let errors = 0;

  for (const candidate of candidates) {
    try {
      const before = await require('../../repositories/payments.repository')
        .findById(candidate.id);

      if (!before || String(before.status).toUpperCase() !== 'PENDING') {
        continue;
      }

      const after = await reconcileBuatQrisStatus(
        candidate.id,
        candidate.user_id
      );

      if (
        after &&
        String(after.status).toUpperCase() !==
          String(before.status).toUpperCase()
      ) {
        transitioned++;
      } else {
        stillPending++;
      }
    } catch (error) {
      errors++;
      log('warn', 'buatqris_cron_reconciliation_failed', {
        paymentId: String(candidate.id),
        code: String(error?.code || 'RECONCILIATION_FAILED').slice(0, 80)
      });
    }
  }

  return {
    scanned: candidates.length,
    transitioned,
    stillPending,
    errors
  };
}


async function recordWebhookEvent(client,{
  paymentId,providerName,eventId,payload,pending=false
}){
  const existing=(await client.query(
    'select id,processed_at from payment_events where provider_event_id=$1 for update',
    [eventId]
  )).rows[0];

  if(existing){
    if(existing.processed_at) return false;

    // Keep early deliveries pending until a matching payment exists.
    if(pending) return true;

    await client.query(
      'update payment_events set payment_id=$2,provider=$3,payload=$4,processed_at=now() where id=$1',
      [existing.id,paymentId||null,providerName,payload]
    );
    return true;
  }

  const inserted=(await client.query(
    'insert into payment_events(payment_id,provider,provider_event_id,payload,processed_at) values($1,$2,$3,$4,case when $5::boolean then null else now() end) on conflict (provider_event_id) do nothing returning id',
    [paymentId||null,providerName,eventId,payload,Boolean(pending)]
  )).rows[0];

  if(inserted) return true;

  // A concurrent delivery may have inserted the event after our first SELECT.
  const raced=(await client.query(
    'select id,processed_at from payment_events where provider_event_id=$1 for update',
    [eventId]
  )).rows[0];

  if(!raced || raced.processed_at) return false;
  if(pending) return true;

  await client.query(
    'update payment_events set payment_id=$2,provider=$3,payload=$4,processed_at=now() where id=$1',
    [raced.id,paymentId||null,providerName,payload]
  );
  return true;
}
async function processWebhook(rawBody,signature,payload,requestedProvider){
  const providerName=String(
    requestedProvider||loadEnv().PAYMENT_PROVIDER||'generic-json'
  ).toLowerCase();
  const selectedProvider=provider(providerName);

  const ok=selectedProvider.verifyWebhook(rawBody,signature);
  if(!ok) throw Object.assign(new Error('Invalid webhook signature'),{status:401,code:'WEBHOOK_SIGNATURE_INVALID',expose:true});

  const parsed=selectedProvider.parseWebhook(payload,rawBody);
  if(!parsed.eventId||!parsed.reference)throw badRequest('INVALID_WEBHOOK','Webhook payload is incomplete.');

  // Store does not use BuatQris withdrawals, but acknowledge and deduplicate them.
  if(providerName==='buatqris' && parsed.isWithdrawal){
    return withTransaction(async(client)=>{
      const recorded=await recordWebhookEvent(client,{
        paymentId:null,providerName,eventId:parsed.eventId,payload
      });
      return recorded
        ? {duplicate:false,ignored:true,reason:'BUATQRIS_WITHDRAWAL_NOT_USED_BY_STORE'}
        : {duplicate:true};
    });
  }

  const result=await withTransaction(async(client)=>{
    let candidate=null;
    let payment=null;
    let lockedOrder=null;

    /*
     * Baca kandidat tanpa mengunci payment. Untuk payment order, lock
     * harus diperoleh dengan urutan ORDER -> PAYMENT, sama seperti
     * createForOrder dan expiration job.
     */
    if(parsed.reference){
      candidate=(
        await client.query(
          'select * from payments where reference=$1 and lower(provider)=lower($2)',
          [parsed.reference,providerName]
        )
      ).rows[0]||null;
    }

    /*
     * Recovery jika callback datang sebelum reference sempat tersimpan.
     */
    if(!candidate&&parsed.orderId){
      candidate=(
        await client.query(
          "select * from payments where order_id=$1 and lower(provider)=lower($2) and status in ('PENDING','PAID','FAILED','EXPIRED','CANCELLED') order by created_at desc limit 1",
          [parsed.orderId,providerName]
        )
      ).rows[0]||null;
    }

    if(candidate?.order_id){
      lockedOrder=(
        await client.query(
          'select * from orders where id=$1 for update',
          [candidate.order_id]
        )
      ).rows[0]||null;

      payment=(
        await client.query(
          'select * from payments where id=$1 for update',
          [candidate.id]
        )
      ).rows[0]||null;
    }else if(candidate){
      // Deposit tidak mempunyai order. Jalur ini mempertahankan
      // urutan PAYMENT -> DEPOSIT yang digunakan webhook deposit.
      payment=(
        await client.query(
          'select * from payments where id=$1 for update',
          [candidate.id]
        )
      ).rows[0]||null;
    }

    // Kandidat dapat berubah atau hilang selagi lock diperoleh.
    if(
      payment &&
      String(payment.provider||'').toLowerCase()!==providerName
    ){
      payment=null;
    }

    if(!payment){
      if(providerName==='buatqris'){
        const recorded=await recordWebhookEvent(client,{
          paymentId:null,
          providerName,
          eventId:parsed.eventId,
          payload,
          pending:true
        });
        if(!recorded)return {duplicate:true};
        return {
          retry:true,
          reason:'PAYMENT_REFERENCE_NOT_READY',
          reference:parsed.reference
        };
      }

      const recorded=await recordWebhookEvent(client,{
        paymentId:null,providerName,eventId:parsed.eventId,payload
      });
      if(!recorded)return {duplicate:true};
      return {
        duplicate:false,
        ignored:true,
        reason:'PAYMENT_REFERENCE_NOT_FOUND',
        reference:parsed.reference
      };
    }

    const recorded=await recordWebhookEvent(client,{paymentId:payment.id,providerName,eventId:parsed.eventId,payload});
    if(!recorded)return {duplicate:true};
    const expectedAmount = providerName === 'buatqris'
      ? Number(payment.raw_reference?.totalAmount ?? payment.raw_reference?.total_amount)
      : Number(payment.amount);

    // BuatQris total_amount is the buyer's actual bill, including unique code.
    if(!Number.isSafeInteger(expectedAmount) ||
       !Number.isSafeInteger(Number(parsed.amount)) ||
       Number(parsed.amount)!==expectedAmount){
      throw badRequest('PAYMENT_AMOUNT_MISMATCH','Payment amount does not match transaction total.');
    }

    if(providerName==='buatqris'){
      const storedIsTest=Boolean(
        payment.raw_reference?.isTest ?? payment.raw_reference?.is_test
      );
      if(Boolean(parsed.isTest)!==storedIsTest){
        throw badRequest(
          'PAYMENT_TEST_MODE_MISMATCH',
          'Webhook sandbox/live mode does not match the saved transaction.'
        );
      }
    }
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

    if(providerName==='buatqris' && parsed.isTest){
      const sandboxOrder=Boolean(
        payment.order_id &&
        lockedOrder &&
        String(lockedOrder.user_id)===String(payment.user_id) &&
        String(lockedOrder.payment_method||'').toUpperCase()==='SANDBOX'
      );

      if(!sandboxOrder){
        await client.query(
          'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
          [
            'PAYMENT_WEBHOOK_SANDBOX_IGNORED',
            'payment',
            payment.id,
            {reference:parsed.reference,eventId:parsed.eventId,status:next,is_test:true}
          ]
        );
        return {
          duplicate:false,
          ignored:true,
          sandbox:true,
          paymentId:payment.id,
          paymentStatus:payment.status
        };
      }

      const sandboxOwner=(await client.query(
        `select 1 from profiles
         where id=$1
           and role='OWNER'
           and status not in ('BANNED','SUSPENDED')
           and deleted_at is null
         limit 1`,
        [payment.user_id]
      )).rows[0];

      if(!sandboxOwner){
        await client.query(
          'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
          [
            'PAYMENT_WEBHOOK_SANDBOX_IGNORED',
            'payment',
            payment.id,
            {
              reference:parsed.reference,
              eventId:parsed.eventId,
              status:next,
              reason:'OWNER_AUTHORIZATION_REQUIRED',
              is_test:true
            }
          ]
        );
        return {
          duplicate:false,
          ignored:true,
          sandbox:true,
          reason:'OWNER_AUTHORIZATION_REQUIRED',
          paymentId:payment.id,
          paymentStatus:payment.status
        };
      }

      const sandboxCurrent=String(payment.status||'PENDING').toUpperCase();
      const sandboxAllowed=PAYMENT_TRANSITIONS[sandboxCurrent];
      if(!sandboxAllowed || !sandboxAllowed.has(next)){
        await client.query(
          'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
          [
            'PAYMENT_WEBHOOK_SANDBOX_IGNORED',
            'payment',
            payment.id,
            {reference:parsed.reference,eventId:parsed.eventId,status:next,reason:'INVALID_SANDBOX_STATE_TRANSITION',is_test:true}
          ]
        );
        return {
          duplicate:false,
          ignored:true,
          sandbox:true,
          paymentId:payment.id,
          paymentStatus:sandboxCurrent
        };
      }

      // Sandbox memberi akses uji tanpa mengubah stok atau omzet asli.
      const sandboxStoredStatus=next;

      await client.query(
        `update payments
         set reference=coalesce(reference,$2),
             status=$3::payment_status,
             raw_reference=coalesce(raw_reference,'{}'::jsonb)||
               jsonb_build_object(
                 '_lastWebhook',$4::jsonb,
                 '_sandboxResult',$5::text,
                 'paymentMode','SANDBOX',
                 'isTest',true
               ),
             paid_at=case when $3::payment_status='PAID' then coalesce(paid_at,now()) else paid_at end,
             updated_at=now()
         where id=$1`,
        [payment.id,parsed.reference,sandboxStoredStatus,payload,next]
      );

      let sandboxOrderStatus=lockedOrder.status;
      let sandboxAccessGranted=false;

      if(next!=='PENDING' && lockedOrder.status==='PENDING'){
        const targetOrderStatus=next;
        const updatedOrder=(
          await client.query(
            `update orders
             set status=$2::order_status,
                 paid_at=case when $2::order_status='PAID'
                   then coalesce(paid_at,now()) else paid_at end,
                 updated_at=now()
             where id=$1
               and payment_method='SANDBOX'
               and status='PENDING'
             returning status`,
            [lockedOrder.id,targetOrderStatus]
          )
        ).rows[0];

        if(updatedOrder) sandboxOrderStatus=updatedOrder.status;
      }

      // Hanya order Sandbox yang baru berhasil berubah ke PAID mendapat akses uji.
      // Jangan mengurangi stock atau purchase_count dan jangan mencatat PURCHASE.
      if(
        next==='PAID' &&
        lockedOrder.status==='PENDING' &&
        sandboxOrderStatus==='PAID'
      ){
        const sandboxItems=(await client.query(
          'select product_id from order_items where order_id=$1',
          [lockedOrder.id]
        )).rows;

        for(const item of sandboxItems){
          await delivery.createEntitlement({
            userId:payment.user_id,
            productId:item.product_id,
            orderId:lockedOrder.id
          },client);
        }

        sandboxAccessGranted=true;

        await notifications.notify(payment.user_id,{
          type:'PAYMENT',
          title:'Pembayaran Sandbox berhasil',
          body:`Pembayaran simulasi ${lockedOrder.order_number} berhasil. Order ditandai PAID untuk pengujian Owner; stok dan omzet asli tidak berubah.`,
          link:`/orders/${lockedOrder.id}`
        },client);

        await notifications.notify(payment.user_id,{
          type:'ORDER',
          title:'Pesanan Sandbox siap diuji',
          body:`Akses produk order ${lockedOrder.order_number} tersedia untuk pengujian.`,
          link:`/orders/${lockedOrder.id}`
        },client);
      }

      await client.query(
        'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
        [
          'PAYMENT_WEBHOOK_SANDBOX_PROCESSED',
          'payment',
          payment.id,
          {
            reference:parsed.reference,
            eventId:parsed.eventId,
            simulatedResult:next,
            storedPaymentStatus:sandboxStoredStatus,
            orderStatus:sandboxOrderStatus,
            is_test:true,
            stockAndRevenueSideEffectsSuppressed:true,
            sandboxAccessGranted
          }
        ]
      );

      return {
        duplicate:false,
        sandbox:true,
        stockAndRevenueSideEffectsSuppressed:true,
        sandboxAccessGranted,
        paymentId:payment.id,
        paymentStatus:sandboxStoredStatus,
        sandboxResult:next,
        orderId:lockedOrder.id,
        orderStatus:sandboxOrderStatus
      };
    }

    const current=String(payment.status||'PENDING').toUpperCase();
    const allowed=PAYMENT_TRANSITIONS[current];

    const lateOrderPayment=(
      next==='PAID' &&
      Boolean(payment.order_id) &&
      ['FAILED','EXPIRED','CANCELLED'].includes(current)
    );

    if((!allowed || !allowed.has(next)) && !lateOrderPayment){
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
      "update payments set reference=coalesce(reference,$2),status=$3::payment_status,raw_reference=coalesce(raw_reference,'{}'::jsonb)||jsonb_build_object('_lastWebhook',$4::jsonb),paid_at=case when $3::payment_status='PAID' then coalesce(paid_at,now()) else paid_at end,updated_at=now() where id=$1",
      [payment.id,parsed.reference,next,payload]
    );

    if(!payment.order_id){
      const dep=(await client.query('select * from deposits where payment_id=$1 for update',[payment.id])).rows[0];
      if(dep && next==='PAID' && dep.status==='PENDING'){
        const wallet=(await client.query('select * from wallets where user_id=$1 for update',[payment.user_id])).rows[0] || (await client.query('insert into wallets(user_id) values($1) returning *',[payment.user_id])).rows[0];
        const before=Number(wallet.balance), after=before+Number(dep.amount);
        await client.query("update wallets set balance=$2,updated_at=now() where user_id=$1",[payment.user_id,after]);
        await client.query("insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference,status) values($1,$2,'DEPOSIT',$3,$4,$5,$6,'COMPLETED')",[wallet.id,payment.user_id,dep.amount,before,after,dep.reference||parsed.reference]);
        await client.query("update deposits set status='SUCCESS',webhook_status='PAID',paid_at=now(),updated_at=now() where id=$1",[dep.id]);
        await notifications.notify(payment.user_id,{type:'DEPOSIT',title:'Deposit berhasil',body:`Deposit ${dep.reference||parsed.reference} sebesar Rp${Number(dep.amount).toLocaleString('id-ID')} berhasil ditambahkan.`,link:'/deposit'},client);
      } else if(dep && ['FAILED','EXPIRED','CANCELLED','REFUNDED'].includes(next) && dep.status==='PENDING'){
        const depStatus=next==='REFUNDED'?'REFUNDED':next;
        await client.query('update deposits set status=$2,webhook_status=$3,updated_at=now() where id=$1',[dep.id,depStatus,next]);

        // JYYR DEPOSIT FAILURE NOTIFICATION
        const depositReference=dep.reference||parsed.reference||dep.id;
        const depositAmount=Number(dep.amount).toLocaleString('id-ID');
        const depositNotice={
          FAILED:{
            title:'Deposit gagal',
            body:`Deposit ${depositReference} sebesar Rp${depositAmount} gagal diproses.`
          },
          EXPIRED:{
            title:'Deposit kedaluwarsa',
            body:`Deposit ${depositReference} sebesar Rp${depositAmount} kedaluwarsa sebelum pembayaran selesai.`
          },
          CANCELLED:{
            title:'Deposit dibatalkan',
            body:`Deposit ${depositReference} sebesar Rp${depositAmount} dibatalkan.`
          },
          REFUNDED:{
            title:'Deposit dikembalikan',
            body:`Dana deposit ${depositReference} sebesar Rp${depositAmount} telah dikembalikan.`
          }
        }[next];

        await notifications.notify(payment.user_id,{
          type:'DEPOSIT',
          title:depositNotice.title,
          body:depositNotice.body,
          link:'/deposit'
        },client);
      }
      await client.query('insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)', ['PAYMENT_WEBHOOK','payment',payment.id,{reference:parsed.reference,status:next,depositId:dep?.id||null}]);
      return {duplicate:false,paymentStatus:next,depositId:dep?.id||null};
    }
    const order=lockedOrder;
    if(!order)throw notFound('Order not found.');

    /*
     * Pembayaran terlambat atau state order tidak normal harus
     * direkonsiliasi. Jangan memberikan produk secara otomatis.
     */
    if(
      next==='PAID' &&
      !(
        current==='PENDING' &&
        order.status==='PENDING'
      ) &&
      !(
        current==='PAID' &&
        order.status==='PAID'
      )
    ){
      await client.query(
        'insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)',
        [
          'PAYMENT_PAID_ORDER_REQUIRES_RECONCILIATION',
          'order',
          order.id,
          {
            paymentId:payment.id,
            paymentReference:parsed.reference,
            previousPaymentStatus:current,
            orderStatus:order.status
          }
        ]
      );

      return {
        duplicate:false,
        reconciliationRequired:true,
        paymentId:payment.id,
        paymentStatus:next,
        orderId:order.id,
        orderStatus:order.status
      };
    }

    if(next==='PAID' && order.status==='PENDING'){
      const items=(await client.query('select * from order_items where order_id=$1',[order.id])).rows;
      for(const i of items){
        if(i.variant_id){
          const v=(await client.query('select stock,reserved_stock from product_variants where id=$1 for update',[i.variant_id])).rows[0];
          if(!v||Number(v.reserved_stock)<Number(i.quantity)||Number(v.stock)<Number(i.quantity)) throw badRequest('FULFILLMENT_STOCK_CONFLICT','Variant stock is no longer available for this paid order.');
          await client.query('update product_variants set stock=stock-$2,reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.variant_id,i.quantity]);
          await client.query('update products set purchase_count=purchase_count+$2,updated_at=now() where id=$1',[i.product_id,i.quantity]);
        }else{
          const p=(await client.query('select stock,reserved_stock from products where id=$1 for update',[i.product_id])).rows[0];
          if(!p||Number(p.reserved_stock)<Number(i.quantity)||Number(p.stock)<Number(i.quantity))throw badRequest('FULFILLMENT_STOCK_CONFLICT','Product stock is no longer available for this paid order.');
          await client.query('update products set stock=stock-$2,reserved_stock=greatest(reserved_stock-$2,0),purchase_count=purchase_count+$2,updated_at=now() where id=$1',[i.product_id,i.quantity]);
        }
        await client.query("insert into product_events(product_id,user_id,event_type) values($1,$2,'PURCHASE')",[i.product_id,payment.user_id]);
        await delivery.createEntitlement({userId:payment.user_id,productId:i.product_id,orderId:order.id},client);
      }
      await client.query("update orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=$1",[order.id]);
      await carts.clear(payment.user_id,client);
      await notifications.notify(payment.user_id,{type:'PAYMENT',title:'Pembayaran berhasil',body:`Pembayaran untuk ${order.order_number} berhasil diverifikasi.`,link:`/orders/${order.id}`},client);
      await notifications.notify(payment.user_id,{type:'ORDER',title:'Produk siap digunakan',body:`Order ${order.order_number} sudah dibayar dan akses content tersedia.`,link:`/orders/${order.id}`},client);
    } else if(['FAILED','EXPIRED','CANCELLED'].includes(next) && order.status==='PENDING'){
      await client.query("update orders set status=$2,updated_at=now() where id=$1",[order.id,next]);
      if(order.payment_method!=='SANDBOX'){
        const items=(await client.query('select product_id,variant_id,quantity from order_items where order_id=$1',[order.id])).rows;
        for(const i of items){if(i.variant_id) await client.query('update product_variants set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.variant_id,i.quantity]);else await client.query('update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.product_id,i.quantity]);}
      }

      // JYYR ORDER PAYMENT FAILURE NOTIFICATION
      const paymentFailure={
        FAILED:{
          title:'Pembayaran gagal',
          detail:'gagal diproses'
        },
        EXPIRED:{
          title:'Pembayaran kedaluwarsa',
          detail:'kedaluwarsa sebelum pembayaran selesai'
        },
        CANCELLED:{
          title:'Pembayaran dibatalkan',
          detail:'dibatalkan sebelum pembayaran selesai'
        }
      }[next];

      await notifications.notify(payment.user_id,{
        type:'PAYMENT',
        title:paymentFailure.title,
        body:`Pembayaran order ${order.order_number} ${paymentFailure.detail}.`,
        link:`/orders/${order.id}`
      },client);
    }
    await client.query('insert into activity_logs(action,entity_type,entity_id,metadata) values($1,$2,$3,$4)', ['PAYMENT_WEBHOOK','payment',payment.id,{reference:parsed.reference,status:next,orderId:order.id}]);
    return {
      duplicate:false,
      paymentStatus:next,
      orderId:order.id,
      orderPaid:next==='PAID'&&current==='PENDING'&&order.status==='PENDING',
      recipientEmail:order.recipient_email||null,
      orderNumber:order.order_number,
      orderTotal:Number(order.total||0),
      recipientDialCode:order.recipient_dial_code||null,
      recipientPhone:order.recipient_phone||null
    };
  });

  if(result?.retry){
    throw Object.assign(
      new Error('Referensi pembayaran BuatQris belum tersedia; webhook dapat dicoba ulang.'),
      {status:503,code:'PAYMENT_REFERENCE_NOT_READY',expose:true}
    );
  }

  if(result?.orderPaid&&result.recipientEmail){
    await sendOrderPaidEmail({
      order_number:result.orderNumber,
      total:result.orderTotal,
      recipient_email:result.recipientEmail,
      recipient_dial_code:result.recipientDialCode,
      recipient_phone:result.recipientPhone
    }).catch(error=>{
      console.warn(
        '[ORDER EMAIL] gateway order-paid notification failed:',
        error?.message||String(error)
      );
    });
  }

  return result;
}
module.exports={assertProviderReady,createForOrder,getStatus,simulateSandboxPayment,reconcileBuatQrisStatus,reconcilePendingBuatQris,processWebhook};
