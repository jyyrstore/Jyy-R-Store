const repo=require('../../repositories/tickets.repository');
const notifications=require('../../repositories/notification.repository');
const {randomId}=require('../../utils/crypto');

function ticketNumber(){return `JYR-T-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomId().slice(-5).toUpperCase()}`}

async function create(userId,data){
  const t=await repo.create({...data,user_id:userId,ticket_number:ticketNumber()});
  await repo.addMessage({ticket_id:t.id,sender_id:userId,body:data.message||data.body});
  return repo.detail(t.id,userId);
}

async function reply(ticketId,senderId,body){
  const t=await repo.detail(ticketId,senderId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  const m=await repo.addMessage({ticket_id:ticketId,sender_id:senderId,body});
  await repo.setStatus(ticketId,'OPEN');
  return m;
}

async function ownerReply(ticketId,ownerId,body){
  const t=await repo.detail(ticketId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  const m=await repo.addMessage({ticket_id:ticketId,sender_id:ownerId,body});
  await repo.setStatus(ticketId,'REPLIED');
  await notifications.create({
    user_id:t.user_id,
    type:'TICKET',
    title:`Balasan ${t.ticket_number}`,
    body:'Owner membalas ticket Anda.',
    link:`/tickets/${ticketId}`
  });
  return m;
}

async function setStatus(ticketId,userId,status){
  const t=await repo.detail(ticketId,userId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  return repo.setStatus(ticketId,status);
}

async function ownerSetStatus(ticketId,status){
  const t=await repo.detail(ticketId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  return repo.setStatus(ticketId,status);
}

module.exports={
  create,reply,ownerReply,setStatus,ownerSetStatus,
  list:repo.listForUser,
  detail:repo.detail,
  adminList:repo.adminList
};
