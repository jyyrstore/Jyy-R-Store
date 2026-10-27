const {query}=require('../../config/database');

async function run(){
  await query(
    `update deposits d
     set status='EXPIRED',updated_at=now()
     where d.status='PENDING'
       and d.expires_at is not null
       and d.expires_at < now()
       and not exists(
         select 1
         from payments p
         where p.id=d.payment_id
           and p.status in ('PENDING','PAID')
       )`
  );
}

module.exports={run};
