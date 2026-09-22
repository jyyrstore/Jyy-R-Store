const analytics=require('../analytics/analytics.service');
module.exports={sales:(period)=>analytics.period(period),overview:(period)=>analytics.period(period)};
