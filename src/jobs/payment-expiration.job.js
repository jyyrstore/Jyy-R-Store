const {query,withTransaction}=require('../config/database');
async function run(){
  const expired=(await query("select id,order_id from payments where status='PENDING' and expires_at is not null and expires_at < now() limit 500")).rows;
  for(const payment of expired){
    await withTransaction(async(client)=>{
      const current=(await client.query('select * from payments where id=$1 for update',[payment.id])).rows[0];
      if(!current||current.status!=='PENDING') return;
      await client.query("update payments set status='EXPIRED',updated_at=now() where id=$1",[payment.id]);
      if(current.order_id){
        const order=(await client.query('select * from orders where id=$1 for update',[current.order_id])).rows[0];
        if(order&&order.status==='PENDING'){
          await client.query("update orders set status='EXPIRED',updated_at=now() where id=$1",[order.id]);
          const items=(await client.query('select product_id,quantity from order_items where order_id=$1',[order.id])).rows;
          for(const item of items) await client.query('update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',[item.product_id,item.quantity]);
        }
      }
    });
  }
  /*
   * Safety net for the tiny window between the gateway order transaction
   * and creation of its local payment placeholder.
   */
  const orphanOrders=(
    await query(
      `select o.id
       from orders o
       where o.payment_method='GATEWAY'
         and o.status='PENDING'
         and o.created_at < now()-interval '30 minutes'
         and not exists(
           select 1
           from payments p
           where p.order_id=o.id
             and p.status in ('PENDING','PAID')
         )
       limit 500`
    )
  ).rows;

  for(const item of orphanOrders){
    await withTransaction(async(client)=>{
      const order=(
        await client.query(
          'select * from orders where id=$1 for update',
          [item.id]
        )
      ).rows[0];

      if(
        !order||
        order.payment_method!=='GATEWAY'||
        order.status!=='PENDING'
      ){
        return;
      }

      const activePayment=(
        await client.query(
          "select 1 from payments where order_id=$1 and status in ('PENDING','PAID') limit 1",
          [order.id]
        )
      ).rowCount;

      if(activePayment){
        return;
      }

      const items=(
        await client.query(
          'select product_id,quantity from order_items where order_id=$1',
          [order.id]
        )
      ).rows;

      for(const item of items){
        await client.query(
          'update products set reserved_stock=greatest(reserved_stock-$2,0),updated_at=now() where id=$1',
          [item.product_id,item.quantity]
        );
      }

      await client.query(
        "update orders set status='EXPIRED',updated_at=now() where id=$1",
        [order.id]
      );
    });
  }

  return {
    expired:expired.length,
    orphanOrdersExpired:orphanOrders.length
  };
}
module.exports={run};
