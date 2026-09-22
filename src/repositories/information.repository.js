const { query }=require('../config/database');
async function listPublic(){return (await query("select * from announcements where is_published=true and (publish_at is null or publish_at<=now()) and (unpublish_at is null or unpublish_at>now()) order by coalesce(publish_at,created_at) desc")).rows}
async function listAll(){return (await query('select * from announcements order by created_at desc')).rows}
async function create(d){return (await query('insert into announcements(type,title,body,is_published,publish_at,unpublish_at) values($1,$2,$3,$4,$5,$6) returning *',[d.type,d.title,d.body,d.is_published!==false,d.publish_at||null,d.unpublish_at||null])).rows[0]}
async function update(id,d){return (await query('update announcements set type=$2,title=$3,body=$4,is_published=$5,publish_at=$6,unpublish_at=$7,updated_at=now() where id=$1 returning *',[id,d.type,d.title,d.body,d.is_published!==false,d.publish_at||null,d.unpublish_at||null])).rows[0]}
async function remove(id){return (await query('delete from announcements where id=$1 returning *',[id])).rows[0]}
module.exports={listPublic,listAll,create,update,remove};
