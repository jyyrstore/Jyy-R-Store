const repo=require('../../repositories/notification.repository');
const {query}=require('../../config/database');

async function create(data,client){
  return repo.create(data,client);
}

async function notify(userId,data,client){
  if(!userId){
    throw new Error('Notification user_id wajib diisi.');
  }

  return create(
    {
      ...data,
      user_id:userId
    },
    client
  );
}

async function broadcast(data){
  const users=(
    await query(
      "select id from profiles where status!='BANNED' and deleted_at is null"
    )
  ).rows;

  for(const user of users){
    await notify(
      user.id,
      data
    );
  }

  return users.length;
}

module.exports={
  ...repo,
  create,
  notify,
  broadcast
};
