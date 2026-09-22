const { query } = require('../config/database');
async function findById(id){ return (await query('select * from profiles where id=$1',[id])).rows[0]||null; }
async function findByEmail(email){ return (await query('select * from profiles where lower(email)=lower($1)',[email])).rows[0]||null; }
async function findByUsername(username){ return (await query('select * from profiles where lower(username)=lower($1)',[username])).rows[0]||null; }
async function create({id,username,email}){ return (await query('insert into profiles(id,username,email) values($1,$2,$3) on conflict(id) do update set email=excluded.email returning *',[id,username,email])).rows[0]; }
async function update(id,data){ const fields=Object.keys(data); if(!fields.length) return findById(id); const sql=`update profiles set ${fields.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=now() where id=$1 returning *`; return (await query(sql,[id,...fields.map(k=>data[k])])).rows[0]; }
async function list({search='',limit=50,offset=0}){ const q=`select p.*,coalesce(w.balance,0) balance,(select count(*) from orders o where o.user_id=p.id) orders from profiles p left join wallets w on w.user_id=p.id where ($1='' or p.username ilike '%'||$1||'%' or p.email ilike '%'||$1||'%') order by p.created_at desc limit $2 offset $3`; return (await query(q,[search,limit,offset])).rows; }
module.exports={findById,findByEmail,findByUsername,create,update,list};
