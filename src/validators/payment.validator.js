const {z}=require('zod');module.exports=z.object({orderId:z.string().uuid(),returnUrl:z.string().url().optional()});
