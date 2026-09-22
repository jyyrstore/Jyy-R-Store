const { query } = require('../config/database');
async function getAll(){ return (await query('select * from site_settings order by category,key')).rows; }
async function getPublic(){ return (await query('select key,category,value_json from site_settings where is_public=true')).rows; }
async function set(key,category,value_json,is_public=false){ return (await query('insert into site_settings(key,category,value_json,is_public) values($1,$2,$3,$4) on conflict(key) do update set category=excluded.category,value_json=excluded.value_json,is_public=excluded.is_public,updated_at=now() returning *',[key,category,value_json,is_public])).rows[0]; }
async function maintenance(){ return (await query('select * from maintenance_settings where id=1')).rows[0]; }
async function setMaintenance(data){ return (await query('update maintenance_settings set enabled=$1,title=$2,message=$3,scheduled_start=$4,scheduled_end=$5,allow_owner_access=$6,updated_at=now() where id=1 returning *',[data.enabled,data.title,data.message||null,data.scheduled_start||null,data.scheduled_end||null,data.allow_owner_access!==false])).rows[0]; }
module.exports={getAll,getPublic,set,maintenance,setMaintenance};
