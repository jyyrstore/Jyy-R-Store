const { log, redact } = require('../config/logging');
function errorHandler(err,req,res,next){
  if(res.headersSent) return next(err);
  const status=err.status||500;
  const code=err.code||'INTERNAL_ERROR';
  const message=status<500 && err.expose!==false ? err.message : 'Terjadi kesalahan pada server.';
  log(status>=500?'error':'warn','request_error',{requestId:req.id,error:err.message,stack:status>=500?err.stack:undefined,path:req.path,body:redact(req.body)});
  if(req.originalUrl.startsWith('/api/')) return res.status(status).json({success:false,error:{code,message,...(status<500&&err.details?{details:err.details}:{}),requestId:req.id}});
  return res.status(status).render('app',{title:'Error',view:'pages/error',req,csrfToken:req.csrfToken?.()||null,currentUser:req.user||null,profile:req.profile||null,status,code,message,requestId:req.id||'unknown'});
}
module.exports={errorHandler};
