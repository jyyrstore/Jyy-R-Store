const { paymentProvider }=require('../../config/payment');
function verify(rawBody,signature){return paymentProvider().verifyWebhook(rawBody,signature);}
function parse(payload){return paymentProvider().parseWebhook(payload);}
module.exports={verify,parse};
