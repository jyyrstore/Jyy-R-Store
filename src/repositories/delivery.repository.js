const {maskIp}=require('../utils/normalization');
const { query } = require('../config/database');
async function entitlement(userId,productId){ return (await query('select * from entitlements where user_id=$1 and product_id=$2 and status=\'ACTIVE\' order by granted_at desc limit 1',[userId,productId])).rows[0]||null; }
async function createEntitlement({userId,productId,orderId},client){ const c=client||require('../config/database').db(); return (await c.query("insert into entitlements(user_id,product_id,order_id,status) values($1,$2,$3,'ACTIVE') on conflict(user_id,product_id,order_id) do nothing returning *",[userId,productId,orderId])).rows[0]||null; }
async function revokeByOrder(orderId,client){ const c=client||require('../config/database').db(); await c.query("update entitlements set status='REVOKED',revoked_at=now() where order_id=$1 and status='ACTIVE'",[orderId]); }
async function logDownload(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into download_logs(user_id,content_id,order_id,ip,user_agent) values($1,$2,$3,$4,$5) returning *',[data.user_id,data.content_id,data.order_id||null,maskIp(data.ip),data.user_agent||null])).rows[0]; }
async function entitlements(userId,options={}){
  const limit=Number(options.limit||50);
  const offset=Number(options.offset||0);

  return (await query(
    `select e.*,p.name product_name,p.slug
       from entitlements e
       join products p on p.id=e.product_id
      where e.user_id=$1
        and e.status='ACTIVE'
      order by e.granted_at desc
      limit $2 offset $3`,
    [userId,limit,offset]
  )).rows;
}

async function countEntitlements(userId){
  return Number(
    (await query(
      "select count(*)::int count from entitlements where user_id=$1 and status='ACTIVE'",
      [userId]
    )).rows[0].count
  );
}

module.exports={entitlement,entitlements,createEntitlement,revokeByOrder,logDownload,
  countEntitlements
};
