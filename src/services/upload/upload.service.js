const storage=require('../../config/storage'); const {loadEnv}=require('../../config/env'); const crypto=require('crypto');
async function store({buffer,mime,type,originalName,bucketPath}){const ext=(originalName.match(/\.([a-z0-9]+)$/i)||['','bin'])[1].toLowerCase();const path=bucketPath||`uploads/${crypto.randomUUID()}.${ext}`;await storage.uploadBuffer({bucket:loadEnv().USER_UPLOAD_BUCKET,path,buffer,contentType:mime});return {path,bucket:loadEnv().USER_UPLOAD_BUCKET};}
module.exports={store};
