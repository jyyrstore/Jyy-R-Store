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

async function accessibleProductsForOrder(userId,orderId,productIds=[]){
  if(!userId||!orderId||!Array.isArray(productIds)||!productIds.length){
    return new Set();
  }

  return new Set(
    await repo.entitlementsForOrder(userId,orderId,productIds)
  );
}
module.exports={canAccess,accessibleProductsForOrder};
