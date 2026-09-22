const { loadEnv } = require('./env');
function appConfig(){const e=loadEnv();return {name:e.APP_NAME,url:e.APP_URL,nodeEnv:e.NODE_ENV,port:e.PORT,uploadMaxMb:e.MAX_UPLOAD_MB,signedUrlExpiration:e.SIGNED_URL_EXPIRATION};}
module.exports={appConfig};
