const wallet=require('../../repositories/wallet.repository'); const { withTransaction, query }=require('../../config/database'); const { badRequest }=require('../../utils/error'); const { record }=require('../audit.service');
async function get(userId){ return wallet.get(userId); }
async function mutations(userId,limit=100,offset=0){
  return wallet.mutations(userId,limit,offset);
}
async function countMutations(userId){
  return wallet.countMutations(userId);
}
async function adjust({actorUserId,targetUserId,amount,reason,req}){ if(!Number.isInteger(amount)||amount===0) throw badRequest('INVALID_AMOUNT','Adjustment harus berupa integer IDR dan tidak boleh nol.'); if(!reason||reason.length<5) throw badRequest('REASON_REQUIRED','Reason wajib diisi.'); return withTransaction(async(client)=>{ const w=(await client.query('select * from wallets where user_id=$1 for update',[targetUserId])).rows[0]|| (await client.query('insert into wallets(user_id) values($1) returning *',[targetUserId])).rows[0]; const before=Number(w.balance); const after=before+amount; if(after<0) throw badRequest('NEGATIVE_BALANCE','Saldo tidak boleh negatif.'); await client.query('update wallets set balance=$2,updated_at=now() where user_id=$1',[targetUserId,after]); await client.query("insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference,status,reason) values($1,$2,'ADJUSTMENT',$3,$4,$5,$6,'COMPLETED',$7)",[w.id,targetUserId,Math.abs(amount),before,after,`ADJ-${Date.now()}`,reason]); await record(req,{action:'BALANCE_ADJUSTMENT',entityType:'wallet',entityId:w.id,metadata:{targetUserId,amount,before,after,reason}},client); return {before,after}; }); }
module.exports={
  get,
  mutations,
  countMutations,
  adjust
};
