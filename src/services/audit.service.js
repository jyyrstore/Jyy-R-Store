const audit = require('../repositories/audit.repository');
async function record(req,{action,entityType,entityId,metadata},client){ return audit.log({actor_user_id:req.user?.id||null,action,entity_type:entityType,entity_id:entityId,metadata:metadata||null,masked_ip:maskIp(req.ip),user_agent:req.get('user-agent')||null},client); }
function maskIp(ip){ if(!ip) return null; if(ip.includes(':')) return ip.split(':').slice(0,4).join(':')+':*'; const p=ip.split('.'); return p.length===4?`${p[0]}.${p[1]}.x.x`:ip; }
module.exports={record,maskIp};
