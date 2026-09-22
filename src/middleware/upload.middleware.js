const multer = require('multer');
const { loadEnv } = require('../config/env');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: loadEnv().MAX_UPLOAD_MB*1024*1024 } });
module.exports={upload};
