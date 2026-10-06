const { query } = require('../config/database');
const { badRequest } = require('../utils/error');

async function ensure(userId){
  return (
    await query(
      'insert into carts(user_id) values($1) on conflict(user_id) do update set updated_at=now() returning *',
      [userId]
    )
  ).rows[0];
}

async function get(userId){
  await query(
    "delete from cart_items ci using carts c, products p where ci.cart_id=c.id and ci.product_id=p.id and c.user_id=$1 and p.status<>'PUBLISHED'",
    [userId]
  );

  const row=(
    await query(
      'select c.id,coalesce(c.recipient_email,(select rc.recipient_email from recipient_contacts rc where rc.user_id=c.user_id and rc.is_default=true order by rc.updated_at desc limit 1)) as recipient_email,coalesce(c.recipient_country_code,(select rc.recipient_country_code from recipient_contacts rc where rc.user_id=c.user_id and rc.is_default=true order by rc.updated_at desc limit 1)) as recipient_country_code,coalesce(c.recipient_dial_code,(select rc.recipient_dial_code from recipient_contacts rc where rc.user_id=c.user_id and rc.is_default=true order by rc.updated_at desc limit 1)) as recipient_dial_code,coalesce(c.recipient_phone,(select rc.recipient_phone from recipient_contacts rc where rc.user_id=c.user_id and rc.is_default=true order by rc.updated_at desc limit 1)) as recipient_phone,coalesce(json_agg(json_build_object(\'id\',ci.id,\'quantity\',ci.quantity,\'product_id\',p.id,\'name\',p.name,\'slug\',p.slug,\'price\',p.price,\'stock\',p.stock,\'thumbnail_path\',p.thumbnail_path)) filter(where ci.id is not null),\'[]\') items from carts c left join cart_items ci on ci.cart_id=c.id left join products p on p.id=ci.product_id where c.user_id=$1 group by c.id',
      [userId]
    )
  ).rows[0];

  return row||{items:[]};
}

async function setContact(userId,contact){
  const c=await ensure(userId);

  return (
    await query(
      'update carts set recipient_email=$2,recipient_country_code=$3,recipient_dial_code=$4,recipient_phone=$5,updated_at=now() where id=$1 returning *',
      [
        c.id,
        contact.email,
        contact.countryCode,
        contact.dialCode,
        contact.phone
      ]
    )
  ).rows[0];
}

async function upsertItem(userId,productId,quantity){
  const c=await ensure(userId);

  const row=(
    await query(
      'insert into cart_items(cart_id,product_id,quantity) values($1,$2,$3) on conflict(cart_id,product_id) do update set quantity=cart_items.quantity+excluded.quantity,updated_at=now() where cart_items.quantity+excluded.quantity<=100 returning *',
      [c.id,productId,quantity]
    )
  ).rows[0];

  if(!row){
    throw badRequest(
      'CART_QUANTITY_LIMIT',
      'Jumlah produk dalam keranjang maksimal 100.'
    );
  }

  return row;
}

async function setItem(userId,itemId,quantity){
  return (
    await query(
      'update cart_items ci set quantity=$3,updated_at=now() from carts c where ci.id=$2 and ci.cart_id=c.id and c.user_id=$1 returning ci.*',
      [userId,itemId,quantity]
    )
  ).rows[0];
}

async function removeItem(userId,itemId){
  await query(
    'delete from cart_items ci using carts c where ci.id=$2 and ci.cart_id=c.id and c.user_id=$1',
    [userId,itemId]
  );
}

async function clear(userId,client=null){
  const sql=
    'delete from cart_items ci using carts c where ci.cart_id=c.id and c.user_id=$1';

  const clearContact=
    'update carts set recipient_email=null,recipient_country_code=null,recipient_dial_code=null,recipient_phone=null,updated_at=now() where user_id=$1';

  if(client){
    await client.query(sql,[userId]);
    await client.query(clearContact,[userId]);
    return;
  }

  await query(sql,[userId]);
  await query(clearContact,[userId]);
}


async function saveDefaultRecipientContact(userId,contact){
  await query(
    'update public.recipient_contacts set is_default=false,updated_at=now() where user_id=$1 and is_default=true',
    [userId]
  );

  const result=await query(
    `insert into public.recipient_contacts
      (user_id,label,recipient_email,recipient_country_code,recipient_dial_code,recipient_phone,is_default,created_at,updated_at)
     values
      ($1,'Utama',$2,$3,$4,$5,true,now(),now())
     on conflict (user_id,label) do update set
       recipient_email=excluded.recipient_email,
       recipient_country_code=excluded.recipient_country_code,
       recipient_dial_code=excluded.recipient_dial_code,
       recipient_phone=excluded.recipient_phone,
       is_default=true,
       updated_at=now()
     returning *`,
    [
      userId,
      contact.email,
      contact.countryCode,
      contact.dialCode,
      contact.phone
    ]
  );

  return result.rows[0]||null;
}

module.exports={ensure,get,setContact,upsertItem,setItem,removeItem,clear,
  saveDefaultRecipientContact,
};
