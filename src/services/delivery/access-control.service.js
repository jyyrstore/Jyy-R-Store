const repo=require('../../repositories/delivery.repository');
async function canAccess(userId,productId){return Boolean(await repo.entitlement(userId,productId));}
module.exports={canAccess};
