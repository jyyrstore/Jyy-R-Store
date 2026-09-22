const {z}=require('zod');module.exports=z.object({paymentMethod:z.enum(['BALANCE','GATEWAY']),idempotencyKey:z.string().min(8).max(100).optional(),returnUrl:z.string().url().optional()});
