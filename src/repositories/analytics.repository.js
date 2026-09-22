const { query } = require('../config/database');
function periodRange(period='30d'){const now=new Date();if(period==='today'){const start=new Date(now);start.setHours(0,0,0,0);return [start,now];}const days={ '7d':7,'30d':30,'90d':90,'180d':180,'1y':365 };const d=days[period]||30;return [new Date(now.getTime()-d*24*60*60*1000),now];}
async function dashboard(){ const r=await query(`select json_build_object('users',(select count(*) from profiles where deleted_at is null),'orders',(select count(*) from orders),'revenue',(select coalesce(sum(total),0) from orders where status in ('PAID','PROCESSING','COMPLETED')),'deposit',(select coalesce(sum(amount),0) from deposits where status='SUCCESS'),'products',(select count(*) from products where status!='ARCHIVED'),'tickets',(select count(*) from tickets where status!='CLOSED'),'ordersToday',(select count(*) from orders where created_at::date=current_date),'revenueToday',(select coalesce(sum(total),0) from orders where created_at::date=current_date and status in ('PAID','PROCESSING','COMPLETED')),'depositToday',(select coalesce(sum(amount),0) from deposits where created_at::date=current_date and status='SUCCESS'),'newUsersToday',(select count(*) from profiles where created_at::date=current_date)) as data`); return r.rows[0].data; }
async function periodAnalytics(from,to){ const [daily,status,top]=await Promise.all([
  query(`with days as (select generate_series(date_trunc('day',$1::timestamptz),date_trunc('day',$2::timestamptz),interval '1 day') as day)
    select d.day::date AS day,
      coalesce(count(o.id) filter(where o.status in ('PAID','PROCESSING','COMPLETED')),0)::int completed_orders,
      coalesce(sum(o.total) filter(where o.status in ('PAID','PROCESSING','COMPLETED')),0) revenue,
      count(o.id)::int orders,
      coalesce((select sum(dep.amount) from deposits dep where dep.created_at >= d.day and dep.created_at < d.day + interval '1 day' and dep.status='SUCCESS'),0) deposit,
      coalesce((select count(*) from profiles pr where pr.created_at >= d.day and pr.created_at < d.day + interval '1 day'),0)::int new_users
    from days d left join orders o on o.created_at >= d.day and o.created_at < d.day + interval '1 day'
    group by d.day order by d.day`,[from,to]),
  query(`select status,count(*)::int count from orders where created_at >= $1 and created_at < $2 group by status order by count desc`,[from,to]),
  query(`select p.id,p.name,p.price,p.purchase_count,p.view_count,p.cart_add_count from products p order by p.purchase_count desc limit 10`).catch(()=>({rows:[]}))
]); return {daily:daily.rows,status:status.rows,top:top.rows}; }
module.exports={dashboard,periodAnalytics,periodRange};
