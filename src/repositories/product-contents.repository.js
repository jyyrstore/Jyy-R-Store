const repo=require('./products.repository');module.exports={list:repo.contents,create:repo.addContent,update:repo.updateContent,remove:repo.deleteContent};
