const {query}=require('../config/database');module.exports={listForOrder:async id=>(await query('select * from order_items where order_id=$1 order by id',[id])).rows};
