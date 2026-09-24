const profiles=require('../../repositories/profiles.repository'); const { query }=require('../../config/database'); const {badRequest}=require('../../utils/error');
async function get(userId){const p=await profiles.findById(userId); if(!p) return null; const totals=await query("select (select count(*) from orders where user_id=$1) total_orders, (select coalesce(sum(amount),0) from deposits where user_id=$1 and status='SUCCESS') total_deposit, (select coalesce(balance,0) from wallets where user_id=$1) balance",[userId]); return {...p,...totals.rows[0]};}
async function update(userId,data){const allowed={display_name:data.display_name,phone:data.phone,bio:data.bio,username:data.username}; if(allowed.username){const other=await profiles.findByUsername(allowed.username); if(other&&other.id!==userId) throw badRequest('USERNAME_EXISTS','Username sudah digunakan.');} return profiles.update(userId,Object.fromEntries(Object.entries(allowed).filter(([,v])=>v!==undefined)));}
async function loginHistory(userId,{limit=100,offset=0}={}){
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
      'select * from login_history where user_id=$1 order by created_at desc limit $2 offset $3',
      [userId,lim,off]
    )
  ).rows;
}

async function countLoginHistory(userId){
  return Number(
    (
      await query(
        'select count(*)::int count from login_history where user_id=$1',
        [userId]
      )
    ).rows[0].count
  );
}

module.exports={
  get,
  update,
  loginHistory,
  countLoginHistory
};
