const { query } = require('../config/database');
async function list(activeOnly=true){ return (await query(activeOnly?'select * from categories where is_active=true order by sort_order,name':'select * from categories order by sort_order,name')).rows; }
async function findBySlug(slug){ return (await query('select * from categories where slug=$1',[slug])).rows[0]||null; }
async function create(data){ return (await query('insert into categories(name,slug,description,sort_order) values($1,$2,$3,$4) returning *',[data.name,data.slug,data.description||null,data.sort_order||0])).rows[0]; }
async function update(id,data){ return (await query('update categories set name=$2,slug=$3,description=$4,sort_order=$5,is_active=$6 where id=$1 returning *',[id,data.name,data.slug,data.description||null,data.sort_order||0,data.is_active!==false])).rows[0]; }
module.exports={list,findBySlug,create,update};
