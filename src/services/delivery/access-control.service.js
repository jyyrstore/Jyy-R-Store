const repo=require('../../repositories/delivery.repository');
const {query}=require('../../config/database');

async function canAccess(userId,productId,orderId){
  if(!userId||!productId||!orderId)return false;

  const entitlement=await repo.entitlement(
    userId,
    productId,
    orderId
  );
  if(!entitlement)return false;

  const order=(
    await query(
      `select 1
       from orders
       where id=$1
         and user_id=$2
         and status in ('PAID','PROCESSING','COMPLETED')
       limit 1`,
      [orderId,userId]
    )
  ).rows[0];

  return Boolean(order);
}
module.exports={canAccess};
