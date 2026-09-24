const { query } = require('../config/database');
async function ensure(clientOrPool,userId){ const c=clientOrPool||require('../config/database').db(); return (await c.query('insert into wallets(user_id) values($1) on conflict(user_id) do update set updated_at=now() returning *',[userId])).rows[0]; }
async function get(userId){ return (await query('select * from wallets where user_id=$1',[userId])).rows[0]||{user_id:userId,balance:0}; }
async function mutations(userId,limit=100,offset=0){
  const lim=Math.min(
    100,
    Math.max(1,Number(limit)||100)
  );

  const off=Math.max(
    0,
    Number(offset)||0
  );

  return (
    await query(
      'select * from wallet_transactions where user_id=$1 order by created_at desc limit $2 offset $3',
      [userId,lim,off]
    )
  ).rows;
}

async function countMutations(userId){
  return Number(
    (
      await query(
        'select count(*)::int count from wallet_transactions where user_id=$1',
        [userId]
      )
    ).rows[0].count
  );
}
module.exports={
  ensure,
  get,
  mutations,
  countMutations
};
