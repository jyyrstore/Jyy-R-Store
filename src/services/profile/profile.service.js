const profiles=require('../../repositories/profiles.repository'); const {parseUserAgent}=require('../../utils/normalization'); const { query }=require('../../config/database'); const {badRequest}=require('../../utils/error');
async function get(userId){const p=await profiles.findById(userId); if(!p) return null; const totals=await query("with order_counts as (select user_id,count(*)::int total_orders from orders group by user_id), ranked as (select user_id,total_orders,rank() over(order by total_orders desc) top_rank from order_counts) select coalesce(r.total_orders,0) total_orders,(select coalesce(sum(amount),0) from deposits where user_id=$1 and status='SUCCESS') total_deposit,(select coalesce(balance,0) from wallets where user_id=$1) balance,case when r.top_rank is null then null else r.top_rank::int end top_rank from (select $1::uuid user_id) u left join ranked r on r.user_id=u.user_id",[userId]); return {...p,...totals.rows[0]};}
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

  const rows=(
    await query(
      'select * from login_history where user_id=$1 order by created_at desc limit $2 offset $3',
      [userId,lim,off]
    )
  ).rows;

  return rows.map(row=>{
    const legacyDevice=!row.device||row.device==='Unknown';
    const legacyBrowser=
      !row.browser ||
      /^Mozilla\//i.test(String(row.browser)) ||
      /^curl\//i.test(String(row.browser));

    if(!legacyDevice && !legacyBrowser){
      return row;
    }

    const parsed=parseUserAgent(row.browser);

    return {
      ...row,
      device:legacyDevice ? parsed.device : row.device,
      browser:legacyBrowser ? parsed.browser : row.browser
    };
  });
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
