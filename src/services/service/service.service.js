const repo=require('../../repositories/service.repository');
const {withTransaction}=require('../../config/database');
const {badRequest,notFound,forbidden}=require('../../utils/error');
const notifications=require('../../repositories/notification.repository');
const {randomId}=require('../../utils/crypto');
async function list(active=true){return repo.list(active)}
async function create(d){return repo.create(d)}
async function update(id,d){return repo.update(id,d)}
async function purchaseWithBalance(userId,serviceId,requestData){
  if(!userId) throw forbidden('Authentication required.');
  return withTransaction(async(client)=>{
    const service=(await client.query('select * from services where id=$1 for update',[serviceId])).rows[0];
    if(!service||!service.is_active) throw notFound('Service not found.');
    const wallet=(await client.query('select * from wallets where user_id=$1 for update',[userId])).rows[0] || (await client.query('insert into wallets(user_id) values($1) returning *',[userId])).rows[0];
    const before=Number(wallet.balance), price=Number(service.price||0);
    if(before<price) throw badRequest('INSUFFICIENT_BALANCE','Saldo tidak mencukupi untuk service ini.');
    const orderNumber=`JYR-S-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomId().slice(-6).toUpperCase()}`;
    const order=(await client.query("insert into orders(order_number,user_id,subtotal,total,payment_method,status,paid_at) values($1,$2,$3,$3,'BALANCE','PAID',now()) returning *",[orderNumber,userId,price])).rows[0];
    const after=before-price;
    await client.query('update wallets set balance=$2,updated_at=now() where user_id=$1',[userId,after]);
    await client.query("insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference,status,metadata) values($1,$2,'PURCHASE',$3,$4,$5,$6,'COMPLETED',$7)",[wallet.id,userId,price, before, after, order.id,{kind:'SERVICE',serviceId}]);
    const serviceOrder=(await client.query('insert into service_orders(user_id,service_id,order_id,request_data,status) values($1,$2,$3,$4,\'PENDING\') returning *',[userId,serviceId,order.id,requestData||{}])).rows[0];
    await notifications.create({user_id:userId,type:'ORDER',title:'Pesanan service dibuat',body:`Service ${service.name} berhasil dipesan.`,link:`/orders/${order.id}`},client);
    await client.query('insert into activity_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5)',[userId,'CREATE_SERVICE_ORDER','service_order',serviceOrder.id,{serviceId,orderId:order.id,amount:price}]);
    return {serviceOrder,order,wallet:{balance:after},service};
  });
}
module.exports={list,create,update,purchaseWithBalance};
