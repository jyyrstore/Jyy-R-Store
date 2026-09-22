const {z}=require('zod');module.exports=z.object({targetUserId:z.string().uuid(),amount:z.coerce.number().int(),reason:z.string().min(5).max(1000)});
