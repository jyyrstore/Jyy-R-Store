const { query } = require('../config/database');

function safeLimit(value,fallback=100){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(100,Math.max(1,n));
}

function safeOffset(value){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return 0;
  return Math.min(1000000,Math.max(0,n));
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

async function listForUser(userId,options={}){
  if(typeof options==='number'){
    options={limit:options};
  }

  const lim=safeLimit(options.limit,100);
  const off=safeOffset(options.offset);

  return (
    await query(
      'select * from deposits where user_id=$1 order by created_at desc limit $2 offset $3',
      [userId,lim,off]
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
  const off=safeOffset(filters.offset);

  args.push(lim);
  args.push(off);

  return (
    await query(
      `select d.*,p.username,p.email
       from deposits d
       join profiles p on p.id=d.user_id
       where ${where}
       order by d.created_at desc
       limit $${args.length-1}
       offset $${args.length}`,
      args
    )
  ).rows;
}

async function countForUser(userId){
  return Number(
    (
      await query(
        'select count(*)::int count from deposits where user_id=$1',
        [userId]
      )
    ).rows[0].count
  );
}

async function countAdmin(filters={}){
  const args=[];
  let where='1=1';

  if(filters.status){
    args.push(filters.status);
    where+=` and d.status=$${args.length}`;
  }

  return Number(
    (
      await query(
        `select count(*)::int count
         from deposits d
         join profiles p on p.id=d.user_id
         where ${where}`,
        args
      )
    ).rows[0].count
  );
}

module.exports={create,listForUser,findByReference,adminList,
  countForUser,
  countAdmin
};
