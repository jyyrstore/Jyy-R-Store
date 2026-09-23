const { paymentProvider }=require('../../config/payment');
function verify(rawBody,signature){return paymentProvider().verifyWebhook(rawBody,signature);}
function parse(payload,rawBody){return paymentProvider().parseWebhook(payload,rawBody);}
module.exports={verify,parse};
