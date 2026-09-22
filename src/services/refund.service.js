const { withTransaction }=require('../config/database');
const delivery=require('../repositories/delivery.repository');
async function refund(ownerId, orderId, reason){
  if(!reason || String(reason).trim().length<5) throw Object.assign(new Error('Alasan refund wajib diisi.'),{status:400,code:'REFUND_REASON_REQUIRED',expose:true});
  return withTransaction(async(client)=>{
    const order=(await client.query('select * from orders where id=$1 for update',[orderId])).rows[0];
    if(!order) throw Object.assign(new Error('Order tidak ditemukan.'),{status:404,code:'ORDER_NOT_FOUND',expose:true});
    if(order.payment_method!=='BALANCE') throw Object.assign(new Error('Refund otomatis untuk payment gateway belum tersedia tanpa adapter refund resmi dari provider.'),{status:409,code:'REFUND_PROVIDER_UNSUPPORTED',expose:true});
    if(!['PAID','COMPLETED','PROCESSING'].includes(order.status)) throw Object.assign(new Error('Order belum berada pada status yang dapat direfund.'),{status:409,code:'ORDER_NOT_REFUNDABLE',expose:true});
    if((await client.query("select id from refunds where order_id=$1 and status='COMPLETED'",[orderId])).rows[0]) throw Object.assign(new Error('Order sudah pernah direfund.'),{status:409,code:'ALREADY_REFUNDED',expose:true});
    const wallet=(await client.query('select * from wallets where user_id=$1 for update',[order.user_id])).rows[0] || (await client.query('insert into wallets(user_id) values($1) returning *',[order.user_id])).rows[0];
    const before=Number(wallet.balance), after=before+Number(order.total);
    const refundRow=(await client.query("insert into refunds(order_id,payment_id,user_id,amount,reason,status,created_by) values($1,null,$2,$3,$4,'COMPLETED',$5) returning *",[order.id,order.user_id,order.total,reason,ownerId])).rows[0];
    await client.query('update wallets set balance=$2,updated_at=now() where user_id=$1',[order.user_id,after]);
    await client.query("insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference,status,reason,metadata) values($1,$2,'REFUND',$3,$4,$5,$6,'COMPLETED',$7,$8)",[wallet.id,order.user_id,order.total,before,after,order.order_number,reason,JSON.stringify({refundId:refundRow.id,orderId:order.id})]);
    await client.query("update orders set status='REFUNDED',updated_at=now() where id=$1",[order.id]);
    await delivery.revokeByOrder(order.id,client);
    await client.query("insert into notifications(user_id,type,title,body,link) values($1,'PAYMENT',$2,$3,$4)",[order.user_id,'Refund berhasil',`Order ${order.order_number} telah direfund ke saldo wallet.`,`/orders/${order.id}`]);
    await client.query("insert into activity_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'REFUND_ORDER','order',$2,$3)",[ownerId,order.id,JSON.stringify({amount:order.total,reason})]);
    return refundRow;
  });
}
module.exports={refund};
