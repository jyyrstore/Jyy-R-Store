const repo=require('../../repositories/analytics.repository');
async function dashboard(){return repo.dashboard();}
async function period(period,from,to){
  if(period==='custom'&&from&&to){const start=new Date(from);const end=new Date(to);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>=end) throw Object.assign(new Error('Custom analytics period tidak valid.'),{status:422,code:'INVALID_ANALYTICS_PERIOD',expose:true});return repo.periodAnalytics(start,end);}
  return repo.periodAnalytics(...repo.periodRange(period));
}
module.exports={dashboard,period};
