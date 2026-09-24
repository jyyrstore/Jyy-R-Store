const { query, withTransaction }=require('../config/database');
async function list(options={}){
  const limit=Math.min(
    100,
    Math.max(1,Number(options.limit)||100)
  );

  const offset=Math.max(
    0,
    Number(options.offset)||0
  );

  return (
    await query(
      `select
         r.*,
         p.username,
         o.order_number
       from refunds r
       join profiles p on p.id=r.user_id
       join orders o on o.id=r.order_id
       order by r.created_at desc
       limit $1
       offset $2`,
      [limit,offset]
    )
  ).rows;
}

async function create(d,client){const c=client||require('../config/database').db();return (await c.query('insert into refunds(order_id,payment_id,user_id,amount,reason,status,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *',[d.order_id,d.payment_id||null,d.user_id,d.amount,d.reason,'COMPLETED',d.created_by])).rows[0]}
async function count(){
  return Number(
    (
      await query(
        'select count(*)::int count from refunds'
      )
    ).rows[0].count
  );
}

module.exports={list,create,withTransaction,
  count
};
