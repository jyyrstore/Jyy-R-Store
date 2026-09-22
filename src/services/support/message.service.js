const repo=require('../../repositories/messages.repository');
module.exports={list:(userId)=>repo.listForUser(userId),detail:(id,userId)=>repo.findForUser(id,userId),listAll:()=>repo.listAll(),create:(data)=>repo.create(data),sendFromUser:(userId,body)=>repo.createFromUser(userId,body)};
