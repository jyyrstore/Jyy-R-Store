const { query, withTransaction }=require('../config/database');
async function list(){return (await query('select r.*,p.username,o.order_number from refunds r join profiles p on p.id=r.user_id join orders o on o.id=r.order_id order by r.created_at desc limit 100')).rows}
async function create(d,client){const c=client||require('../config/database').db();return (await c.query('insert into refunds(order_id,payment_id,user_id,amount,reason,status,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *',[d.order_id,d.payment_id||null,d.user_id,d.amount,d.reason,'COMPLETED',d.created_by])).rows[0]}
module.exports={list,create,withTransaction};
