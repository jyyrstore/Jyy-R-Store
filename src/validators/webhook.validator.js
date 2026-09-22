const {z}=require('zod');module.exports=z.object({eventId:z.string(),reference:z.string(),amount:z.coerce.number(),status:z.string()});
