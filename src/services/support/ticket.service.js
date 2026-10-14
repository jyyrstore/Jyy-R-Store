const repo=require('../../repositories/tickets.repository');
const notifications=require('../notification/notification.service');
const {randomId}=require('../../utils/crypto');

function ticketNumber(){return `JYR-T-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomId().slice(-5).toUpperCase()}`}

// JYYR TICKET NOTIFICATION COMPLETENESS
async function notifyOwner(data){
  try{
    const owner=await require('../../repositories/messages.repository').firstOwner();

    if(owner?.id){
      await notifications.notify(owner.id,data);
    }
  }catch(error){
    void error;
  }
}

async function create(userId,data){
  const t=await repo.create({...data,user_id:userId,ticket_number:ticketNumber()});
  await repo.addMessage({ticket_id:t.id,sender_id:userId,body:data.message||data.body});

  await notifyOwner({
    type:'TICKET',
    title:`Tiket baru ${t.ticket_number}`,
    body:'Pengguna membuat tiket baru dan menunggu respons Owner.',
    link:`/owner/tickets/${t.id}`
  });

  return repo.detail(t.id,userId);
}

async function reply(ticketId,senderId,body){
  const t=await repo.detail(ticketId,senderId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  const m=await repo.addMessage({ticket_id:ticketId,sender_id:senderId,body});
  await repo.setStatus(ticketId,'OPEN');

  await notifyOwner({
    type:'TICKET',
    title:`Balasan baru ${t.ticket_number}`,
    body:'Pengguna membalas tiket dan menunggu tindak lanjut Owner.',
    link:`/owner/tickets/${ticketId}`
  });

  return m;
}

async function ownerReply(ticketId,ownerId,body){
  const t=await repo.detail(ticketId);
  if(!t) throw Object.assign(new Error('Ticket tidak ditemukan'),{status:404,code:'TICKET_NOT_FOUND',expose:true});
  const m=await repo.addMessage({ticket_id:ticketId,sender_id:ownerId,body});
  await repo.setStatus(ticketId,'REPLIED');
  await notifications.notify(t.user_id,{
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

  const updated=await repo.setStatus(ticketId,status);

  if(t.status!==status){
    await notifications.notify(t.user_id,{
      type:'TICKET',
      title:`Status tiket ${t.ticket_number} diperbarui`,
      body:`Status tiket sekarang ${status}.`,
      link:`/tickets/${ticketId}`
    }).catch(()=>{});
  }

  return updated;
}

module.exports={
  create,
  reply,
  ownerReply,
  setStatus,
  ownerSetStatus,
  list:(userId,options={})=>repo.listForUser(userId,options),
  count:(userId)=>repo.countForUser(userId),
  detail:repo.detail,
  adminList:(status,options={})=>repo.adminList(status,options),
  countAdmin:(status)=>repo.countAdmin(status)
};
