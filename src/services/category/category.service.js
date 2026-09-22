const repo=require('../../repositories/categories.repository'); const slug=require('../../utils/slug');
module.exports={list:repo.list,create:(d)=>repo.create({...d,slug:slug(d.slug||d.name)}),update:repo.update};
