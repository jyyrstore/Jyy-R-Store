const {loadEnv}=require('../src/config/env');
const {
  initDatabase,
  query,
  closeDatabase
}=require('../src/config/database');

const REQUIRED_TABLES=[
  'profiles',
  'products',
  'product_variants',
  'product_contents',
  'orders',
  'payments',
  'payment_events',
  'deposits',
  'wallets',
  'wallet_transactions',
  'idempotency_keys',
  'entitlements',
  'tickets',
  'notifications',
  'activity_logs'
];

async function verifyDatabase(){
  try{
    const env=loadEnv();

    if(!env.DATABASE_URL){
      throw new Error('DATABASE_URL is missing');
    }

    await initDatabase(env);

    const rows=(await query(
      `select table_name
       from information_schema.tables
       where table_schema='public'
         and table_name = any($1::text[])
       order by table_name`,
      [REQUIRED_TABLES]
    )).rows;

    const existing=new Set(rows.map(row=>row.table_name));
    const missing=REQUIRED_TABLES.filter(name=>!existing.has(name));

    console.log(
      `Critical tables found: ${existing.size}/${REQUIRED_TABLES.length}`
    );

    if(existing.size){
      console.log('Found:',[...existing].sort().join(', '));
    }

    if(missing.length){
      console.error('Missing critical tables:',missing.join(', '));
      process.exitCode=1;
      return;
    }

    console.log('Database verification passed.');
  }catch(error){
    console.error('Database verification failed:',error.message);
    process.exitCode=1;
  }finally{
    try{
      await closeDatabase();
    }catch(error){
      console.error('Database connection cleanup failed:',error.message);
      process.exitCode=1;
    }
  }
}

verifyDatabase();
