const repo=require('../../repositories/faq.repository');
module.exports={list:repo.listPublic,listPublic:repo.listPublic,listAll:repo.listAll,create:repo.create,update:repo.update};
