const { query } = require('../config/database');
async function create(data){ return (await query("insert into tickets(ticket_number,user_id,category,subject,priority,status) values($1,$2,$3,$4,$5,'OPEN') returning *",[data.ticket_number,data.user_id,data.category,data.subject,data.priority||'NORMAL'])).rows[0]; }
async function addMessage(data){ return (await query('insert into ticket_messages(ticket_id,sender_id,body,attachment_path) values($1,$2,$3,$4) returning *',[data.ticket_id,data.sender_id,data.body,data.attachment_path||null])).rows[0]; }
async function listForUser(userId,options={}){
  const limit=Math.min(
    100,
    Math.max(1,Number(options.limit)||100)
  );

  const offset=Math.max(
    0,
    Number(options.offset)||0
  );

  return (
    await query(
      'select * from tickets where user_id=$1 order by updated_at desc limit $2 offset $3',
      [userId,limit,offset]
    )
  ).rows;
}

async function detail(id,userId=null){ const args=[id]; let userFilter=''; if(userId){args.push(userId);userFilter=' and t.user_id=$2'} const ticket=(await query(`select t.*,p.username,p.email from tickets t join profiles p on p.id=t.user_id where t.id=$1${userFilter}` ,args)).rows[0]; if(!ticket) return null; const msgs=(await query('select tm.*,p.username,p.role from ticket_messages tm join profiles p on p.id=tm.sender_id where tm.ticket_id=$1 order by tm.created_at',[id])).rows; return {...ticket,messages:msgs}; }
async function adminList(status,options={}){
  const args=[];
  let where='1=1';

  if(status){
    args.push(status);
    where='t.status=$1';
  }

  const limit=Math.min(
    100,
    Math.max(1,Number(options.limit)||100)
  );

  const offset=Math.max(
    0,
    Number(options.offset)||0
  );

  args.push(limit);
  args.push(offset);

  return (
    await query(
      `select
         t.*,
         p.username,
         p.email
       from tickets t
       join profiles p on p.id=t.user_id
       where ${where}
       order by t.updated_at desc
       limit $${args.length-1}
       offset $${args.length}`,
      args
    )
  ).rows;
}

async function setStatus(id,status){ return (await query('update tickets set status=$2,updated_at=now(),closed_at=case when $2=\'CLOSED\' then now() else null end where id=$1 returning *',[id,status])).rows[0]; }
async function countForUser(userId){
  return Number(
    (
      await query(
        'select count(*)::int count from tickets where user_id=$1',
        [userId]
      )
    ).rows[0].count
  );
}

async function countAdmin(status){
  const args=[];
  let where='1=1';

  if(status){
    args.push(status);
    where='t.status=$1';
  }

  return Number(
    (
      await query(
        `select count(*)::int count
         from tickets t
         join profiles p on p.id=t.user_id
         where ${where}`,
        args
      )
    ).rows[0].count
  );
}

module.exports={create,addMessage,listForUser,detail,adminList,setStatus,
  countForUser,
  countAdmin
};
