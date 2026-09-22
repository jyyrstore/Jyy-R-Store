const {z}=require('zod');module.exports=z.object({amount:z.coerce.number().int().min(1000),idempotencyKey:z.string().min(8).max(100).optional(),returnUrl:z.string().url().optional()});
