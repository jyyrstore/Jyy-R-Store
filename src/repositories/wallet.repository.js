const { query } = require('../config/database');
async function ensure(clientOrPool,userId){ const c=clientOrPool||require('../config/database').db(); return (await c.query('insert into wallets(user_id) values($1) on conflict(user_id) do update set updated_at=now() returning *',[userId])).rows[0]; }
async function get(userId){ return (await query('select * from wallets where user_id=$1',[userId])).rows[0]||{user_id:userId,balance:0}; }
async function mutations(userId,limit=100){ return (await query('select * from wallet_transactions where user_id=$1 order by created_at desc limit $2',[userId,limit])).rows; }
module.exports={ensure,get,mutations};
