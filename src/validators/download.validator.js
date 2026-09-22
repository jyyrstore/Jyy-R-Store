const {z}=require('zod');module.exports=z.object({contentId:z.string().uuid()});
