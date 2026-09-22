const {query}=require('../../config/database');
async function run(){await query("update deposits set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at is not null and expires_at < now()");}
module.exports={run};
