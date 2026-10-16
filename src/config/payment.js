const crypto=require('crypto');

let provider;
let providerEnv;

function timingSafeEqualText(a,b){
  const left=Buffer.from(String(a||''));
  const right=Buffer.from(String(b||''));
  return left.length===right.length && left.length>0 && crypto.timingSafeEqual(left,right);
}

async function readJson(response){
  return response.json().catch(()=>({}));
}

/*
 * BuatQris returns expired_at as a Jakarta-local timestamp without a
 * timezone suffix (for example, "2026-10-16 15:39:51").
 * Normalize it here to ISO UTC. Preserve explicit Z/offset timestamps.
 * Invalid or unsupported values return null so payment.service.js can
 * apply its existing 30-minute safety fallback.
 */
function normalizeBuatQrisExpiry(value) {
  if (value == null) return null;

  const input = String(value).trim();
  if (!input) return null;

  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/i
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '00');
  const fraction = match[7] || '';
  const zonePart = match[8] || null;

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31, leapYear ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31
  ];

  if (
    year < 1 ||
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  let zone = '+07:00';

  if (zonePart) {
    if (zonePart.toUpperCase() === 'Z') {
      zone = 'Z';
    } else {
      const offset = zonePart.match(/^([+-])(\d{2}):?(\d{2})$/);
      if (!offset) return null;

      const offsetHours = Number(offset[2]);
      const offsetMinutes = Number(offset[3]);

      if (
        offsetHours > 14 ||
        offsetMinutes > 59 ||
        (offsetHours === 14 && offsetMinutes !== 0)
      ) {
        return null;
      }

      zone = `${offset[1]}${offset[2]}:${offset[3]}`;
    }
  }

  const milliseconds = fraction
    ? `.${fraction.slice(0, 3).padEnd(3, '0')}`
    : '';

  const isoInput =
    `${match[1]}-${match[2]}-${match[3]}T` +
    `${match[4]}:${match[5]}:${match[6] || '00'}` +
    `${milliseconds}${zone}`;

  const timestamp = Date.parse(isoInput);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

class GenericJsonProvider{
  constructor(env){this.env=env;}
  configured(){return Boolean(this.env.PAYMENT_API_BASE_URL&&this.env.PAYMENT_API_KEY);}
  async createPayment({orderId,amount,customer,returnUrl,idempotencyKey}){
    if(!this.configured())throw Object.assign(new Error('Payment provider belum dikonfigurasi.'),{status:503,code:'PAYMENT_PROVIDER_NOT_CONFIGURED',expose:true});
    const timeoutMs=Math.max(1000,Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS||15000));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{
      response=await fetch(`${this.env.PAYMENT_API_BASE_URL.replace(/\/$/,'')}/payments`,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          authorization:`Bearer ${this.env.PAYMENT_API_KEY}`,
          ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})
        },
        body:JSON.stringify({
          orderId,
          amount:Number(amount),
          customer,
          returnUrl,
          environment:this.env.PAYMENT_ENVIRONMENT,
          ...(idempotencyKey?{idempotencyKey}:{})
        }),
        signal:controller.signal
      });
    }catch(error){
      if(error?.name==='AbortError')throw new Error('Payment provider request timed out.',{cause:error});
      throw error;
    }finally{clearTimeout(timer);}
    const body=await readJson(response);
    if(!response.ok)throw new Error(body.message||body.error_code||`Payment provider returned ${response.status}`);
    if(!body.reference||!body.paymentUrl)throw new Error('Payment provider response must contain reference and paymentUrl.');
    return{reference:body.reference,paymentUrl:body.paymentUrl,expiresAt:body.expiresAt||null,raw:body};
  }
  verifyWebhook(rawBody,signature){
    const secret=this.env.PAYMENT_WEBHOOK_SECRET;
    if(!secret||!signature)return false;
    const expected=crypto.createHmac(this.env.PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM,secret).update(rawBody).digest('hex');
    return timingSafeEqualText(expected,signature);
  }
  parseWebhook(payload,rawBody){
    const p=payload||{};
    const fallback=rawBody!=null?`sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`:'';
    return{
      eventId:String(p.eventId||p.id||fallback),
      orderId:p.orderId?String(p.orderId):null,
      reference:p.reference?String(p.reference):'',
      amount:Number(p.amount||0),
      status:String(p.status||'').toUpperCase(),
      paidAt:p.paidAt||null,
      metadata:p
    };
  }
}

class XenditProvider{
  constructor(env){this.env=env;}
  configured(){
    return Boolean(this.env.XENDIT_SECRET_KEY);
  }

  normalizeHttpsUrl(value,name,{required=false}={}){
    const input=String(value||'');
    if(!input){
      if(required)throw Object.assign(new Error(`${name} belum dikonfigurasi.`),{status:503,code:`${name}_NOT_CONFIGURED`,expose:true});
      return null;
    }

    let u;
    try{u=new URL(input);}catch{throw Object.assign(new Error(`${name} tidak valid.`),{status:500,code:`${name}_INVALID`,expose:true});}
    if(u.protocol!=='https:'){
      throw Object.assign(new Error(`${name} harus HTTPS.`),{status:500,code:`${name}_MUST_BE_HTTPS`,expose:true});
    }
    return u.toString();
  }

  normalizeReturnUrl(value=null){
    const supplied=String(value||'').trim();

    if(supplied){
      try{
        const parsed=new URL(supplied);

        if(parsed.protocol==='https:'){
          return parsed.toString();
        }
      }catch{ /* Intentionally ignore this recoverable error. */ }
    }

    return this.normalizeHttpsUrl(
      this.env.XENDIT_RETURN_URL,
      'XENDIT_RETURN_URL',
      {required:true}
    );
  }

  async createPayment({orderId,amount,customer,idempotencyKey,returnUrl}){
    if(!this.configured())throw Object.assign(new Error('Xendit Test Secret Key belum dikonfigurasi.'),{status:503,code:'XENDIT_NOT_CONFIGURED',expose:true});

    const callbackReturnUrl=this.normalizeReturnUrl(returnUrl);
    const base=(this.env.XENDIT_API_BASE_URL||'https://api.xendit.co').replace(/\/$/,'');
    const timeoutMs=Math.max(1000,Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS||15000));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    const auth=Buffer.from(`${this.env.XENDIT_SECRET_KEY}:`).toString('base64');

    const rawGivenNames=String(
      customer?.givenNames||
      customer?.username||
      customer?.email?.split('@')[0]||
      'Customer'
    );

    const givenNames=rawGivenNames
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]/g,'')
      .slice(0,50)||'Customer';

    const rawSurname=String(customer?.surname||'')
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]/g,'')
      .slice(0,50);

    const xenditCustomer={
      reference_id:`JYRUSER${String(orderId).replace(/[^A-Za-z0-9]/g,'').slice(-48)}`,
      type:'INDIVIDUAL',
      individual_detail:{
        given_names:givenNames,
        ...(rawSurname?{surname:rawSurname}:{})
      }
    };

    if(customer?.email){
      xenditCustomer.email=String(customer.email).slice(0,50);
    }

    if(customer?.mobileNumber){
      xenditCustomer.mobile_number=String(customer.mobileNumber);
    }

    const body={
      reference_id:String(orderId),
      session_type:'PAY',
      mode:'PAYMENT_LINK',
      amount:Number(amount),
      currency:'IDR',
      country:'ID',
      locale:'id',
      customer:xenditCustomer,
      success_return_url:callbackReturnUrl,
      cancel_return_url:this.normalizeHttpsUrl(this.env.XENDIT_CANCEL_RETURN_URL,'XENDIT_CANCEL_RETURN_URL')||returnUrl,
      description:`Jyyr Store payment ${orderId}`,
      metadata:{
        order_id:String(orderId)
      }
    };

    let response;
    try{
      response=await fetch(`${base}/sessions`,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          authorization:`Basic ${auth}`,
          ...(idempotencyKey?{'Idempotency-key':idempotencyKey}:{})
        },
        body:JSON.stringify(body),
        signal:controller.signal
      });
    }catch(error){
      if(error?.name==='AbortError')throw Object.assign(new Error('Xendit request timed out.'),{status:504,code:'XENDIT_TIMEOUT',expose:true});
      throw error;
    }finally{clearTimeout(timer);}

    const data=await readJson(response);

    if(!response.ok){
      const message=data?.message||data?.error_code||`Xendit returned ${response.status}`;
      throw Object.assign(new Error(message),{
        status:response.status>=500?502:400,
        code:String(data?.error_code||'XENDIT_API_ERROR'),
        expose:true
      });
    }

    if(!data.payment_session_id||!data.payment_link_url){
      throw Object.assign(new Error('Respons Xendit tidak memiliki payment_session_id/payment_link_url.'),{
        status:502,
        code:'XENDIT_INVALID_RESPONSE',
        expose:true
      });
    }

    return{
      reference:String(data.reference_id||orderId),
      paymentUrl:String(data.payment_link_url),
      expiresAt:data.expires_at||null,
      raw:data
    };
  }

  verifyWebhook(rawBody,token){
    return timingSafeEqualText(this.env.XENDIT_WEBHOOK_TOKEN,token);
  }

  parseWebhook(payload,rawBody){
    const p=payload||{};
    const data=p.data||{};
    const event=String(p.event||'').toLowerCase();
    const fallback=rawBody!=null?`sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`:'';
    let status='';

    if(event==='payment_session.completed')status='PAID';
    else if(event==='payment_session.expired')status='EXPIRED';
    else if(event==='payment.capture')status='PAID';
    else if(event==='payment.failure'||event==='payment.failed')status='FAILED';
    else if(String(data.status||'').toUpperCase()==='COMPLETED')status='PAID';
    else if(String(data.status||'').toUpperCase()==='EXPIRED')status='EXPIRED';

    const reference=String(
      data.reference_id||
      ''
    );

    const eventId=String(
      (event&&reference)?`${event}:${reference}`:
      p.id||
      data.payment_session_id||
      data.payment_id||
      fallback
    );

    return{
      eventId,
      orderId:data.metadata?.order_id?String(data.metadata.order_id):null,
      reference,
      amount:Number(data.amount??data.request_amount??0),
      status,
      paidAt:event==='payment_session.completed'?p.created||null:null,
      metadata:p
    };
  }
}


class BuatQrisProvider {
  constructor(env) {
    this.env = env;
  }

  configured() {
    return Boolean(
      this.env.BUATQRIS_ACCOUNT_ID &&
      this.env.BUATQRIS_SECRET_TOKEN &&
      String(this.env.BUATQRIS_SECRET_TOKEN).length >= 20
    );
  }

  httpsUrl(value, field) {
    if (!value) return null;

    let parsed;
    try {
      parsed = new URL(String(value));
    } catch {
      throw Object.assign(
        new Error(`Respons BuatQris memiliki ${field} yang tidak valid.`),
        {status:502, code:'BUATQRIS_INVALID_URL', expose:true}
      );
    }

    if (parsed.protocol !== 'https:') {
      throw Object.assign(
        new Error(`Respons BuatQris ${field} wajib menggunakan HTTPS.`),
        {status:502, code:'BUATQRIS_INSECURE_URL', expose:true}
      );
    }

    return parsed.toString();
  }

  async createPayment({orderId, amount, testMode} = {}) {
    if (!this.configured()) {
      throw Object.assign(
        new Error('Kredensial BuatQris belum dikonfigurasi.'),
        {status:503, code:'BUATQRIS_NOT_CONFIGURED', expose:true}
      );
    }

    const requestedAmount = Math.round(Number(amount));
    if (!Number.isSafeInteger(requestedAmount) || requestedAmount < 1000) {
      throw Object.assign(
        new Error('Nominal pembayaran BuatQris tidak valid.'),
        {status:400, code:'BUATQRIS_INVALID_AMOUNT', expose:true}
      );
    }

    const mode = testMode === undefined
      ? this.env.BUATQRIS_TEST_MODE !== false
      : Boolean(testMode);

    const feeBy = String(this.env.BUATQRIS_FEE_BY || 'user').toLowerCase();
    const qrisMethod = String(this.env.BUATQRIS_QRIS_METHOD || '').toLowerCase();

    if (!['user', 'buyer'].includes(feeBy)) {
      throw Object.assign(
        new Error('BUATQRIS_FEE_BY harus user atau buyer.'),
        {status:500, code:'BUATQRIS_FEE_CONFIG_INVALID', expose:true}
      );
    }

    if (qrisMethod &&
        !['qris_one', 'qris_two', 'qris_three', 'qris_four'].includes(qrisMethod)) {
      throw Object.assign(
        new Error('BUATQRIS_QRIS_METHOD tidak valid.'),
        {status:500, code:'BUATQRIS_METHOD_CONFIG_INVALID', expose:true}
      );
    }

    const form = new URLSearchParams();
    form.set('action', 'api_create_qris');
    form.set('account_id', this.env.BUATQRIS_ACCOUNT_ID);
    form.set('secret_token', this.env.BUATQRIS_SECRET_TOKEN);
    form.set('amount', String(requestedAmount));
    form.set(
      'description',
      `Pembayaran JYYR-STORE ${String(orderId || '').slice(0, 70)}`.slice(0, 100)
    );
    form.set('fee_by', feeBy);

    if (qrisMethod) form.set('qris_method', qrisMethod);
    if (this.env.BUATQRIS_CALLBACK_URL) {
      form.set('callback_url', this.env.BUATQRIS_CALLBACK_URL);
    }
    if (mode) form.set('test', '1');
    if (this.env.APP_NAME) form.set('app_name', String(this.env.APP_NAME).slice(0, 100));
    if (this.env.APP_URL) form.set('app_url', this.env.APP_URL);

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS || 15000));
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch('https://api.buatqris.site', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: form.toString(),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(
          new Error('Request BuatQris melewati batas waktu.'),
          {status:504, code:'BUATQRIS_TIMEOUT', expose:true}
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => null);

    if (!response.ok || body?.success !== true) {
      const message = body?.message ||
        (response.status === 429
          ? 'Batas permintaan BuatQris tercapai. Coba kembali nanti.'
          : `BuatQris menolak permintaan (HTTP ${response.status}).`);

      throw Object.assign(
        new Error(message),
        {
          status: response.status === 429 ? 429 : (response.status >= 500 ? 502 : 400),
          code: response.status === 429 ? 'BUATQRIS_RATE_LIMITED' : 'BUATQRIS_API_ERROR',
          expose: true
        }
      );
    }

    const data = body.data || {};
    const reference = String(data.transaction_id || '');
    const totalAmount = Number(data.total_amount);

    if (!reference || !Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      throw Object.assign(
        new Error('Respons BuatQris tidak memiliki transaction_id/total_amount valid.'),
        {status:502, code:'BUATQRIS_INVALID_RESPONSE', expose:true}
      );
    }

    const paymentUrl = this.httpsUrl(data.payment_url, 'payment_url');
    const qrUrl = this.httpsUrl(data.qr_url, 'qr_url');
    const qrisImage = typeof data.qris_image === 'string' &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qris_image)
        ? data.qris_image
        : null;

    if (!paymentUrl && !qrUrl && !qrisImage) {
      throw Object.assign(
        new Error('Respons BuatQris tidak memiliki payment_url, qr_url, atau qris_image yang valid.'),
        {status:502, code:'BUATQRIS_PAYMENT_METHOD_MISSING', expose:true}
      );
    }

    const isTest = data.is_test == null
      ? mode
      : (
        data.is_test === true ||
        data.is_test === 1 ||
        ['true', '1', 'yes', 'test'].includes(String(data.is_test).toLowerCase())
      );

    return {
      reference,
      paymentUrl,
      expiresAt: normalizeBuatQrisExpiry(data.expired_at),
      raw: {
        ...data,
        totalAmount,
        isTest,
        paymentUrl,
        qr_url: qrUrl,
        qris_image: qrisImage
      }
    };
  }

  async checkStatus(transactionId) {
    if (!this.configured()) {
      throw Object.assign(
        new Error('Kredensial BuatQris belum dikonfigurasi.'),
        {status:503, code:'BUATQRIS_NOT_CONFIGURED', expose:false}
      );
    }

    const reference = String(transactionId || '').trim();
    if (!reference) {
      throw Object.assign(
        new Error('Transaction ID BuatQris kosong.'),
        {status:400, code:'BUATQRIS_STATUS_REFERENCE_MISSING', expose:false}
      );
    }

    const form = new URLSearchParams({
      action: 'api_check_status',
      account_id: this.env.BUATQRIS_ACCOUNT_ID,
      secret_token: this.env.BUATQRIS_SECRET_TOKEN,
      transaction_id: reference
    });

    const controller = new AbortController();
    const timeoutMs = Math.max(
      1000,
      Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS || 15000)
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch('https://api.buatqris.site', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: form.toString(),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(
          new Error('Pemeriksaan status BuatQris melewati batas waktu.'),
          {code:'BUATQRIS_STATUS_TIMEOUT', expose:false}
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw Object.assign(
        new Error(
          body?.message ||
          `BuatQris status check gagal (HTTP ${response.status}).`
        ),
        {
          code: response.status === 429
            ? 'BUATQRIS_STATUS_RATE_LIMITED'
            : 'BUATQRIS_STATUS_API_ERROR',
          expose: false
        }
      );
    }

    const data = body.data || {};
    const returnedReference = String(data.transaction_id || '').trim();
    const status = String(data.status || '').trim().toLowerCase();

    if (
      !returnedReference ||
      !['pending', 'success', 'expired', 'failed'].includes(status)
    ) {
      throw Object.assign(
        new Error('Respons status BuatQris tidak valid.'),
        {code:'BUATQRIS_STATUS_INVALID_RESPONSE', expose:false}
      );
    }

    for (const field of ['amount', 'total_amount']) {
      if (
        data[field] != null &&
        (!Number.isSafeInteger(Number(data[field])) || Number(data[field]) < 0)
      ) {
        throw Object.assign(
          new Error(`Nilai ${field} dari BuatQris tidak valid.`),
          {code:'BUATQRIS_STATUS_INVALID_AMOUNT', expose:false}
        );
      }
    }

    return {
      ...data,
      transaction_id: returnedReference,
      status,
      ...(data.amount != null ? {amount:Number(data.amount)} : {}),
      ...(data.total_amount != null
        ? {total_amount:Number(data.total_amount)}
        : {})
    };
  }

  verifyWebhook(rawBody, signature) {
    const secret = this.env.BUATQRIS_SIGNING_SECRET;
    if (!secret || !signature || rawBody == null) return false;

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return timingSafeEqualText(expected, signature);
  }

  parseWebhook(payload) {
    const p = payload || {};
    const event = String(p.event || '').trim().toLowerCase();
    const bodyStatus = String(p.status || '').trim().toLowerCase();
    const isWithdrawal = event.startsWith('withdrawal.');

    const reference = String(
      isWithdrawal
        ? (p.withdrawal_id || p.transaction_id || '')
        : (p.transaction_id || '')
    );

    const eventStatus = {
      'payment.success':'SUCCESS',
      'payment.expired':'EXPIRED',
      'payment.failed':'FAILED'
    }[event] || '';

    const bodyStatusMap = {
      success:'SUCCESS',
      expired:'EXPIRED',
      failed:'FAILED',
      pending:'PENDING'
    };

    let status = eventStatus || bodyStatusMap[bodyStatus] || '';
    if (
      eventStatus &&
      bodyStatusMap[bodyStatus] &&
      eventStatus !== bodyStatusMap[bodyStatus]
    ) {
      status = '';
    }

    const isTest = (
      p.is_test === true ||
      p.is_test === 1 ||
      ['true', '1', 'yes', 'test'].includes(String(p.is_test).toLowerCase())
    );

    // Event identity stays constant for the same event and delivery retry.
    const eventId = reference && event
      ? `buatqris:${event}:${reference}`
      : '';

    return {
      eventId,
      reference,
      orderId: null,
      amount: isWithdrawal ? Number(p.amount) : Number(p.total_amount),
      status,
      isTest,
      isWithdrawal,
      paidAt: p.paid_at || null,
      metadata: p
    };
  }
}

function resolvedPaymentUrl(payment, externalUrl) {
  const direct = externalUrl ||
    payment?.raw_reference?.paymentUrl ||
    payment?.raw_reference?.payment_url;

  if (direct) return String(direct);

  const hasQr = Boolean(
    payment?.raw_reference?.qr_url ||
    payment?.raw_reference?.qris_image
  );

  if (
    String(payment?.provider || '').toLowerCase() === 'buatqris' &&
    hasQr &&
    payment?.id
  ) {
    return `/payment/${encodeURIComponent(payment.id)}`;
  }

  return null;
}

function makePaymentProvider(name, env) {
  switch (String(name || 'generic-json').toLowerCase()) {
    case 'buatqris':
      return new BuatQrisProvider(env);
    case 'xendit':
      return new XenditProvider(env);
    case 'generic-json':
      return new GenericJsonProvider(env);
    default:
      throw new Error('Unsupported PAYMENT_PROVIDER: ' + name);
  }
}

function initPaymentProvider(env) {
  providerEnv = env;
  provider = makePaymentProvider(env.PAYMENT_PROVIDER, env);
}

function paymentProvider(name) {
  if (!provider || !providerEnv) {
    throw new Error('Payment provider not initialized.');
  }

  if (!name) return provider;

  const wanted = String(name).toLowerCase();
  const active = String(providerEnv.PAYMENT_PROVIDER || 'generic-json').toLowerCase();

  return wanted === active
    ? provider
    : makePaymentProvider(wanted, providerEnv);
}

module.exports = {
  initPaymentProvider,
  paymentProvider,
  GenericJsonProvider,
  XenditProvider,
  BuatQrisProvider,
  resolvedPaymentUrl
};
