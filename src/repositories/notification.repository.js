const { query } = require('../config/database');
async function create(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into notifications(user_id,type,title,body,link) values($1,$2,$3,$4,$5) returning *',[data.user_id||null,data.type,data.title,data.body,data.link||null])).rows[0]; }
async function list(userId){ return (await query('select * from notifications where user_id=$1 or user_id is null order by created_at desc limit 100',[userId])).rows; }
async function adminList(limit=200){ return (await query('select n.*,p.username from notifications n left join profiles p on p.id=n.user_id order by n.created_at desc limit $1',[Math.min(500,Number(limit||200))])).rows; }
async function unreadCount(userId){ return Number((await query('select count(*)::int count from notifications where (user_id=$1 or user_id is null) and is_read=false',[userId])).rows[0].count); }
async function markRead(id,userId){ return (await query('update notifications set is_read=true,read_at=now() where id=$1 and user_id=$2 returning *',[id,userId])).rows[0]; }
module.exports={create,list,adminList,unreadCount,markRead};
