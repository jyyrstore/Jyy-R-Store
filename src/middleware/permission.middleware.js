const { ROLE_PERMISSIONS }=require('../constants/permissions');
const { forbidden }=require('../utils/error');

function requirePermission(permission){
  return (req,res,next)=>{
    const allowed=ROLE_PERMISSIONS[req.profile?.role]||[];
    const requested=String(permission||'');

    if(allowed.includes('*')||allowed.includes(requested)){
      return next();
    }

    return next(
      forbidden('You do not have permission for this action.')
    );
  };
}

module.exports={requirePermission};
