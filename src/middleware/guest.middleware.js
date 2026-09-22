function requireGuest(req,res,next){if(req.user)return res.redirect('/dashboard');next()} module.exports={requireGuest};
