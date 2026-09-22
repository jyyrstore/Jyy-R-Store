const orders=require('../order/order.service');
module.exports={preview:orders.preview,createWalletOrder:orders.createWalletOrder,createGatewayOrder:orders.createGatewayOrder};
