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

async function list(userId){
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
        where n.user_id=$1
           or n.user_id is null
        order by n.created_at desc
        limit 100
      `,
      [userId]
    )
  ).rows;
}

async function adminList(limit=200){
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
      `,
      [Math.min(500,Number(limit||200))]
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
          read_at
        )
        values($1,$2,now())
        on conflict(notification_id,user_id)
        do update set read_at=excluded.read_at
      `,
      [id,userId]
    );

    /*
     * Personal notification:
     * keep legacy columns synchronized for backward compatibility.
     *
     * Broadcast notification:
     * NEVER modify notifications.is_read globally.
     */
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

module.exports={
  create,
  list,
  adminList,
  unreadCount,
  markRead
};
