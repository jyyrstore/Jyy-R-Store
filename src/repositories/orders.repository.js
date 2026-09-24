const { query, withTransaction } = require('../config/database');

function safeLimit(value,fallback=50){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(100,Math.max(1,n));
}

function safeOffset(value){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return 0;
  return Math.min(1000000,Math.max(0,n));
}

async function listForUser(userId,{limit=50,offset=0}={}){
  const lim=safeLimit(limit,50);
  const off=safeOffset(offset);

  return (
    await query(
      `select o.*,coalesce(json_agg(json_build_object('product_id',oi.product_id,'product_name',oi.product_name,'quantity',oi.quantity,'line_total',oi.line_total)) filter(where oi.id is not null),'[]') items from orders o left join order_items oi on oi.order_id=o.id where o.user_id=$1 group by o.id order by o.created_at desc limit $2 offset $3`,
      [userId,lim,off]
    )
  ).rows;
}

async function findForUser(id,userId){
  return (
    await query(
      `select o.*,coalesce(json_agg(json_build_object('id',oi.id,'product_id',oi.product_id,'product_name',oi.product_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total)) filter(where oi.id is not null),'[]') items from orders o left join order_items oi on oi.order_id=o.id where o.id=$1 and o.user_id=$2 group by o.id`,
      [id,userId]
    )
  ).rows[0]||null;
}

async function findById(id){
  return (await query('select * from orders where id=$1',[id])).rows[0]||null;
}

async function adminList(filters={}){
  let where=['1=1'],args=[];

  if(filters.status){
    args.push(filters.status);
    where.push(`o.status=$${args.length}`);
  }

  if(filters.search){
    args.push(`%${filters.search}%`);
    where.push(`(o.order_number ilike $${args.length} or p.username ilike $${args.length})`);
  }

  const lim=safeLimit(filters.limit,50);
  args.push(lim);

  return (
    await query(
      `select o.*,p.username,p.email from orders o join profiles p on p.id=o.user_id where ${where.join(' and ')} order by o.created_at desc limit $${args.length}`,
      args
    )
  ).rows;
}

module.exports={listForUser,findForUser,findById,adminList,withTransaction};
