const {loadEnv}=require('../src/config/env');

const CORE_REQUIRED=[
  'APP_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'SESSION_SECRET',
  'COOKIE_SECRET',
  'CSRF_SECRET'
];

const PAYMENT_REQUIRED={
  'xendit':[
    'XENDIT_SECRET_KEY',
    'XENDIT_WEBHOOK_TOKEN',
    'XENDIT_RETURN_URL'
  ],
  'buatqris':[
    'BUATQRIS_ACCOUNT_ID',
    'BUATQRIS_SECRET_TOKEN',
    'BUATQRIS_SIGNING_SECRET',
    'BUATQRIS_CALLBACK_URL'
  ],
  'generic-json':[
    'PAYMENT_API_BASE_URL',
    'PAYMENT_API_KEY',
    'PAYMENT_WEBHOOK_SECRET'
  ]
};

function isSet(env,key){
  return Boolean(String(env[key]??'').trim());
}

function verify(){
  let env;

  try{
    env=loadEnv();
  }catch(error){
    console.error('Environment verification failed:',error.message);
    process.exitCode=1;
    return;
  }

  const provider=String(env.PAYMENT_PROVIDER||'').trim().toLowerCase();
  const paymentFields=PAYMENT_REQUIRED[provider];

  if(!paymentFields){
    console.error('Unsupported PAYMENT_PROVIDER:',provider||'(empty)');
    process.exitCode=1;
    return;
  }

  const required=[...CORE_REQUIRED,...paymentFields];

  if(env.NODE_ENV==='production'){
    required.push(
      'CRON_SECRET',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN'
    );
  }

  const smtpFields=[
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'EMAIL_FROM'
  ];

  const smtpConfigured=smtpFields.some(key=>isSet(env,key));

  if(smtpConfigured){
    required.push('SMTP_HOST','SMTP_USER','SMTP_PASSWORD');
  }

  const missing=[
    ...new Set(required.filter(key=>!isSet(env,key)))
  ];

  if(
    smtpConfigured&&
    !isSet(env,'SMTP_FROM')&&
    !isSet(env,'EMAIL_FROM')
  ){
    missing.push('SMTP_FROM or EMAIL_FROM');
  }

  const issues=[];

  if(env.NODE_ENV==='production'){
    try{
      const appUrl=new URL(env.APP_URL);

      if(
        appUrl.protocol!=='https:'||
        ['localhost','127.0.0.1','[::1]'].includes(appUrl.hostname)
      ){
        issues.push('APP_URL must be a public HTTPS URL in production');
      }
    }catch{
      issues.push('APP_URL must be a valid absolute URL');
    }

    if(provider==='xendit'){
      try{
        if(new URL(env.XENDIT_RETURN_URL).protocol!=='https:'){
          issues.push('XENDIT_RETURN_URL must use HTTPS in production');
        }
      }catch{
        issues.push('XENDIT_RETURN_URL must be a valid absolute URL');
      }
    }

    if(provider==='generic-json'){
      try{
        if(new URL(env.PAYMENT_API_BASE_URL).protocol!=='https:'){
          issues.push('PAYMENT_API_BASE_URL must use HTTPS in production');
        }
      }catch{
        issues.push('PAYMENT_API_BASE_URL must be a valid absolute URL');
      }
    }
  }

  console.log('Environment readiness:');
  console.log('NODE_ENV =',env.NODE_ENV);
  console.log('PAYMENT_PROVIDER =',provider);

  const displayKeys=[
    ...new Set([
      ...required,
      ...(smtpConfigured?smtpFields:[])
    ])
  ];

  for(const key of displayKeys){
    const status=isSet(env,key)?'configured':'MISSING';
    console.log(`${key} = ${status}`);
  }

  for(const issue of issues){
    console.error('ERROR:',issue);
  }

  if(missing.length||issues.length){
    if(missing.length){
      console.error('Missing required configuration:',missing.join(', '));
    }
    process.exitCode=1;
    return;
  }

  console.log('Environment verification passed.');
}

verify();
