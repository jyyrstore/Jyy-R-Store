const {loadEnv}=require('../src/config/env');
const {initPaymentProvider}=require('../src/config/payment');

(async()=>{
  const env=loadEnv();

  // Explicit standalone probe: always sends test=1 and creates no store order.
  if(process.argv.includes('--sandbox')){
    const {BuatQrisProvider}=require('../src/config/payment');
    const sandboxProvider=new BuatQrisProvider(env);

    if(!sandboxProvider.configured()){
      throw new Error('Set BUATQRIS_ACCOUNT_ID and BUATQRIS_SECRET_TOKEN before sandbox probe.');
    }

    const result=await sandboxProvider.createPayment({
      orderId:`JYYR-SANDBOX-${Date.now()}`,
      amount:1000,
      testMode:true
    });

    if(!result.raw?.isTest){
      throw new Error('Sandbox probe did not return a sandbox transaction.');
    }

    console.log('BuatQris sandbox create request succeeded.');
    console.log(`transaction_id = ${result.reference}`);
    console.log(`total_amount = ${result.raw.totalAmount}`);
    console.log('test=1 was sent. This probe does not prove webhook delivery.');
    return;
  }
  initPaymentProvider(env);

  console.log(`PAYMENT_PROVIDER = ${env.PAYMENT_PROVIDER}`);
  console.log(`PAYMENT_ENVIRONMENT = ${env.PAYMENT_ENVIRONMENT}`);

  if(String(env.PAYMENT_PROVIDER||'').toLowerCase()==='xendit'){
    console.log(`XENDIT_API_BASE_URL = ${env.XENDIT_API_BASE_URL?'configured':'missing'}`);
    console.log(`XENDIT_SECRET_KEY = ${env.XENDIT_SECRET_KEY?'configured':'missing'}`);
    console.log(`XENDIT_WEBHOOK_TOKEN = ${env.XENDIT_WEBHOOK_TOKEN?'configured':'missing'}`);
    console.log(`XENDIT_RETURN_URL = ${env.XENDIT_RETURN_URL?'configured':'missing'}`);

    if(
      !env.XENDIT_SECRET_KEY ||
      !env.XENDIT_WEBHOOK_TOKEN ||
      !env.XENDIT_RETURN_URL
    ){
      process.exitCode=1;
    }
  }else if(String(env.PAYMENT_PROVIDER||'').toLowerCase()==='buatqris'){
    console.log(`BUATQRIS_ACCOUNT_ID = ${env.BUATQRIS_ACCOUNT_ID?'configured':'missing'}`);
    console.log(`BUATQRIS_SECRET_TOKEN = ${env.BUATQRIS_SECRET_TOKEN?'configured':'missing'}`);
    console.log(`BUATQRIS_SIGNING_SECRET = ${env.BUATQRIS_SIGNING_SECRET?'configured':'missing'}`);
    console.log(`BUATQRIS_CALLBACK_URL = ${env.BUATQRIS_CALLBACK_URL?'configured':'missing'}`);

    const required=[
      env.BUATQRIS_ACCOUNT_ID,
      env.BUATQRIS_SECRET_TOKEN,
      env.BUATQRIS_SIGNING_SECRET,
      env.BUATQRIS_CALLBACK_URL
    ];
    if(required.some(value=>!value)) process.exitCode=1;
  }else{
    console.log(`PAYMENT_API_BASE_URL = ${env.PAYMENT_API_BASE_URL?'configured':'missing'}`);
    console.log(`PAYMENT_WEBHOOK_SECRET = ${env.PAYMENT_WEBHOOK_SECRET?'configured':'missing'}`);

    if(
      !env.PAYMENT_API_BASE_URL ||
      !env.PAYMENT_API_KEY ||
      !env.PAYMENT_WEBHOOK_SECRET
    ){
      process.exitCode=1;
    }
  }
})().catch(e=>{
  console.error('Payment verification failed:',e.message);
  process.exitCode=1;
});
