const {query}=require('../config/database');
async function listForUser(userId){return (await query('select m.*,p.username sender_username,p.display_name sender_display_name from messages m join profiles p on p.id=m.sender_id where m.user_id=$1 order by m.created_at desc limit 100',[userId])).rows}
async function findForUser(id,userId){return (await query('select m.*,p.username sender_username,p.display_name sender_display_name from messages m join profiles p on p.id=m.sender_id where m.id=$1 and m.user_id=$2',[id,userId])).rows[0]||null}
async function listAll(){return (await query('select m.*,u.username user_username,s.username sender_username from messages m join profiles u on u.id=m.user_id join profiles s on s.id=m.sender_id order by m.created_at desc limit 200')).rows}
async function create(d){return (await query('insert into messages(user_id,sender_id,body) values($1,$2,$3) returning *',[d.user_id,d.sender_id,d.body])).rows[0]}
async function firstOwner(){return (await query("select id from profiles where role='OWNER' and deleted_at is null and status='ACTIVE' order by created_at asc limit 1")).rows[0]||null}
async function createFromUser(userId,body){const owner=await firstOwner();if(!owner) throw Object.assign(new Error('Owner support belum dikonfigurasi.'),{status:503,code:'OWNER_SUPPORT_UNAVAILABLE',expose:true});return create({user_id:userId,sender_id:userId,body})}
module.exports={listForUser,findForUser,listAll,create,firstOwner,createFromUser};
