const {query}=require('../config/database');module.exports={listForUser:async id=>(await query('select * from wallet_transactions where user_id=$1 order by created_at desc limit 100',[id])).rows};
