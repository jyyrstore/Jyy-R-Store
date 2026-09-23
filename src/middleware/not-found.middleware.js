const {requestPath}=require('../utils/request-path');
function notFound(req,res){
  if(requestPath(req).startsWith('/api/')) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Resource not found',requestId:req.id}});
  return res.status(404).render('app',{title:'Tidak ditemukan',view:'pages/error',req,csrfToken:req.csrfToken?.()||null,currentUser:req.user||null,profile:req.profile||null,status:404,code:'NOT_FOUND',message:'Halaman tidak ditemukan.',requestId:req.id||'unknown'});
}
module.exports={notFound};
