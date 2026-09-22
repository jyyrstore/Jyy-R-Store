const { isConfigured, loadEnv }=require('../../config/env');
const { query }=require('../../config/database');
async function health(){ let db='unconfigured'; try{if(loadEnv().DATABASE_URL){await query('select 1');db='ok';}}catch{db='error'} return {configured:isConfigured(),database:db}; }
module.exports={health};
