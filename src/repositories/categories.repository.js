const {query,withTransaction}=require('../config/database');

async function list(activeOnly=true){
  return (await query(
    activeOnly
      ? 'select * from categories where is_active=true order by sort_order,name'
      : 'select * from categories order by sort_order,name'
  )).rows;
}

async function findBySlug(slug){
  return (await query(
    'select * from categories where slug=$1',
    [slug]
  )).rows[0]||null;
}

async function findById(id){
  return (await query(
    'select * from categories where id=$1',
    [id]
  )).rows[0]||null;
}

async function hasChildren(id){
  return Number((await query(
    'select count(*)::int count from categories where parent_id=$1',
    [id]
  )).rows[0].count)>0;
}

async function create(data){
  return (await query(
    'insert into categories(name,slug,description,sort_order,parent_id) values($1,$2,$3,$4,$5) returning *',
    [
      data.name,
      data.slug,
      data.description||null,
      data.sort_order||0,
      data.parent_id||null
    ]
  )).rows[0];
}

async function update(id,data){
  const allowed=[
    'name',
    'slug',
    'description',
    'sort_order',
    'is_active',
    'parent_id'
  ];

  const keys=allowed.filter(
    k=>Object.prototype.hasOwnProperty.call(data,k)
  );

  if(!keys.length)return findById(id);

  const values=[
    id,
    ...keys.map(k=>{
      if(k==='description')return data[k]||null;
      if(k==='sort_order')return data[k]??0;
      if(k==='is_active')return data[k]!==false;
      if(k==='parent_id')return data[k]||null;

      return data[k];
    })
  ];

  const sql=`update categories set ${
    keys.map((k,i)=>`${k}=$${i+2}`).join(',')
  } where id=$1 returning *`;

  return (await query(sql,values)).rows[0]||null;
}

async function createWithSubcategory(data){
  return withTransaction(async(client)=>{
    let parent=(await client.query(
      'select * from categories where name=$1 and parent_id is null for update',
      [data.name]
    )).rows[0]||null;

    if(!parent){
      parent=(await client.query(
        'insert into categories(name,slug,description,sort_order,parent_id,is_active) values($1,$2,$3,$4,null,$5) returning *',
        [
          data.name,
          data.slug,
          data.description||null,
          data.sort_order||0,
          data.is_active!==false
        ]
      )).rows[0];
    }

    return (await client.query(
      'insert into categories(name,slug,description,sort_order,parent_id,is_active) values($1,$2,$3,$4,$5,$6) returning *',
      [
        data.subcategory,
        data.subcategory_slug,
        data.description||null,
        data.sort_order||0,
        parent.id,
        data.is_active!==false
      ]
    )).rows[0];
  });
}

async function updateWithSubcategory(id,data){
  return withTransaction(async(client)=>{
    const parent=(await client.query(
      'select * from categories where id=$1 for update',
      [id]
    )).rows[0];

    if(!parent){
      throw Object.assign(
        new Error('Kategori tidak ditemukan.'),
        {status:404,code:'CATEGORY_NOT_FOUND',expose:true}
      );
    }

    const updatedParent=(await client.query(
      'update categories set name=$2,slug=$3,is_active=$4 where id=$1 returning *',
      [id,data.name,data.slug,data.is_active!==false]
    )).rows[0];

    return (await client.query(
      'insert into categories(name,slug,description,sort_order,parent_id,is_active) values($1,$2,$3,$4,$5,$6) returning *',
      [
        data.subcategory,
        data.subcategory_slug,
        data.description||null,
        data.sort_order||0,
        updatedParent.id,
        data.is_active!==false
      ]
    )).rows[0];
  });
}

async function updateHierarchy(parentId,childId,data){
  return withTransaction(async(client)=>{
    const parent=(await client.query(
      'select * from categories where id=$1 for update',
      [parentId]
    )).rows[0];

    if(!parent){
      throw Object.assign(
        new Error('Kategori induk tidak ditemukan.'),
        {status:404,code:'CATEGORY_PARENT_NOT_FOUND',expose:true}
      );
    }

    await client.query(
      'update categories set name=$2,slug=$3 where id=$1',
      [parentId,data.name,data.slug]
    );

    const child=(await client.query(
      'update categories set name=$2,slug=$3,is_active=$4 where id=$1 and parent_id=$5 returning *',
      [
        childId,
        data.subcategory,
        data.subcategory_slug,
        data.is_active!==false,
        parentId
      ]
    )).rows[0];

    if(!child){
      throw Object.assign(
        new Error('Subkategori tidak ditemukan pada kategori induk tersebut.'),
        {status:404,code:'CATEGORY_NOT_FOUND',expose:true}
      );
    }

    return child;
  });
}

async function remove(id){
  return (await query(
    'delete from categories where id=$1 returning *',
    [id]
  )).rows[0]||null;
}

module.exports={list,findBySlug,findById,hasChildren,create,update,createWithSubcategory,updateWithSubcategory,updateHierarchy,remove};
