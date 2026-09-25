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
  return (
    await query(
      'select c.id,coalesce(json_agg(json_build_object(\'id\',ci.id,\'quantity\',ci.quantity,\'product_id\',p.id,\'name\',p.name,\'slug\',p.slug,\'price\',p.price,\'stock\',p.stock,\'thumbnail_path\',p.thumbnail_path)) filter(where ci.id is not null),\'[]\') items from carts c left join cart_items ci on ci.cart_id=c.id left join products p on p.id=ci.product_id where c.user_id=$1 group by c.id',
      [userId]
    )
  ).rows[0]||{items:[]};
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

  if(client){
    await client.query(sql,[userId]);
    return;
  }

  await query(sql,[userId]);
}

module.exports={ensure,get,upsertItem,setItem,removeItem,clear};
