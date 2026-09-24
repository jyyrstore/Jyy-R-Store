const { query } = require('../config/database');
async function log(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into activity_logs(actor_user_id,action,entity_type,entity_id,metadata,masked_ip,user_agent) values($1,$2,$3,$4,$5,$6,$7) returning *',[data.actor_user_id||null,data.action,data.entity_type||null,data.entity_id||null,data.metadata||null,data.masked_ip||null,data.user_agent||null])).rows[0]; }
async function list(limit=200,offset=0){
  return (
    await query(
      `select
         a.*,
         p.username
       from activity_logs a
       left join profiles p on p.id=a.actor_user_id
       order by a.created_at desc
       limit $1
       offset $2`,
      [
        Math.min(
          200,
          Math.max(1,Number(limit)||200)
        ),
        Math.max(
          0,
          Number(offset)||0
        )
      ]
    )
  ).rows;
}

async function count(){
  return Number(
    (
      await query(
        'select count(*)::int count from activity_logs'
      )
    ).rows[0].count
  );
}

module.exports={log,list,
  count
};
