const storage=require('../../config/storage');
async function create(bucket,path,expiresIn){return storage.signedUrl(bucket,path,expiresIn);}
module.exports={create};
