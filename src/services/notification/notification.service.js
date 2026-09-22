const repo=require('../../repositories/notification.repository'); const {query}=require('../../config/database');
async function broadcast(data){const users=(await query("select id from profiles where status!='BANNED' and deleted_at is null")).rows; for(const u of users) await repo.create({...data,user_id:u.id}); return users.length;}
module.exports={...repo,broadcast};
