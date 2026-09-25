const { query, withTransaction }=require('../config/database');

const USER_ROLES=new Set([
  'USER',
  'MODERATOR',
  'ADMIN',
  'OWNER'
]);

const USER_STATUSES=new Set([
  'ACTIVE',
  'SUSPENDED',
  'BANNED',
  'PENDING'
]);

function normalizeFilter(value,allowed){
  const key=String(value||'').trim().toUpperCase();
  return allowed.has(key) ? key : '';
}

function safeLimit(value){
  return Math.min(
    100,
    Math.max(1,Number(value)||100)
  );
}

function safeOffset(value){
  return Math.max(
    0,
    Number(value)||0
  );
}

function buildFilters({search='',role='',status=''}={}){
  return {
    search:String(search||'').trim().slice(0,120),
    role:normalizeFilter(role,USER_ROLES),
    status:normalizeFilter(status,USER_STATUSES)
  };
}

async function list({
  search='',
  role='',
  status='',
  limit=100,
  offset=0
}={}){
  const filters=buildFilters({
    search,
    role,
    status
  });

  const params=[
    filters.search,
    filters.role,
    filters.status,
    safeLimit(limit),
    safeOffset(offset)
  ];

  return (
    await query(
      `select
         p.*,
         coalesce(w.balance,0) balance,
         (
           select count(*)
           from orders o
           where o.user_id=p.id
         ) orders
       from profiles p
       left join wallets w on w.user_id=p.id
       where (
         $1=''
         or p.username ilike '%'||$1||'%'
         or p.email ilike '%'||$1||'%'
       )
       and ($2='' or p.role=$2)
       and ($3='' or p.status=$3::account_status)
       order by p.created_at desc
       limit $4
       offset $5`,
      params
    )
  ).rows;
}

async function count({
  search='',
  role='',
  status=''
}={}){
  const filters=buildFilters({
    search,
    role,
    status
  });

  return Number(
    (
      await query(
        `select count(*)::int count
         from profiles p
         where (
           $1=''
           or p.username ilike '%'||$1||'%'
           or p.email ilike '%'||$1||'%'
         )
         and ($2='' or p.role=$2)
         and ($3='' or p.status=$3::account_status)`,
        [
          filters.search,
          filters.role,
          filters.status
        ]
      )
    ).rows[0].count
  );
}

async function changeStatus(id,status){
  return (
    await query(
      'update profiles set status=$2,updated_at=now() where id=$1 returning id,username,email,role,status',
      [id,status]
    )
  ).rows[0];
}

async function changeRole(id,role){
  return (
    await query(
      'update profiles set role=$2,updated_at=now() where id=$1 returning id,username,email,role,status',
      [id,role]
    )
  ).rows[0];
}

async function anonymize(id){
  return (
    await query(
      "update profiles set status='BANNED',username='deleted-'||substr(id::text,1,8),email='deleted-'||substr(id::text,1,8)||'@invalid.local',deleted_at=now(),updated_at=now() where id=$1 returning id,username,status",
      [id]
    )
  ).rows[0];
}

async function resetSessions(id){
  await query(
    'delete from user_sessions where sess::text like $1',
    ['%'+id+'%']
  ).catch(()=>{});
  return true;
}

module.exports={
  list,
  count,
  changeStatus,
  changeRole,
  anonymize,
  resetSessions
};
