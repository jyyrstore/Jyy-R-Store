const { query, withTransaction } = require('../config/database');
const crypto = require('crypto');
const storage = require('../config/storage');
const { loadEnv } = require('../config/env');
const { badRequest } = require('../utils/error');

const PRODUCT_EVENT_TYPES=new Set([
  'VIEW',
  'CART_ADD',
  'PURCHASE'
]);

function safeIntRange(value,fallback,min=0,max=1000000){
  const n=Number(value);
  if(!Number.isSafeInteger(n)) return fallback;
  return Math.max(min,Math.min(max,n));
}
function filters({search='',category='',sort='newest',minPrice=null,maxPrice=null,status='PUBLISHED'}){ const args=[status,search||'',category||'',minPrice==null?null:Number(minPrice),maxPrice==null?null:Number(maxPrice)]; let order='p.created_at desc'; if(sort==='popular') order='p.purchase_count desc,p.created_at desc'; if(sort==='price_asc') order='p.price asc,p.created_at desc'; if(sort==='price_desc') order='p.price desc,p.created_at desc'; return {args,where:`p.status=$1 and ($2='' or p.name ilike '%'||$2||'%' or p.description ilike '%'||$2||'%') and ($3='' or c.slug=$3) and ($4::numeric is null or p.price >= $4::numeric) and ($5::numeric is null or p.price <= $5::numeric)`,order}; }
async function list(opts={}){
  const f=filters(opts);
  const limit=safeIntRange(opts.limit,20,1,100);
  const offset=safeIntRange(opts.offset,0,0,1000000);
  const sql=`select p.*,c.name category_name,c.slug category_slug from products p left join categories c on c.id=p.category_id where ${f.where} order by ${f.order} limit ${limit} offset ${offset}`;
  return (await query(sql,f.args)).rows;
}
async function adminList({
  search='',
  status='',
  sort='newest',
  limit=100,
  offset=0
}={}){
  let where=[];
  let args=[];

  if(search){
    args.push(`%${search}%`);
    where.push(
      `(p.name ilike $${args.length} or p.slug ilike $${args.length})`
    );
  }

  if(status){
    args.push(status);
    where.push(`p.status=$${args.length}`);
  }else{
    where.push(`p.status <> 'ARCHIVED'`);
  }

  let order='p.created_at desc';

  if(sort==='popular'){
    order='p.purchase_count desc,p.created_at desc';
  }

  if(sort==='price_asc'){
    order='p.price asc,p.created_at desc';
  }

  if(sort==='price_desc'){
    order='p.price desc,p.created_at desc';
  }

  const lim=safeIntRange(limit,100,1,100);
  const off=safeIntRange(offset,0,0,1000000);

  args.push(lim);
  args.push(off);

  return (
    await query(
      `select
         p.*,
         c.name category_name,
         c.slug category_slug,
         coalesce(
           (
             select count(*)
             from product_contents pc
             where pc.product_id=p.id
           ),
           0
         )::int content_count
       from products p
       left join categories c on c.id=p.category_id
       where ${where.join(' and ')}
       order by ${order}
       limit $${args.length-1}
       offset $${args.length}`,
      args
    )
  ).rows;
}

async function count(opts={}){ const f=filters(opts); return Number((await query(`select count(*)::int count from products p left join categories c on c.id=p.category_id where ${f.where}`,f.args)).rows[0].count); }
async function findBySlug(slug){ return (await query(`select p.*,c.name category_name,c.slug category_slug from products p left join categories c on c.id=p.category_id where p.slug=$1`,[slug])).rows[0]||null; }
async function findById(id){ return (await query('select p.*,c.name category_name,c.slug category_slug from products p left join categories c on c.id=p.category_id where p.id=$1',[id])).rows[0]||null; }
async function create(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into products(category_id,name,slug,description,price,stock,thumbnail_path,status) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[data.category_id||null,data.name,data.slug,data.description||'',data.price,data.stock,data.thumbnail_path||null,data.status||'DRAFT'])).rows[0]; }
async function update(id,data,client){ const c=client||require('../config/database').db(); const allowed=['category_id','name','slug','description','price','stock','thumbnail_path','status']; const keys=allowed.filter(k=>Object.prototype.hasOwnProperty.call(data,k)); if(!keys.length) return findById(id); const sql=`update products set ${keys.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=now() where id=$1 returning *`; return (await c.query(sql,[id,...keys.map(k=>data[k])])).rows[0]; }
async function remove(id){ return (await query("update products set status='ARCHIVED',updated_at=now() where id=$1 returning *",[id])).rows[0]; }
async function unpublish(id){ return update(id,{status:'DRAFT'}); }
async function duplicate(id){
  // JYYR_STORAGE_DUPLICATE_V2
  return withTransaction(async(client)=>{
    const p=(await client.query(
      'select * from products where id=$1',
      [id]
    )).rows[0];

    if(!p) return null;

    const base=p.slug+'-copy';
    let slug=base;
    let n=2;

    while(
      (await client.query(
        'select 1 from products where slug=$1',
        [slug]
      )).rowCount
    ){
      slug=`${base}-${n++}`;
    }

    const copy=(await client.query(
      'insert into products(category_id,name,slug,description,price,stock,thumbnail_path,status) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',
      [
        p.category_id,
        p.name+' Copy',
        slug,
        p.description,
        p.price,
        p.stock,
        null,
        'DRAFT'
      ]
    )).rows[0];

    const env=loadEnv();
    const createdObjects=[];

    try{
      let thumbnailPath=null;

      if(p.thumbnail_path){
        const ext=(String(p.thumbnail_path).match(/\.[a-z0-9]+$/i)||[''])[0];

        thumbnailPath=
          `products/${copy.id}/${crypto.randomUUID()}${ext}`;

        await storage.copy(
          env.PUBLIC_ASSET_BUCKET,
          p.thumbnail_path,
          thumbnailPath
        );

        createdObjects.push({
          bucket:env.PUBLIC_ASSET_BUCKET,
          path:thumbnailPath
        });
      }

      const contents=(await client.query(
        'select * from product_contents where product_id=$1 order by sort_order',
        [id]
      )).rows;

      for(const c of contents){
        let storagePath=null;

        if(c.storage_path){
          const sourcePath=String(c.storage_path);
          const legacyPublic=sourcePath.startsWith('public-assets/');

          const sourceBucket=legacyPublic
            ? env.PUBLIC_ASSET_BUCKET
            : env.PRIVATE_PRODUCT_BUCKET;

          const sourceObjectPath=legacyPublic
            ? sourcePath.replace(/^public-assets\//,'')
            : sourcePath;

          const ext=(String(c.storage_path).match(/\.[a-z0-9]+$/i)||[''])[0];

          const destinationObjectPath=
            `products/${copy.id}/${crypto.randomUUID()}${ext}`;

          const destinationBucket=legacyPublic
            ? env.PUBLIC_ASSET_BUCKET
            : env.PRIVATE_PRODUCT_BUCKET;

          storagePath=legacyPublic
            ? `public-assets/${destinationObjectPath}`
            : destinationObjectPath;

          await storage.copy(
            sourceBucket,
            sourceObjectPath,
            destinationObjectPath
          );

          createdObjects.push({
            bucket:destinationBucket,
            path:destinationObjectPath
          });
        }

        await client.query(
          'insert into product_contents(product_id,type,title,description,text_content,url,storage_path,mime_type,file_size,sort_order,is_preview,access_type) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [
            copy.id,
            c.type,
            c.title,
            c.description,
            c.text_content,
            c.url,
            storagePath,
            c.mime_type,
            c.file_size,
            c.sort_order,
            c.is_preview,
            c.access_type
          ]
        );
      }

      const finalProduct=(await client.query(
        'update products set thumbnail_path=$2,updated_at=now() where id=$1 returning *',
        [copy.id,thumbnailPath]
      )).rows[0];

      return finalProduct;

    }catch(error){

      for(const item of createdObjects){
        await storage.remove(
          item.bucket,
          item.path
        ).catch(()=>{});
      }

      throw error;
    }
  });
}
async function contents(productId){ return (await query('select * from product_contents where product_id=$1 order by sort_order,created_at',[productId])).rows; }
async function addContent(data){ return (await query('insert into product_contents(product_id,type,title,description,text_content,url,storage_path,mime_type,file_size,sort_order,is_preview,access_type) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *',[data.product_id,data.type,data.title,data.description||null,data.text_content||null,data.url||null,data.storage_path||null,data.mime_type||null,data.file_size||null,data.sort_order||0,!!data.is_preview,data.access_type||'PURCHASED'])).rows[0]; }
async function updateContent(id,data){ return (await query('update product_contents set title=$2,description=$3,text_content=$4,url=$5,sort_order=$6,is_preview=$7,access_type=$8,updated_at=now() where id=$1 returning *',[id,data.title,data.description||null,data.text_content||null,data.url||null,data.sort_order||0,!!data.is_preview,data.access_type||'PURCHASED'])).rows[0]; }
async function deleteContent(id,productId=null){
  if(productId){
    const row=(await query(
      'delete from product_contents where id=$1 and product_id=$2 returning *',
      [id,productId]
    )).rows[0];
    return row||null;
  }

  const row=(await query(
    'delete from product_contents where id=$1 returning *',
    [id]
  )).rows[0];

  return row||null;
}
async function event(productId,userId,type){
  const normalized=String(type||'').toUpperCase();

  if(!PRODUCT_EVENT_TYPES.has(normalized)){
    throw badRequest(
      'INVALID_PRODUCT_EVENT',
      'Jenis event produk tidak valid.'
    );
  }

  await query(
    'insert into product_events(product_id,user_id,event_type) values($1,$2,$3)',
    [productId,userId||null,normalized]
  );

  const expression=
    normalized==='VIEW'
      ?'view_count=view_count+1'
      :normalized==='CART_ADD'
        ?'cart_add_count=cart_add_count+1'
        :'purchase_count=purchase_count+1';

  await query(
    `update products set ${expression} where id=$1`,
    [productId]
  );
}
async function countAdmin({
  search='',
  status=''
}={}){
  let where=[];
  let args=[];

  if(search){
    args.push(`%${search}%`);
    where.push(
      `(p.name ilike $${args.length} or p.slug ilike $${args.length})`
    );
  }

  if(status){
    args.push(status);
    where.push(`p.status=$${args.length}`);
  }else{
    where.push(`p.status <> 'ARCHIVED'`);
  }

  return Number(
    (
      await query(
        `select count(*)::int count
         from products p
         where ${where.join(' and ')}`,
        args
      )
    ).rows[0].count
  );
}

module.exports={list,adminList,count,findBySlug,findById,create,update,remove,unpublish,duplicate,contents,addContent,updateContent,deleteContent,event,
  countAdmin
};
