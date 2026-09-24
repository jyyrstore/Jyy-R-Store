const { query } = require('../config/database');
async function create(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into payments(order_id,user_id,provider,reference,amount,status,raw_reference,idempotency_key,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[data.order_id||null,data.user_id,data.provider,data.reference||null,data.amount,data.status||'PENDING',data.raw_reference||null,data.idempotency_key||null,data.expires_at||null])).rows[0]; }
async function findById(id){ return (await query('select * from payments where id=$1',[id])).rows[0]||null; }
async function findPendingByOrderId(orderId){ return (await query("select * from payments where order_id=$1 and status='PENDING' order by created_at desc limit 1",[orderId])).rows[0]||null; }
async function findByReference(ref){ return (await query('select * from payments where reference=$1',[ref])).rows[0]||null; }
async function list(filters={}){
  let args=[];
  let where=['1=1'];

  if(filters.status){
    args.push(filters.status);
    where.push(`py.status=$${args.length}`);
  }

  const limit=Math.min(
    100,
    Math.max(1,Number(filters.limit)||50)
  );

  const offset=Math.max(
    0,
    Number(filters.offset)||0
  );

  args.push(limit);
  args.push(offset);

  return (
    await query(
      `select
         py.*,
         o.order_number,
         p.username
       from payments py
       left join orders o on o.id=py.order_id
       join profiles p on p.id=py.user_id
       where ${where.join(' and ')}
       order by py.created_at desc
       limit $${args.length-1}
       offset $${args.length}`,
      args
    )
  ).rows;
}

async function countAdmin(filters={}){
  let args=[];
  let where=['1=1'];

  if(filters.status){
    args.push(filters.status);
    where.push(`py.status=$${args.length}`);
  }

  return Number(
    (
      await query(
        `select count(*)::int count
         from payments py
         where ${where.join(' and ')}`,
        args
      )
    ).rows[0].count
  );
}

module.exports={create,findById,findByReference,findPendingByOrderId,list,
  countAdmin
};
