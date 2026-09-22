const { query }=require('../../config/database');
async function find(userId,key,operation){if(!userId||!key)return null;return (await query('select * from idempotency_keys where user_id=$1 and key=$2 and operation=$3',[userId,key,operation])).rows[0]||null;}
async function save(userId,key,operation,response){return (await query('insert into idempotency_keys(user_id,key,operation,response_json) values($1,$2,$3,$4) on conflict(user_id,key,operation) do update set response_json=excluded.response_json returning *',[userId,key,operation,response])).rows[0];}
module.exports={find,save};
