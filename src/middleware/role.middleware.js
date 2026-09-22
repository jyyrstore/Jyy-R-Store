const { forbidden } = require('../utils/error');
function requireRole(...roles){ return (req,res,next)=>{ if(!req.profile) return next(forbidden()); if(!roles.includes(req.profile.role)) return next(forbidden('You do not have permission for this action.')); next(); }; }
function requireOwner(req,res,next){ return requireRole('OWNER')(req,res,next); }
module.exports={requireRole,requireOwner};
