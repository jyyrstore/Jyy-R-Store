const {z}=require('zod');module.exports=z.object({q:z.string().max(120).default('')});
