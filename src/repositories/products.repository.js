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
function filters({
  search='',
  category='',
  sort='newest',
  minPrice=null,
  maxPrice=null,
  status='PUBLISHED'
}){
  const safePrice=value=>{
    if(value===null||value===undefined||value==='')return null;

    const n=Number(value);

    if(!Number.isSafeInteger(n)||n<0){
      throw badRequest(
        'INVALID_PRICE_FILTER',
        'Filter harga harus berupa bilangan bulat >= 0.'
      );
    }

    return n;
  };

  const safeMin=safePrice(minPrice);
  const safeMax=safePrice(maxPrice);

  if(
    safeMin!==null &&
    safeMax!==null &&
    safeMin>safeMax
  ){
    throw badRequest(
      'INVALID_PRICE_RANGE',
      'minPrice tidak boleh lebih besar dari maxPrice.'
    );
  }

  const args=[
    status,
    search||'',
    category||'',
    safeMin,
    safeMax
  ];

  let order='p.created_at desc';

  if(sort==='popular'){
    order='p.purchase_count desc,p.created_at desc';
  }

  if(sort==='price_asc'){
    order="case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end asc,p.created_at desc";
  }

  if(sort==='price_desc'){
    order="case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end desc,p.created_at desc";
  }

  return {
    args,
    where:`p.status=$1 and ($2='' or p.name ilike '%'||$2||'%' or p.description ilike '%'||$2||'%') and ($3='' or c.slug=$3) and ($4::numeric is null or (case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end) >= $4::numeric) and ($5::numeric is null or (case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end) <= $5::numeric)`,
    order
  };
}
async function list(opts={}){
  const f=filters(opts);
  const limit=safeIntRange(opts.limit,20,1,100);
  const offset=safeIntRange(opts.offset,0,0,1000000);
  const sql=`select p.*,case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end as price,case when p.pricing_mode='VARIANT' then coalesce((select sum(greatest(pv.stock-pv.reserved_stock,0)) from product_variants pv where pv.product_id=p.id and pv.is_active=true),0) else greatest(p.stock-p.reserved_stock,0) end as stock,c.name category_name,c.slug category_slug from products p left join categories c on c.id=p.category_id where ${f.where} order by ${f.order} limit ${limit} offset ${offset}`;
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
    order="case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end asc,p.created_at desc";
  }

  if(sort==='price_desc'){
    order="case when p.pricing_mode='VARIANT' then coalesce((select min(pv.price) from product_variants pv where pv.product_id=p.id and pv.is_active=true),p.price) else p.price end desc,p.created_at desc";
  }

  const lim=safeIntRange(limit,100,1,100);
  const off=safeIntRange(offset,0,0,1000000);

  args.push(lim);
  args.push(off);

  return (
    await query(
      `select
         p.*,
         case when p.pricing_mode='VARIANT'
           then coalesce((select sum(greatest(pv.stock-pv.reserved_stock,0)) from product_variants pv where pv.product_id=p.id and pv.is_active=true),0)
           else p.stock
         end as stock,
         c.name category_name,
         c.slug category_slug,
         coalesce((select json_agg(json_build_object('id',pv.id,'label',pv.label,'amount',pv.amount,'price',pv.price,'stock',pv.stock,'icon_path',pv.icon_path,'reserved_stock',pv.reserved_stock,'is_active',pv.is_active,'sort_order',pv.sort_order) order by pv.sort_order,pv.created_at) from product_variants pv where pv.product_id=p.id and pv.is_active=true),'[]'::json) variants,
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
async function create(data,client){ const c=client||require('../config/database').db(); return (await c.query('insert into products(category_id,name,slug,description,price,stock,thumbnail_path,status,pricing_mode) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[data.category_id||null,data.name,data.slug,data.description||'',data.price,data.stock,data.thumbnail_path||null,data.status||'DRAFT',data.pricing_mode||'FIXED'])).rows[0]; }
async function update(id,data,client){ const c=client||require('../config/database').db(); const allowed=['category_id','name','slug','description','price','stock','thumbnail_path','status','pricing_mode']; const keys=allowed.filter(k=>Object.prototype.hasOwnProperty.call(data,k)); if(!keys.length) return findById(id); const sql=`update products set ${keys.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=now() where id=$1 returning *`; return (await c.query(sql,[id,...keys.map(k=>data[k])])).rows[0]; }
async function remove(id){ return (await query("update products set status='ARCHIVED',updated_at=now() where id=$1 returning *",[id])).rows[0]; }
async function deletePermanently(id){
  return withTransaction(async(client)=>{
    const current=(await client.query(
      'select * from products where id=$1 for update',
      [id]
    )).rows[0];

    if(!current)return null;

    if(current.status!=='ARCHIVED'){
      throw Object.assign(
        new Error('Produk harus diarsipkan sebelum dihapus permanen.'),
        {
          status:409,
          code:'PRODUCT_NOT_ARCHIVED',
          expose:true
        }
      );
    }

    const refs=(await client.query(
      `select
         exists(
           select 1 from order_items where product_id=$1
         ) as has_order_items,
         exists(
           select 1 from entitlements where product_id=$1
         ) as has_entitlements,
         exists(
           select 1
           from download_logs dl
           join product_contents pc on pc.id=dl.content_id
           where pc.product_id=$1
         ) as has_download_logs`,
      [id]
    )).rows[0];

    if(
      refs.has_order_items ||
      refs.has_entitlements ||
      refs.has_download_logs
    ){
      throw Object.assign(
        new Error(
          'Produk memiliki riwayat transaksi atau unduhan dan tidak dapat dihapus permanen agar data transaksi tetap aman.'
        ),
        {
          status:409,
          code:'PRODUCT_HAS_HISTORY',
          expose:true
        }
      );
    }

    const contents=(await client.query(
      'select distinct storage_path from product_contents where product_id=$1 and storage_path is not null',
      [id]
    )).rows;

    const variantIcons=(await client.query(
      'select distinct icon_path from product_variants where product_id=$1 and icon_path is not null',
      [id]
    )).rows;

    await client.query(
      'delete from cart_items where product_id=$1',
      [id]
    );

    const deleted=(await client.query(
      "delete from products where id=$1 and status='ARCHIVED' returning *",
      [id]
    )).rows[0];

    if(!deleted)return null;

    return {product:deleted,contents,variantIcons};
  });
}
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
      'insert into products(category_id,name,slug,description,price,stock,thumbnail_path,status,pricing_mode) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',
      [
        p.category_id,
        p.name+' Copy',
        slug,
        p.description,
        p.price,
        p.stock,
        null,
        'DRAFT',
        p.pricing_mode||'FIXED'
      ]
    )).rows[0];

      const variantMap=new Map();
      const sourceVariantIcons=[];
      if(p.pricing_mode==='VARIANT'){
        const sourceVariants=(await client.query(
          'select id,label,amount,price,stock,sort_order,icon_path from product_variants where product_id=$1 and is_active=true order by sort_order,created_at',
          [id]
        )).rows;

        for(const v of sourceVariants){
          const copiedVariant=(await client.query(
            'insert into product_variants(product_id,label,amount,price,stock,sort_order,is_active) values($1,$2,$3,$4,$5,$6,true) returning id',
            [copy.id,v.label,v.amount,v.price,v.stock,v.sort_order]
          )).rows[0];

          variantMap.set(String(v.id),String(copiedVariant.id));
          if(v.icon_path){
            sourceVariantIcons.push({
              variantId:copiedVariant.id,
              iconPath:v.icon_path
            });
          }
        }
      }

      const env=loadEnv();
      const createdObjects=[];

    try{
      let thumbnailPath=null;

      if(p.thumbnail_path){
        const sourcePath=String(p.thumbnail_path);
        const sourceObjectPath=storage.publicObjectPath(sourcePath);
        const ext=(sourceObjectPath.match(/\.[a-z0-9]+$/i)||[''])[0];

        thumbnailPath=
          `products/${copy.id}/${crypto.randomUUID()}${ext}`;

        await storage.copy(
          env.PUBLIC_ASSET_BUCKET,
          sourceObjectPath,
          thumbnailPath
        );

        createdObjects.push({
          bucket:env.PUBLIC_ASSET_BUCKET,
          path:thumbnailPath
        });
      }

      for(const sourceIcon of sourceVariantIcons){
        const sourceObjectPath=storage.publicObjectPath(sourceIcon.iconPath);
        const extension=(sourceObjectPath.match(/\.[a-z0-9]+$/i)||[''])[0];
        const destinationObjectPath=
          `products/${copy.id}/${crypto.randomUUID()}${extension}`;

        await storage.copy(
          env.PUBLIC_ASSET_BUCKET,
          sourceObjectPath,
          destinationObjectPath
        );

        createdObjects.push({
          bucket:env.PUBLIC_ASSET_BUCKET,
          path:destinationObjectPath
        });

        await client.query(
          'update product_variants set icon_path=$2,updated_at=now() where id=$1',
          [sourceIcon.variantId,destinationObjectPath]
        );
      }

      const contents=(await client.query(
        'select * from product_contents where product_id=$1 order by sort_order',
        [id]
      )).rows;

      for(const c of contents){
        // A copied product has new variant IDs. Never turn content tied
        // to a retired variant into shared content by accident.
        if(c.variant_id&&!variantMap.has(String(c.variant_id))){
          continue;
        }

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
          'insert into product_contents(product_id,variant_id,type,title,description,text_content,url,storage_path,mime_type,file_size,sort_order,is_preview,access_type) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
          [
            copy.id,
            c.variant_id ? variantMap.get(String(c.variant_id)) : null,
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

async function listVariants(productId,activeOnly=true){
  return (await query(
    `select id,product_id,label,amount,price,stock,icon_path,reserved_stock,is_active,sort_order,created_at,updated_at
     from product_variants where product_id=$1 ${activeOnly?"and is_active=true":""}
     order by sort_order,created_at,id`,[productId]
  )).rows;
}
async function findVariant(productId,variantId){
  return (await query('select * from product_variants where product_id=$1 and id=$2 and is_active=true',[productId,variantId])).rows[0]||null;
}
async function updateVariantIcon(productId,variantId,iconPath){
  return withTransaction(async(client)=>{
    const current=(await client.query(
      'select icon_path from product_variants where product_id=$1 and id=$2 and is_active=true for update',
      [productId,variantId]
    )).rows[0];

    if(!current)return null;

    const variant=(await client.query(
      'update product_variants set icon_path=$3,updated_at=now() where product_id=$1 and id=$2 and is_active=true returning id,product_id,label,icon_path',
      [productId,variantId,iconPath]
    )).rows[0];

    return variant?{
      variant,
      previousIconPath:current.icon_path||null
    }:null;
  });
}
async function hasReservedVariants(productId){
  return Boolean((await query('select 1 from product_variants where product_id=$1 and reserved_stock>0 limit 1',[productId])).rowCount);
}
async function saveVariants(productId,variants){
  if(!Array.isArray(variants)||variants.length>100) throw badRequest('INVALID_PRODUCT_VARIANTS','Daftar variasi tidak valid.');
  const labels=new Set();
  for(const [index,v] of variants.entries()){
    const label=String(v?.label||'').trim();
    const price=Number(v?.price),stock=Number(v?.stock),amount=v?.amount==null||v?.amount===''?null:Number(v.amount);
    if(!label||label.length>120||!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(stock)||stock<0||(amount!==null&&(!Number.isSafeInteger(amount)||amount<=0))) throw badRequest('INVALID_PRODUCT_VARIANT',`Variasi nomor ${index+1} tidak valid.`);
    const key=label.toLocaleLowerCase('id-ID');
    if(labels.has(key)) throw badRequest('DUPLICATE_PRODUCT_VARIANT','Nama variasi tidak boleh duplikat.');
    labels.add(key);
  }
  return withTransaction(async(client)=>{
    const product=(await client.query('select id,pricing_mode from products where id=$1 for update',[productId])).rows[0];
    if(!product) throw badRequest('PRODUCT_NOT_FOUND','Produk tidak ditemukan.');
    if(variants.length&&product.pricing_mode!=='VARIANT') throw badRequest('PRODUCT_NOT_VARIANT','Aktifkan mode VARIANT sebelum menyimpan variasi.');
    const active=(await client.query(
      'select id,product_id,label,amount,price,stock,icon_path,reserved_stock,is_active,sort_order,created_at,updated_at from product_variants where product_id=$1 and is_active=true order by sort_order,created_at,id',[productId]
    )).rows;
    const activeById=new Map(active.map(row=>[String(row.id),row]));
    const unchanged=active.length===variants.length && active.every((row,index)=>{
      const variant=variants[index];
      const label=String(variant.label).trim();
      const amount=variant.amount==null||variant.amount===''?null:Number(variant.amount);
      const sortOrder=Number.isSafeInteger(Number(variant.sort_order))&&Number(variant.sort_order)>=0?Number(variant.sort_order):index;
      return row.label===label &&
        (row.amount==null?null:Number(row.amount))===amount &&
        Number(row.price)===Number(variant.price) &&
        Number(row.stock)===Number(variant.stock) &&
        Number(row.sort_order)===sortOrder;
    });
    if(unchanged) return active;
    const pending=(await client.query('select 1 from product_variants where product_id=$1 and reserved_stock>0 limit 1',[productId])).rowCount;
    if(pending) throw badRequest('PRODUCT_VARIANT_RESERVED','Variasi tidak dapat diubah selama stok sedang direservasi oleh pembayaran pending.');

    // Reuse the current ID when the variant label is unchanged. This keeps
    // content assignments and existing order references attached to the
    // same logical variant when only price, stock, or order changes.
    const activeByLabel=new Map(
      active.map(row=>[
        String(row.label).toLocaleLowerCase('id-ID'),
        row
      ])
    );

    await client.query(
      'update product_variants set is_active=false,updated_at=now() where product_id=$1 and is_active=true',
      [productId]
    );
    await client.query(
      'delete from cart_items where product_id=$1 and variant_id is not null',
      [productId]
    );

    for(const [index,v] of variants.entries()){
      const label=String(v.label).trim();
      const amount=v.amount==null||v.amount===''?null:Number(v.amount);
      const sortOrder=Number.isSafeInteger(Number(v.sort_order))&&Number(v.sort_order)>=0?Number(v.sort_order):index;
      const existing=activeByLabel.get(label.toLocaleLowerCase('id-ID'));
      const sourceVariant=activeById.get(String(v.icon_source_id||''));

      if(existing){
        await client.query(
          `update product_variants
           set label=$2,amount=$3,price=$4,stock=$5,
               is_active=true,sort_order=$6,updated_at=now()
           where id=$1 and product_id=$7`,
          [
            existing.id,
            label,
            amount,
            Number(v.price),
            Number(v.stock),
            sortOrder,
            productId
          ]
        );
      }else{
        await client.query(
          'insert into product_variants(product_id,label,amount,price,stock,reserved_stock,is_active,sort_order,icon_path) values($1,$2,$3,$4,$5,0,true,$6,$7)',
          [
            productId,
            label,
            amount,
            Number(v.price),
            Number(v.stock),
            sortOrder,
            sourceVariant?.icon_path||null
          ]
        );
      }
    }

    return (await client.query(
      'select id,product_id,label,amount,price,stock,icon_path,reserved_stock,is_active,sort_order,created_at,updated_at from product_variants where product_id=$1 and is_active=true order by sort_order,created_at,id',
      [productId]
    )).rows;
  });
}

async function contents(productId,options={}){
  const forOrder=options.forOrder===true;
  const args=[productId];
  const scope=forOrder
    ? 'and (pc.variant_id is null or pc.variant_id=$2)'
    : '';

  if(forOrder) args.push(options.variantId||null);

  return (await query(
    `select pc.*,pv.label as variant_label,pv.is_active as variant_is_active
     from product_contents pc
     left join product_variants pv on pv.id=pc.variant_id
     where pc.product_id=$1 ${scope}
     order by pc.sort_order,pc.created_at`,
    args
  )).rows;
}

async function addContent(data){
  return (await query(
    'insert into product_contents(product_id,variant_id,type,title,description,text_content,url,storage_path,mime_type,file_size,sort_order,is_preview,access_type) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *',
    [
      data.product_id,
      data.variant_id||null,
      data.type,
      data.title,
      data.description||null,
      data.text_content||null,
      data.url||null,
      data.storage_path||null,
      data.mime_type||null,
      data.file_size||null,
      data.sort_order||0,
      !!data.is_preview,
      data.access_type||'PURCHASED'
    ]
  )).rows[0];
}
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

module.exports={list,adminList,count,findBySlug,findById,create,update,remove,deletePermanently,unpublish,duplicate,contents,addContent,updateContent,deleteContent,event,listVariants,findVariant,updateVariantIcon,hasReservedVariants,saveVariants,
  countAdmin
};
