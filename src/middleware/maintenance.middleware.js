const { query }=require('../config/database'); const {loadEnv}=require('../config/env');
async function maintenanceMiddleware(req,res,next){
  try{const {rows}=await query("select * from maintenance_settings where id=1");const m=rows[0];if(!m?.enabled)return next();
    const critical=req.path.startsWith('/api/payment/webhook')||req.path==='/api/cron/expire'||req.path==='/health'; if(critical)return next();
    const ownerAllowed=m.allow_owner_access!==false && req.profile?.role==='OWNER'; if(ownerAllowed||req.path.startsWith('/api/owner')||req.path.startsWith('/owner'))return next();
    const payload={success:false,error:{code:'MAINTENANCE',message:m.message||'Store sedang dalam pemeliharaan.'}};
    const e=loadEnv(); return req.path.startsWith('/api/')?res.status(503).json(payload):res.status(503).render('app',{title:m.title||'Maintenance',view:'pages/configuration',configured:false,csrfToken:req.csrfToken?.()||null,req,env:{nodeEnv:e.NODE_ENV,appUrl:e.APP_URL}});
  }catch(e){next(e)}
}
module.exports={maintenanceMiddleware};
