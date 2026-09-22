const rolePermissions={OWNER:new Set(['*']),ADMIN:new Set(['read:dashboard','manage:products','manage:orders','manage:payments','manage:deposits','manage:support','manage:users']),MODERATOR:new Set(['read:dashboard','manage:support']),USER:new Set()};
function requirePermission(permission){return (req,res,next)=>{const set=rolePermissions[req.profile?.role];if(set?.has('*')||set?.has(permission))return next();return res.status(403).json({success:false,error:{code:'FORBIDDEN',message:'Permission denied.'}})}}
module.exports={requirePermission};
