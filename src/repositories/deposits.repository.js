const { query } = require('../config/database');

function safeLimit(value,fallback=100){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(100,Math.max(1,n));
}

async function create(data,client){
  const c=client||require('../config/database').db();

  return (
    await c.query(
      'insert into deposits(user_id,amount,provider,reference,status,idempotency_key,expires_at) values($1,$2,$3,$4,$5,$6,$7) returning *',
      [
        data.user_id,
        data.amount,
        data.provider||null,
        data.reference||null,
        data.status||'PENDING',
        data.idempotency_key||null,
        data.expires_at||null
      ]
    )
  ).rows[0];
}

async function listForUser(userId,limit=100){
  const lim=safeLimit(limit,100);

  return (
    await query(
      'select * from deposits where user_id=$1 order by created_at desc limit $2',
      [userId,lim]
    )
  ).rows;
}

async function findByReference(ref){
  return (await query('select * from deposits where reference=$1',[ref])).rows[0]||null;
}

async function adminList(filters={}){
  const args=[];
  let where='1=1';

  if(filters.status){
    args.push(filters.status);
    where+=` and d.status=$${args.length}`;
  }

  const lim=safeLimit(filters.limit,100);
  args.push(lim);

  return (
    await query(
      `select d.*,p.username,p.email from deposits d join profiles p on p.id=d.user_id where ${where} order by d.created_at desc limit $${args.length}`,
      args
    )
  ).rows;
}

module.exports={create,listForUser,findByReference,adminList};
