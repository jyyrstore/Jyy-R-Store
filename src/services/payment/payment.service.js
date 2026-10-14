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
                   created_at + interval '30 minutes'
                 ) <= clock_timestamp()
               ) as expired,
               (
                 expires_at is null
               ) as missing_expiry,
               coalesce(
                 expires_at,
                 created_at + interval '30 minutes'
               ) as effective_expires_at
             from payments
             where id=$1`,
            [existing.id]
          )).rows[0]
        : null;

      if(providerName==='buatqris' && expiryCheck?.missing_expiry){
        await client.query(
          `update payments
           set expires_at=created_at + interval '30 minutes',
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
          "update payments set raw_reference=coalesce(raw_reference,'{}'::jsonb)||$2::jsonb,expires_at=clock_timestamp()+interval '30 minutes',updated_at=clock_timestamp() where id=$1 and status='PENDING' and coalesce(expires_at,created_at+interval '30 minutes')>clock_timestamp() returning id",
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

    const placeholder=(
      await client.query(
        `insert into payments(
          order_id,
          user_id,
          provider,
          reference,
          amount,
          status,
          raw_reference,
          idempotency_key,
          expires_at
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
          now()+interval '30 minutes'
        )
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
          idempotencyKey
        ]
      )
    ).rows[0];

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
  const expiresAt=
    result.expiresAt &&
    Number.isFinite(Date.parse(String(result.expiresAt)))
      ? result.expiresAt
      : new Date(Date.now()+30*60*1000).toISOString();

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
  const p=await require('../../repositories/payments.repository').findById(id);
  if(!p||p.user_id!==userId)throw notFound('Payment not found.');
  return p;
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

      const sandboxCurrent=String(payment.status||'PENDING').toUpperCase();
      const sandboxAllowed=PAYMENT_TRANSITIONS[sandboxCurrent];
      const lateSandboxSuccess=
        next==='PAID' &&
        ['FAILED','EXPIRED','CANCELLED'].includes(sandboxCurrent);

      if((!sandboxAllowed || !sandboxAllowed.has(next)) && !lateSandboxSuccess){
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

      // Success sandbox is visible as a simulation but never as real revenue.
      const sandboxStoredStatus=next==='PAID'?'CANCELLED':next;

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
             updated_at=now()
         where id=$1`,
        [payment.id,parsed.reference,sandboxStoredStatus,payload,next]
      );

      let sandboxOrderStatus=lockedOrder.status;
      if(next!=='PENDING' && lockedOrder.status==='PENDING'){
        const targetOrderStatus=next==='PAID'?'CANCELLED':next;
        const updatedOrder=(
          await client.query(
            `update orders
             set status=$2::order_status,updated_at=now()
             where id=$1
               and payment_method='SANDBOX'
               and status='PENDING'
             returning status`,
            [lockedOrder.id,targetOrderStatus]
          )
        ).rows[0];
        if(updatedOrder) sandboxOrderStatus=updatedOrder.status;
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
            sideEffectsSuppressed:true
          }
        ]
      );

      return {
        duplicate:false,
        sandbox:true,
        sideEffectsSuppressed:true,
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
        const p=(await client.query('select stock,reserved_stock from products where id=$1 for update',[i.product_id])).rows[0];
        if(!p||Number(p.reserved_stock)<Number(i.quantity)||Number(p.stock)<Number(i.quantity))throw badRequest('FULFILLMENT_STOCK_CONFLICT','Product stock is no longer available for this paid order.');
        await client.query('update products set stock=stock-$2,reserved_stock=greatest(reserved_stock-$2,0),purchase_count=purchase_count+$2,updated_at=now() where id=$1',[i.product_id,i.quantity]);
        await client.query("insert into product_events(product_id,user_id,event_type) values($1,$2,'PURCHASE')",[i.product_id,payment.user_id]);
        await delivery.createEntitlement({userId:payment.user_id,productId:i.product_id,orderId:order.id},client);
      }
      await client.query("update orders set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now() where id=$1",[order.id]);
      await carts.clear(payment.user_id,client);
      await notifications.notify(payment.user_id,{type:'PAYMENT',title:'Pembayaran berhasil',body:`Pembayaran untuk ${order.order_number} berhasil diverifikasi.`,link:`/orders/${order.id}`},client);
      await notifications.notify(payment.user_id,{type:'ORDER',title:'Produk siap digunakan',body:`Order ${order.order_number} sudah dibayar dan akses content tersedia.`,link:`/orders/${order.id}`},client);
    } else if(['FAILED','EXPIRED','CANCELLED'].includes(next) && order.status==='PENDING'){
      await client.query("update orders set status=$2,updated_at=now() where id=$1",[order.id,next]);
      const items=(await client.query('select product_id,quantity from order_items where order_id=$1',[order.id])).rows;
      for(const i of items)await client.query('update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[i.product_id,i.quantity]);

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
module.exports={assertProviderReady,createForOrder,getStatus,processWebhook};
