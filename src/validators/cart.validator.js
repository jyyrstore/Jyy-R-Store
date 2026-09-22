const {z}=require('zod');module.exports=z.object({productId:z.string().uuid(),quantity:z.coerce.number().int().min(1).max(100)});
