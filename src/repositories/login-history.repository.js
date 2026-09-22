const {query}=require('../config/database');
module.exports={listForUser:async id=>(await query('select * from login_history where user_id=$1 order by created_at desc limit 100',[id])).rows,listAll:async()=>(await query('select * from login_history order by created_at desc limit 200')).rows};
