const {z}=require('zod');module.exports=z.object({paymentMethod:z.enum(['BALANCE','GATEWAY'])});
