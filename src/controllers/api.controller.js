const { ok }=require('../utils/response');
const { requireAuth }=require('../middleware/auth.middleware');
const auth=require('../services/auth/auth.service');
const product=require('../services/product/product.service');
const cart=require('../services/cart/cart.service');
const orders=require('../services/order/order.service');
const payment=require('../services/payment/payment.service');
const deposit=require('../services/deposit/deposit.service');
const wallet=require('../services/wallet/wallet.service');
const delivery=require('../services/delivery/delivery.service');
const profile=require('../services/profile/profile.service');
const tickets=require('../services/support/ticket.service');
const notifications=require('../services/notification/notification.service');
const services=require('../services/service/service.service');
const messages=require('../services/support/message.service');
const rolesRepo=require('../repositories/roles.repository');
const loginHistory=require('../repositories/login-history.repository');
const search=require('../services/search/search.service');
const analytics=require('../services/analytics/analytics.service');
const settings=require('../services/settings/settings.service');
const users=require('../repositories/users.repository');
const { query }=require('../config/database');
const info=require('../repositories/information.repository');
const faq=require('../repositories/faq.repository');
const categories=require('../repositories/categories.repository');
const storage=require('../config/storage');
const { loadEnv }=require('../config/env');
const makeSlug=require('../utils/slug');
const { validateFile }=require('../utils/file');
const crypto=require('crypto');
const {safeNextPath}=require('../utils/url');
const {setAuthSession}=require('../utils/auth-session');

const authController={
 register:async(req,res)=>ok(res,await auth.register(req.body),201),
 login:async(req,res)=>{const d=await auth.login(req.body,{ip:req.ip,userAgent:req.get('user-agent')});await setAuthSession(req,d);return ok(res,{user:d.user},200)},
 logout:async(req,res)=>{await require('../services/audit.service').record(req,{action:'LOGOUT',entityType:'session'}).catch(()=>{});await auth.logout();req.session.destroy(()=>{});return ok(res,{})},
 resetRequest:async(req,res)=>{await auth.sendPasswordReset(req.body.email);return ok(res,{message:'Reset email request accepted.'})},
 resetPassword:async(req,res)=>{await auth.updatePassword({accessToken:req.session.auth?.accessToken,refreshToken:req.session.auth?.refreshToken},req.body.password);return ok(res,{message:'Password updated.'})},
 callback:async(req,res)=>{const d=await auth.exchangeCode(req.query.code);await setAuthSession(req,d);res.redirect(safeNextPath(req.query.next))},
 me:async(req,res)=>ok(res,{user:req.user,profile:req.profile})
};

const productController={
 list:async(req,res)=>{const data=await product.catalog(req.query); const items=data.items.map(p=>({...p,thumbnail_url:p.thumbnail_path?storage.publicUrl(loadEnv().PUBLIC_ASSET_BUCKET,p.thumbnail_path):null}));return ok(res,{...data,items})},
 detail:async(req,res)=>{const p=await product.detailBySlug(req.params.slug,req.user?.id); if(p.thumbnail_path)p.thumbnail_url=storage.publicUrl(loadEnv().PUBLIC_ASSET_BUCKET,p.thumbnail_path);return ok(res,p)},
 categories:async(req,res)=>ok(res,await categories.list(true)),
 create:async(req,res)=>ok(res,await product.create(req.body),201),
 update:async(req,res)=>ok(res,await product.update(req.params.id,req.body)),
 event:async(req,res)=>{await requireAuth(req,res,()=>{}); return ok(res,{})}
};
const cartController={
 get:async(req,res)=>ok(res,await cart.get(req.user.id)),
 add:async(req,res)=>ok(res,await cart.add(req.user.id,req.body.productId,Number(req.body.quantity||1)),201),
 update:async(req,res)=>ok(res,await cart.set(req.user.id,req.params.id,Number(req.body.quantity))),
 remove:async(req,res)=>{await cart.remove(req.user.id,req.params.id);return ok(res,{})},
 clear:async(req,res)=>{await cart.clear(req.user.id);return ok(res,{})}
};
const orderController={
 preview:async(req,res)=>ok(res,await orders.preview(req.user.id)),
 create:async(req,res)=>{const method=req.body.paymentMethod||'BALANCE';if(method==='BALANCE')return ok(res,await orders.createWalletOrder(req.user.id,req.body.idempotencyKey||crypto.randomUUID()),201);const created=await orders.createGatewayOrder(req.user.id,{idempotencyKey:req.body.idempotencyKey||crypto.randomUUID(),returnUrl:req.body.returnUrl});const p=await payment.createForOrder(req.user.id,created.order,req.body.returnUrl);return ok(res,{...created,payment:p},201)},
 list:async(req,res)=>ok(res,await orders.getUserOrders(req.user.id,req.query)),
 detail:async(req,res)=>{const o=await require('../repositories/orders.repository').findForUser(req.params.id,req.user.id); if(!o) throw Object.assign(new Error('Order not found.'),{status:404,code:'ORDER_NOT_FOUND',expose:true});return ok(res,o)}
};
const paymentController={
 create:async(req,res)=>{const order=await require('../repositories/orders.repository').findForUser(req.body.orderId,req.user.id);if(!order)throw Object.assign(new Error('Order not found.'),{status:404,code:'ORDER_NOT_FOUND',expose:true});return ok(res,await payment.createForOrder(req.user.id,order,req.body.returnUrl),201)},
 status:async(req,res)=>ok(res,await payment.getStatus(req.params.id,req.user.id))
};
const depositController={
 create:async(req,res)=>ok(res,await deposit.createAndPay(req.user.id,{amount:Number(req.body.amount),idempotencyKey:req.body.idempotencyKey||crypto.randomUUID(),returnUrl:req.body.returnUrl}),201),
 list:async(req,res)=>ok(res,await deposit.list(req.user.id)),
 wallet:async(req,res)=>ok(res,await wallet.get(req.user.id)),
 mutations:async(req,res)=>ok(res,await wallet.mutations(req.user.id))
};
const deliveryController={ access:async(req,res)=>ok(res,await delivery.access(req.user.id,req.params.contentId)) };
const profileController={
 get:async(req,res)=>ok(res,await profile.get(req.user.id)),
 update:async(req,res)=>ok(res,await profile.update(req.user.id,req.body)),
 history:async(req,res)=>ok(res,await profile.loginHistory(req.user.id))
};
const ticketController={
 list:async(req,res)=>ok(res,await tickets.list(req.user.id)),
 create:async(req,res)=>ok(res,await tickets.create(req.user.id,req.body),201),
 detail:async(req,res)=>{const t=await tickets.detail(req.params.id,req.user.id);if(!t)throw Object.assign(new Error('Ticket not found.'),{status:404,code:'TICKET_NOT_FOUND',expose:true});return ok(res,t)},
 reply:async(req,res)=>ok(res,await tickets.reply(req.params.id,req.user.id,req.body.body)),
 status:async(req,res)=>ok(res,await tickets.setStatus(req.params.id,req.user.id,req.body.status))
};
const notificationController={
 list:async(req,res)=>ok(res,await notifications.list(req.user.id)),
 unread:async(req,res)=>ok(res,{count:await notifications.unreadCount(req.user.id)}),
 read:async(req,res)=>ok(res,await notifications.markRead(req.params.id,req.user.id))
};
const serviceController={list:async(req,res)=>ok(res,await services.list(true)),order:async(req,res)=>ok(res,await services.purchaseWithBalance(req.user.id,req.body.serviceId,req.body.requestData),201)};
const messageController={list:async(req,res)=>ok(res,await messages.list(req.user.id)),detail:async(req,res)=>{const m=await require('../repositories/messages.repository').findForUser(req.params.id,req.user.id);if(!m)throw Object.assign(new Error('Message not found.'),{status:404,code:'MESSAGE_NOT_FOUND',expose:true});return ok(res,m)},create:async(req,res)=>{const m=await messages.sendFromUser(req.user.id,req.body.body);await require('../services/audit.service').record(req,{action:'SEND_MESSAGE',entityType:'message',entityId:m.id}).catch(()=>{});const owner=await require('../repositories/messages.repository').firstOwner();if(owner) await notifications.create({user_id:owner.id,type:'SYSTEM',title:'Pesan baru dari user',body:`User ${req.profile?.username||req.user.id} mengirim pesan baru.`,link:'/owner/messages'}).catch(()=>{});return ok(res,m,201)}};
const contentController={faq:async(req,res)=>ok(res,await faq.listPublic()),information:async(req,res)=>ok(res,await info.listPublic()),search:async(req,res)=>ok(res,await search.search(req.query.q||''))};
const ownerController={
 dashboard:async(req,res)=>ok(res,await analytics.dashboard()),
 analytics:async(req,res)=>ok(res,await analytics.period(req.query.period||'30d',req.query.from,req.query.to)),
 topOrders:async(req,res)=>ok(res,(await analytics.period(req.query.period||'30d',req.query.from,req.query.to)).top),
 products:async(req,res)=>ok(res,await require('../repositories/products.repository').adminList({search:req.query.search,status:req.query.status||'',sort:req.query.sort||'newest',limit:req.query.limit||100,offset:req.query.offset||0})),
 productCreate:async(req,res)=>{const payload={...req.body,status:'DRAFT'};const p=await product.create(payload);await require('../services/audit.service').record(req,{action:'CREATE_PRODUCT',entityType:'product',entityId:p.id,metadata:{name:p.name,status:'DRAFT'}});return ok(res,p,201)},
 productUpdate:async(req,res)=>{const p=await product.update(req.params.id,req.body);await require('../services/audit.service').record(req,{action:'EDIT_PRODUCT',entityType:'product',entityId:p.id});return ok(res,p)},
 productArchive:async(req,res)=>{const p=await require('../repositories/products.repository').remove(req.params.id);await require('../services/audit.service').record(req,{action:'ARCHIVE_PRODUCT',entityType:'product',entityId:p.id});return ok(res,p)},
 productUnpublish:async(req,res)=>{const p=await require('../repositories/products.repository').unpublish(req.params.id);if(!p)throw Object.assign(new Error('Product not found.'),{status:404,code:'PRODUCT_NOT_FOUND',expose:true});await require('../services/audit.service').record(req,{action:'UNPUBLISH_PRODUCT',entityType:'product',entityId:p.id});return ok(res,p)},
 productDuplicate:async(req,res)=>{const p=await require('../repositories/products.repository').duplicate(req.params.id);if(!p)throw Object.assign(new Error('Product not found.'),{status:404,code:'PRODUCT_NOT_FOUND',expose:true});await require('../services/audit.service').record(req,{action:'DUPLICATE_PRODUCT',entityType:'product',entityId:p.id});return ok(res,p,201)},
 productDelete:async(req,res)=>{const p=await require('../repositories/products.repository').remove(req.params.id);if(!p)throw Object.assign(new Error('Product not found.'),{status:404,code:'PRODUCT_NOT_FOUND',expose:true});await require('../services/audit.service').record(req,{action:'DELETE_PRODUCT',entityType:'product',entityId:p.id});return ok(res,p)},
 productPublish:async(req,res)=>{const repo=require('../repositories/products.repository');const current=await repo.findById(req.params.id);if(!current)throw Object.assign(new Error('Product not found.'),{status:404,code:'PRODUCT_NOT_FOUND',expose:true});if(!current.thumbnail_path)throw Object.assign(new Error('Tambahkan thumbnail sebelum publish produk.'),{status:400,code:'PRODUCT_THUMBNAIL_REQUIRED',expose:true});const contents=await repo.contents(req.params.id);if(!contents.length)throw Object.assign(new Error('Tambahkan minimal satu content sebelum publish produk.'),{status:400,code:'PRODUCT_CONTENT_REQUIRED',expose:true});const p=await product.update(req.params.id,{status:'PUBLISHED'});await require('../services/audit.service').record(req,{action:'PUBLISH_PRODUCT',entityType:'product',entityId:p.id,metadata:{contentCount:contents.length}});return ok(res,p)},
 productContent:async(req,res)=>{const p=await require('../repositories/products.repository').addContent({...req.body,product_id:req.params.id});await require('../services/audit.service').record(req,{action:'CREATE_PRODUCT_CONTENT',entityType:'product_content',entityId:p.id,metadata:{productId:req.params.id,type:p.type}});return ok(res,p,201)},productContents:async(req,res)=>ok(res,await require('../repositories/products.repository').contents(req.params.id)),
 productContentDelete:async(req,res)=>{await require('../repositories/products.repository').deleteContent(req.params.contentId);await require('../services/audit.service').record(req,{action:'DELETE_PRODUCT_CONTENT',entityType:'product_content',entityId:req.params.contentId});return ok(res,{})},
 categories:async(req,res)=>ok(res,await categories.list(false)),
 categoryCreate:async(req,res)=>ok(res,await categories.create({...req.body,slug:makeSlug(req.body.slug||req.body.name)}),201),
 categoryUpdate:async(req,res)=>ok(res,await categories.update(req.params.id,{...req.body,slug:makeSlug(req.body.slug||req.body.name)})),
 orders:async(req,res)=>ok(res,await require('../repositories/orders.repository').adminList(req.query)),
 orderStatus:async(req,res)=>{const o=await orders.ownerUpdateStatus(req.user.id,req.params.id,req.body.status);await require('../services/audit.service').record(req,{action:'OWNER_ORDER_STATUS',entityType:'order',entityId:req.params.id,metadata:{status:req.body.status}});return ok(res,o)},
 payments:async(req,res)=>ok(res,await require('../repositories/payments.repository').list(req.query)),
 deposits:async(req,res)=>ok(res,await require('../repositories/deposits.repository').adminList(req.query)),
 users:async(req,res)=>ok(res,await users.list(req.query)),
 ban:async(req,res)=>{if(req.params.id===req.user.id)throw Object.assign(new Error('Owner tidak dapat membanned akun sendiri.'),{status:400,code:'SELF_ACTION_BLOCKED',expose:true});const target=await require('../repositories/profiles.repository').findById(req.params.id);if(target?.role==='OWNER')throw Object.assign(new Error('Akun OWNER lain membutuhkan prosedur khusus.'),{status:403,code:'OWNER_TARGET_PROTECTED',expose:true});const p=await users.changeStatus(req.params.id,'BANNED');await users.resetSessions(req.params.id);await require('../services/audit.service').record(req,{action:'BAN_USER',entityType:'profile',entityId:req.params.id});return ok(res,p)},
 unban:async(req,res)=>{const p=await users.changeStatus(req.params.id,'ACTIVE');await require('../services/audit.service').record(req,{action:'UNBAN_USER',entityType:'profile',entityId:req.params.id});return ok(res,p)},
 suspend:async(req,res)=>{if(req.params.id===req.user.id)throw Object.assign(new Error('Owner tidak dapat men-suspend akun sendiri.'),{status:400,code:'SELF_ACTION_BLOCKED',expose:true});const target=await require('../repositories/profiles.repository').findById(req.params.id);if(target?.role==='OWNER')throw Object.assign(new Error('Akun OWNER lain membutuhkan prosedur khusus.'),{status:403,code:'OWNER_TARGET_PROTECTED',expose:true});const p=await users.changeStatus(req.params.id,'SUSPENDED');await require('../services/audit.service').record(req,{action:'SUSPEND_USER',entityType:'profile',entityId:req.params.id});return ok(res,p)},
 unsuspend:async(req,res)=>{const p=await users.changeStatus(req.params.id,'ACTIVE');await require('../services/audit.service').record(req,{action:'UNSUSPEND_USER',entityType:'profile',entityId:req.params.id});return ok(res,p)},
 role:async(req,res)=>{if(req.params.id===req.user.id)throw Object.assign(new Error('Role akun aktif tidak dapat diubah sendiri.'),{status:400,code:'SELF_ACTION_BLOCKED',expose:true});const target=await require('../repositories/profiles.repository').findById(req.params.id);if(target?.role==='OWNER' && req.body.role!=='OWNER')throw Object.assign(new Error('Role OWNER tidak dapat diturunkan melalui aksi ini.'),{status:403,code:'OWNER_TARGET_PROTECTED',expose:true});const p=await users.changeRole(req.params.id,req.body.role);await require('../services/audit.service').record(req,{action:'CHANGE_ROLE',entityType:'profile',entityId:req.params.id,metadata:{role:req.body.role}});return ok(res,p)},
 resetSessions:async(req,res)=>{await users.resetSessions(req.params.id);await require('../services/audit.service').record(req,{action:'RESET_SESSIONS',entityType:'profile',entityId:req.params.id});return ok(res,{})},
 deleteUser:async(req,res)=>{if(req.params.id===req.user.id)throw Object.assign(new Error('Owner tidak dapat menghapus/anonymize akun sendiri.'),{status:400,code:'SELF_ACTION_BLOCKED',expose:true});const target=await require('../repositories/profiles.repository').findById(req.params.id);if(target?.role==='OWNER')throw Object.assign(new Error('Akun OWNER dilindungi.'),{status:403,code:'OWNER_TARGET_PROTECTED',expose:true});const p=await users.anonymize(req.params.id);await users.resetSessions(req.params.id);await require('../services/audit.service').record(req,{action:'DELETE_USER',entityType:'profile',entityId:req.params.id});return ok(res,p)},
 tickets:async(req,res)=>ok(res,await tickets.adminList(req.query.status)),
 ticketReply:async(req,res)=>ok(res,await tickets.ownerReply(req.params.id,req.user.id,req.body.body)),
 ticketStatus:async(req,res)=>ok(res,await tickets.ownerSetStatus(req.params.id,req.body.status)),
 services:async(req,res)=>ok(res,await services.list(false)),
 serviceCreate:async(req,res)=>ok(res,await services.create(req.body),201),
 serviceUpdate:async(req,res)=>ok(res,await services.update(req.params.id,req.body)),
 settings:async(req,res)=>ok(res,{items:await settings.ownerSettings(),maintenance:await settings.maintenance()}),
 settingsSave:async(req,res)=>{const items=await settings.save(req.body.items||[]);await require('../services/audit.service').record(req,{action:'SETTINGS_CHANGE',entityType:'settings'});return ok(res,items)},
 maintenance:async(req,res)=>ok(res,await settings.maintenance()),
 maintenanceSave:async(req,res)=>{const m=await settings.setMaintenance(req.body);await require('../services/audit.service').record(req,{action:'MAINTENANCE_CHANGE',entityType:'maintenance',metadata:m});return ok(res,m)},
 activity:async(req,res)=>ok(res,await require('../repositories/audit.repository').list(500)),
 reports:async(req,res)=>ok(res,await analytics.period(req.query.period||'30d')),
 security:async(req,res)=>ok(res,{loginHistory:(await query('select * from login_history order by created_at desc limit 200')).rows}),
 roles:async(req,res)=>ok(res,await rolesRepo.list()),
 storage:async(req,res)=>ok(res,{publicBucket:loadEnv().PUBLIC_ASSET_BUCKET,privateBucket:loadEnv().PRIVATE_PRODUCT_BUCKET,userBucket:loadEnv().USER_UPLOAD_BUCKET,configured:true}),
 system:async(req,res)=>ok(res,{node:process.version,environment:loadEnv().NODE_ENV,uptime:process.uptime(),timestamp:new Date().toISOString()}),
 loginHistory:async(req,res)=>ok(res,await loginHistory.listAll()),
 messages:async(req,res)=>ok(res,await require('../repositories/messages.repository').listAll()),
 messageReply:async(req,res)=>{const user=await require('../repositories/profiles.repository').findById(req.params.userId);if(!user)throw Object.assign(new Error('User not found.'),{status:404,code:'USER_NOT_FOUND',expose:true});const m=await messages.create({user_id:user.id,sender_id:req.user.id,body:req.body.body});await require('../services/audit.service').record(req,{action:'SEND_MESSAGE',entityType:'message',entityId:m.id,metadata:{userId:user.id}});return ok(res,m,201)},
 faq:async(req,res)=>ok(res,await faq.listAll()),
 faqCreate:async(req,res)=>ok(res,await faq.create(req.body),201),
 faqUpdate:async(req,res)=>ok(res,await faq.update(req.params.id,req.body)),
 information:async(req,res)=>ok(res,await info.listAll()),
 informationCreate:async(req,res)=>ok(res,await info.create(req.body),201),
 informationUpdate:async(req,res)=>ok(res,await info.update(req.params.id,req.body)),
 notifications:async(req,res)=>ok(res,await notifications.adminList()),
 notificationCreate:async(req,res)=>{const item=await notifications.create(req.body);await require('../services/audit.service').record(req,{action:'CREATE_NOTIFICATION',entityType:'notification',entityId:item.id,metadata:{type:item.type,userId:item.user_id}});return ok(res,item,201)},
 notificationBroadcast:async(req,res)=>{const item=await notifications.create({user_id:null,type:req.body.type,title:req.body.title,body:req.body.body,link:req.body.link});await require('../services/audit.service').record(req,{action:'BROADCAST_NOTIFICATION',entityType:'notification',entityId:item.id,metadata:{type:item.type}});return ok(res,item,201)},
 refunds:async(req,res)=>ok(res,await require('../repositories/refunds.repository').list()),
 refund:async(req,res)=>ok(res,await require('../services/refund.service').refund(req.user.id,req.params.id,req.body.reason))
};

async function ownerUpload(req,res){
  if(!req.file) throw Object.assign(new Error('File wajib diunggah.'),{status:400,code:'FILE_REQUIRED',expose:true});
  const contentType=(req.body.contentType||'FILE').toUpperCase(); const allowed=['THUMBNAIL','FILE','IMAGE','VIDEO','AUDIO']; if(!allowed.includes(contentType)) throw Object.assign(new Error('Content type upload tidak didukung.'),{status:400,code:'INVALID_CONTENT_TYPE',expose:true}); if(contentType==='THUMBNAIL' && !['image/jpeg','image/png','image/webp'].includes(req.file.mimetype)) throw Object.assign(new Error('Thumbnail harus berupa JPG, PNG, atau WebP.'),{status:400,code:'INVALID_THUMBNAIL_TYPE',expose:true});
  const validated=await validateFile(req.file,contentType==='THUMBNAIL'?'THUMBNAIL':contentType);
  const productId=req.params.id; const ext=String(validated.extension||'bin').toLowerCase(); const path=`products/${productId}/${crypto.randomUUID()}.${ext}`; const isThumb=contentType==='THUMBNAIL'; const bucket=isThumb?loadEnv().PUBLIC_ASSET_BUCKET:loadEnv().PRIVATE_PRODUCT_BUCKET; await storage.uploadBuffer({bucket,path,buffer:req.file.buffer,contentType:validated.mime,upsert:false}); if(isThumb){const p=await require('../repositories/products.repository').update(productId,{thumbnail_path:path});return ok(res,{product:p,path});} const content=await require('../repositories/products.repository').addContent({product_id:productId,type:contentType==='THUMBNAIL'?'IMAGE':(contentType==='FILE'?validated.kind:contentType),title:req.body.title||req.file.originalname,description:req.body.description,storage_path:path,mime_type:validated.mime,file_size:req.file.size,sort_order:Number(req.body.sortOrder||0),is_preview:req.body.isPreview==='true',access_type:req.body.accessType||'PURCHASED'}); return ok(res,content,201);
}
module.exports={authController,productController,cartController,orderController,paymentController,depositController,deliveryController,profileController,ticketController,notificationController,serviceController,messageController,contentController,ownerController,ownerUpload};
