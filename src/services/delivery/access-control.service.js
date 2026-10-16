const repo=require('../../repositories/delivery.repository');
const {query}=require('../../config/database');
async function canAccess(userId,productId){
  const entitlement=await repo.entitlement(userId,productId);
  if(!entitlement)return false;

  const order=(
    await query(
      `select 1
       from orders
       where id=$1
         and user_id=$2
         and status in ('PAID','PROCESSING','COMPLETED')
       limit 1`,
      [entitlement.order_id,userId]
    )
  ).rows[0];

  return Boolean(order);
}
module.exports={canAccess};
