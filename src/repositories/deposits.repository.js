const { query } = require('../config/database');
async function create(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into deposits(user_id,amount,provider,reference,status,idempotency_key,expires_at) values($1,$2,$3,$4,$5,$6,$7) returning *',[data.user_id,data.amount,data.provider||null,data.reference||null,data.status||'PENDING',data.idempotency_key||null,data.expires_at||null])).rows[0]; }
async function listForUser(userId,limit=100){ return (await query('select * from deposits where user_id=$1 order by created_at desc limit $2',[userId,limit])).rows; }
async function findByReference(ref){ return (await query('select * from deposits where reference=$1',[ref])).rows[0]||null; }
async function adminList(filters={}){ const args=[]; let where='1=1'; if(filters.status){args.push(filters.status);where+=` and d.status=$${args.length}`} args.push(Math.min(100,Number(filters.limit||100))); return (await query(`select d.*,p.username,p.email from deposits d join profiles p on p.id=d.user_id where ${where} order by d.created_at desc limit $${args.length}`,args)).rows; }
module.exports={create,listForUser,findByReference,adminList};
