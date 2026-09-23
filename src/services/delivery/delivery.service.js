const { query }=require('../../config/database');
const storage=require('../../config/storage');
const delivery=require('../../repositories/delivery.repository');
const {forbidden,notFound}=require('../../utils/error');
const {loadEnv}=require('../../config/env');

async function makeUrl(content){
  if(content.type==='LINK') return content.url;
  if(!content.storage_path) return null;
  const env=loadEnv();
  const bucket=content.storage_path.startsWith('public-assets/') ? env.PUBLIC_ASSET_BUCKET : env.PRIVATE_PRODUCT_BUCKET;
  const path=content.storage_path.replace(/^public-assets\//,'');
  return storage.signedUrl(bucket,path,env.SIGNED_URL_EXPIRATION);
}
async function access(userId,contentId,context={}){
  const {ip=null,userAgent=null}=context||{};
  const content=(await query('select pc.*,p.slug,p.name,p.id product_id from product_contents pc join products p on p.id=pc.product_id where pc.id=$1',[contentId])).rows[0];
  if(!content) throw notFound('Content not found.');
  if(content.access_type==='PUBLIC') return {content,url:await makeUrl(content),purchased:true};
  if(content.access_type==='PREVIEW' && content.is_preview) return {content,url:await makeUrl(content),purchased:false};
  const ent=await delivery.entitlement(userId,content.product_id);
  if(!ent) throw forbidden('You do not own this content.');
  const order=(await query("select o.id,o.status from orders o where o.id=$1 and o.user_id=$2",[ent.order_id,userId])).rows[0];
  if(!order || !['PAID','PROCESSING','COMPLETED'].includes(order.status)) throw forbidden('Payment is not confirmed.');
  const url=await makeUrl(content);
  if(['FILE','IMAGE','VIDEO','AUDIO'].includes(content.type)) await delivery.logDownload({user_id:userId,content_id:content.id,order_id:ent.order_id,ip,user_agent:userAgent},null);
  return {content,url,purchased:true};
}
module.exports={access};
