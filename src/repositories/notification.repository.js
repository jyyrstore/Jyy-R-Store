const { query, db } = require('../config/database');

const NOTIFICATION_COLUMNS = `
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.body,
  n.link,
  n.created_at,
  n.is_read AS legacy_is_read,
  n.read_at AS legacy_read_at
`;

const READ_STATE = `
  CASE
    WHEN n.user_id IS NULL
      THEN (nr.read_at IS NOT NULL)
    ELSE COALESCE(
      (nr.read_at IS NOT NULL),
      n.is_read
    )
  END AS is_read,
  COALESCE(nr.read_at,n.read_at) AS read_at
`;

async function create(data,client){
  const c=client||require('../config/database').db();
  return (
    await c.query(
      'insert into notifications(user_id,type,title,body,link) values($1,$2,$3,$4,$5) returning *',
      [
        data.user_id||null,
        data.type,
        data.title,
        data.body,
        data.link||null
      ]
    )
  ).rows[0];
}

async function list(userId,{limit=100,offset=0}={}){
  const lim=Math.min(
    100,
    Math.max(1,Number(limit)||100)
  );

  const off=Math.max(
    0,
    Number(offset)||0
  );

  return (
    await query(
      `
        select
          ${NOTIFICATION_COLUMNS},
          ${READ_STATE}
        from notifications n
        left join notification_reads nr
          on nr.notification_id=n.id
         and nr.user_id=$1
        where (n.user_id=$1 or n.user_id is null)
          and nr.deleted_at is null
        order by n.created_at desc
        limit $2
        offset $3
      `,
      [userId,lim,off]
    )
  ).rows;
}

async function count(userId){
  return Number(
    (
      await query(
        `
          select count(*)::int count
          from notifications n
          left join notification_reads nr
            on nr.notification_id=n.id
           and nr.user_id=$1
          where (n.user_id=$1 or n.user_id is null)
            and nr.deleted_at is null
        `,
        [userId]
      )
    ).rows[0].count
  );
}

async function adminList(options={}){
  if(typeof options==='number'){
    options={limit:options};
  }

  const limit=Math.min(
    500,
    Math.max(1,Number(options.limit)||200)
  );

  const offset=Math.max(
    0,
    Number(options.offset)||0
  );

  return (
    await query(
      `
        select
          n.*,
          p.username
        from notifications n
        left join profiles p on p.id=n.user_id
        order by n.created_at desc
        limit $1
        offset $2
      `,
      [limit,offset]
    )
  ).rows;
}

async function unreadCount(userId){
  const row=(
    await query(
      `
        select count(*)::int count
        from notifications n
        left join notification_reads nr
          on nr.notification_id=n.id
         and nr.user_id=$1
        where (n.user_id=$1 or n.user_id is null)
          and nr.deleted_at is null
          and (
            case
              when n.user_id is null
                then (nr.read_at is not null)
              else coalesce(
                (nr.read_at is not null),
                n.is_read
              )
            end
          )=false
      `,
      [userId]
    )
  ).rows[0];

  return Number(row.count);
}

async function markRead(id,userId){
  const client=await db().connect();

  try{
    await client.query('begin');

    const target=(
      await client.query(
        `
          select id,user_id
          from notifications
          where id=$1
            and (user_id=$2 or user_id is null)
            and not exists (
              select 1
              from notification_reads nr
              where nr.notification_id=notifications.id
                and nr.user_id=$2
                and nr.deleted_at is not null
            )
          for update
        `,
        [id,userId]
      )
    ).rows[0];

    if(!target){
      await client.query('rollback');
      return null;
    }

    await client.query(
      `
        insert into notification_reads(
          notification_id,
          user_id,
          read_at,
          deleted_at
        )
        values($1,$2,now(),null)
        on conflict(notification_id,user_id)
        do update set
          read_at=excluded.read_at,
          deleted_at=null
      `,
      [id,userId]
    );

    if(target.user_id===userId){
      await client.query(
        `
          update notifications
          set is_read=true,
              read_at=now()
          where id=$1
        `,
        [id]
      );
    }

    const row=(
      await client.query(
        `
          select
            n.id,
            n.user_id,
            n.type,
            n.title,
            n.body,
            n.link,
            n.created_at,
            case
              when n.user_id is null
                then (nr.read_at is not null)
              else coalesce(
                (nr.read_at is not null),
                n.is_read
              )
            end as is_read,
            coalesce(nr.read_at,n.read_at) as read_at
          from notifications n
          left join notification_reads nr
            on nr.notification_id=n.id
           and nr.user_id=$2
          where n.id=$1
        `,
        [id,userId]
      )
    ).rows[0];

    await client.query('commit');

    return row||null;
  }catch(error){
    try{
      await client.query('rollback');
    }catch(error){void error;}
    throw error;
  }finally{
    client.release();
  }
}

async function markAllRead(userId){
  const client=await db().connect();

  try{
    await client.query('begin');

    await client.query(
      `
        insert into notification_reads(
          notification_id,
          user_id,
          read_at
        )
        select
          n.id,
          $1,
          now()
        from notifications n
        where (n.user_id=$1 or n.user_id is null)
          and not exists (
            select 1
            from notification_reads nr
            where nr.notification_id=n.id
              and nr.user_id=$1
              and nr.deleted_at is not null
          )
        on conflict(notification_id,user_id)
        do update set
          read_at=excluded.read_at
      `,
      [userId]
    );

    await client.query(
      `
        update notifications n
        set
          is_read=true,
          read_at=now()
        where n.user_id=$1
          and not exists (
            select 1
            from notification_reads nr
            where nr.notification_id=n.id
              and nr.user_id=$1
              and nr.deleted_at is not null
          )
      `,
      [userId]
    );

    await client.query('commit');

    return {
      success:true
    };
  }catch(error){
    try{
      await client.query('rollback');
    }catch(error){void error;}
    throw error;
  }finally{
    client.release();
  }
}

async function deleteSelected(userId,notificationIds){
  const ids=[
    ...new Set(
      (notificationIds||[])
        .map(value=>String(value||'').trim())
        .filter(Boolean)
    )
  ].slice(0,100);

  if(!ids.length){
    return {deleted:0};
  }

  const client=await db().connect();

  try{
    await client.query('begin');

    const personal=await client.query(
      `
        delete from notifications
        where id=any($2::uuid[])
          and user_id=$1
        returning id
      `,
      [userId,ids]
    );

    const broadcast=await client.query(
      `
        insert into notification_reads(
          notification_id,
          user_id,
          read_at,
          deleted_at
        )
        select
          n.id,
          $1,
          now(),
          now()
        from notifications n
        where n.id=any($2::uuid[])
          and n.user_id is null
        on conflict(notification_id,user_id)
        do update set
          deleted_at=excluded.deleted_at
      `,
      [userId,ids]
    );

    await client.query('commit');

    return {
      deleted:
        personal.rowCount+
        broadcast.rowCount
    };
  }catch(error){
    try{
      await client.query('rollback');
    }catch(error){void error;}
    throw error;
  }finally{
    client.release();
  }
}

async function deleteAll(userId){
  const client=await db().connect();

  try{
    await client.query('begin');

    const personal=await client.query(
      `
        delete from notifications
        where user_id=$1
      `,
      [userId]
    );

    const broadcast=await client.query(
      `
        insert into notification_reads(
          notification_id,
          user_id,
          read_at,
          deleted_at
        )
        select
          n.id,
          $1,
          now(),
          now()
        from notifications n
        where n.user_id is null
        on conflict(notification_id,user_id)
        do update set
          deleted_at=excluded.deleted_at
      `,
      [userId]
    );

    await client.query('commit');

    return {
      deleted:
        personal.rowCount+
        broadcast.rowCount
    };
  }catch(error){
    try{
      await client.query('rollback');
    }catch(error){void error;}
    throw error;
  }finally{
    client.release();
  }
}

async function countAdmin(){
  return Number(
    (
      await query(
        'select count(*)::int count from notifications'
      )
    ).rows[0].count
  );
}

module.exports={
  create,
  list,
  count,
  adminList,
  unreadCount,
  markRead,
  countAdmin,
  markAllRead,
  deleteSelected,
  deleteAll
};
