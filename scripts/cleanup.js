const {run:cleanupPayments}=require('../src/jobs/cleanup.job');cleanupPayments().then(()=>console.log('Cleanup completed.')).catch(e=>{console.error('Cleanup failed:',e.message);process.exit(1)});
