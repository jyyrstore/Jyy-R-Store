const settings=require('../settings/settings.service');
module.exports={get:settings.maintenance,update:settings.setMaintenance};
