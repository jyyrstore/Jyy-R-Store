const {query}=require('../config/database');
async function listForUser(userId,options={}){
  if(typeof options==='number'){
    options={limit:options};
  }

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
      `select
         m.*,
         p.username sender_username,
         p.display_name sender_display_name
       from messages m
       join profiles p on p.id=m.sender_id
       where m.user_id=$1
       order by m.created_at desc
       limit $2
       offset $3`,
      [userId,limit,offset]
    )
  ).rows;
}

async function findForUser(id,userId){return (await query('select m.*,p.username sender_username,p.display_name sender_display_name from messages m join profiles p on p.id=m.sender_id where m.id=$1 and m.user_id=$2',[id,userId])).rows[0]||null}
async function listAll(options={}){
  const limit=Math.min(
    200,
    Math.max(1,Number(options.limit)||200)
  );

  const offset=Math.max(
    0,
    Number(options.offset)||0
  );

  return (
    await query(
      `select
         m.*,
         u.username user_username,
         s.username sender_username
       from messages m
       join profiles u on u.id=m.user_id
       join profiles s on s.id=m.sender_id
       order by m.created_at desc
       limit $1
       offset $2`,
      [limit,offset]
    )
  ).rows;
}

async function create(d){return (await query('insert into messages(user_id,sender_id,body) values($1,$2,$3) returning *',[d.user_id,d.sender_id,d.body])).rows[0]}
async function firstOwner(){return (await query("select id from profiles where role='OWNER' and deleted_at is null and status='ACTIVE' order by created_at asc limit 1")).rows[0]||null}
async function createFromUser(userId,body){const owner=await firstOwner();if(!owner) throw Object.assign(new Error('Owner support belum dikonfigurasi.'),{status:503,code:'OWNER_SUPPORT_UNAVAILABLE',expose:true});return create({user_id:userId,sender_id:userId,body})}
async function countForUser(userId){
  return Number(
    (
      await query(
        'select count(*)::int count from messages where user_id=$1',
        [userId]
      )
    ).rows[0].count
  );
}

async function countAll(){
  return Number(
    (
      await query(
        'select count(*)::int count from messages'
      )
    ).rows[0].count
  );
}

module.exports={listForUser,findForUser,listAll,create,firstOwner,createFromUser,
  countForUser,
  countAll
};
