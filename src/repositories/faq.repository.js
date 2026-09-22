const { query }=require('../config/database');
async function listPublic(){return (await query("select * from faqs where is_published=true order by sort_order,created_at desc")).rows}
async function listAll(){return (await query('select * from faqs order by sort_order,created_at desc')).rows}
async function create(d){return (await query('insert into faqs(category,question,answer,is_published,sort_order) values($1,$2,$3,$4,$5) returning *',[d.category,d.question,d.answer,d.is_published!==false,d.sort_order||0])).rows[0]}
async function update(id,d){return (await query('update faqs set category=$2,question=$3,answer=$4,is_published=$5,sort_order=$6,updated_at=now() where id=$1 returning *',[id,d.category,d.question,d.answer,d.is_published!==false,d.sort_order||0])).rows[0]}
async function remove(id){return (await query('delete from faqs where id=$1 returning *',[id])).rows[0]}
module.exports={listPublic,listAll,create,update,remove};
