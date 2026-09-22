function webhookJson(req,res,next){if(!req.body)return res.status(400).json({success:false,error:{code:'INVALID_WEBHOOK',message:'Webhook body is required.'}});next()} module.exports={webhookJson};
