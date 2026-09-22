const {z}=require('zod');module.exports=z.object({body:z.string().min(1).max(10000)});
