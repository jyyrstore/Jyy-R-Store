const crypto=require('crypto');

let provider;

function timingSafeEqualText(a,b){
  const left=Buffer.from(String(a||''));
  const right=Buffer.from(String(b||''));
  return left.length===right.length && left.length>0 && crypto.timingSafeEqual(left,right);
}

async function readJson(response){
  return response.json().catch(()=>({}));
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

  normalizeReturnUrl(){
    const value=this.env.XENDIT_RETURN_URL||'';
    if(!value)throw Object.assign(new Error('XENDIT_RETURN_URL belum dikonfigurasi.'),{status:503,code:'XENDIT_RETURN_URL_NOT_CONFIGURED',expose:true});
    let u;
    try{u=new URL(value);}catch{throw Object.assign(new Error('XENDIT_RETURN_URL tidak valid.'),{status:500,code:'XENDIT_RETURN_URL_INVALID',expose:true});}
    if(u.protocol!=='https:'){
      throw Object.assign(new Error('XENDIT_RETURN_URL harus HTTPS.'),{status:500,code:'XENDIT_RETURN_URL_MUST_BE_HTTPS',expose:true});
    }
    return u.toString();
  }

  async createPayment({orderId,amount,customer,idempotencyKey}){
    if(!this.configured())throw Object.assign(new Error('Xendit Test Secret Key belum dikonfigurasi.'),{status:503,code:'XENDIT_NOT_CONFIGURED',expose:true});

    const returnUrl=this.normalizeReturnUrl();
    const base=(this.env.XENDIT_API_BASE_URL||'https://api.xendit.co').replace(/\/$/,'');
    const timeoutMs=Math.max(1000,Number(this.env.PAYMENT_REQUEST_TIMEOUT_MS||15000));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    const auth=Buffer.from(`${this.env.XENDIT_SECRET_KEY}:`).toString('base64');

    const body={
      reference_id:String(orderId),
      session_type:'PAY',
      mode:'PAYMENT_LINK',
      amount:Number(amount),
      currency:'IDR',
      country:'ID',
      locale:'id',
      customer:{
        reference_id:`JYRUSER${String(customer?.userId||orderId).replace(/[^A-Za-z0-9]/g,'').slice(-32)}`,
        type:'INDIVIDUAL'
      },
      success_return_url:returnUrl,
      cancel_return_url:this.env.XENDIT_CANCEL_RETURN_URL||returnUrl,
      description:`Jyy'R Store payment ${orderId}`,
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
      amount:Number(data.amount??data.request_amount??data.request_amount??0),
      status,
      paidAt:event==='payment_session.completed'?p.created||null:null,
      metadata:p
    };
  }
}

function initPaymentProvider(env){
  switch(String(env.PAYMENT_PROVIDER||'generic-json').toLowerCase()){
    case 'xendit':
      provider=new XenditProvider(env);
      break;
    case 'generic-json':
    default:
      provider=new GenericJsonProvider(env);
      break;
  }
}

function paymentProvider(){
  if(!provider)throw new Error('Payment provider not initialized.');
  return provider;
}

module.exports={initPaymentProvider,paymentProvider,GenericJsonProvider,XenditProvider};
