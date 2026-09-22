const {query}=require('../config/database'); async function run(){await query('select 1');return true;} module.exports={run};
