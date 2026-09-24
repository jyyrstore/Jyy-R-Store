const repo=require('../../repositories/messages.repository');
module.exports={
  list:(userId,options={})=>repo.listForUser(userId,options),
  detail:(id,userId)=>repo.findForUser(id,userId),
  listAll:(options={})=>repo.listAll(options),
  count:(userId)=>repo.countForUser(userId),
  countAll:()=>repo.countAll(),
  create:(data)=>repo.create(data),
  sendFromUser:(userId,body)=>repo.createFromUser(userId,body)
};
