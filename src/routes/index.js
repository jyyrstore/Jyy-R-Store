const express=require('express');
const asyncHandler=require('../utils/async-handler');
const {requireAuth}=require('../middleware/auth.middleware');
const {requireOwner}=require('../middleware/role.middleware');
const page=require('../controllers/page.controller');
const api=require('../controllers/api.controller');
const {validate}=require('../middleware/validation.middleware');
const {sensitiveRateLimit}=require('../middleware/security.middleware');
const {z}=require('zod');
const {loadEnv}=require('../config/env');
const {safeNextPath}=require('../utils/url');
const {ok}=require('../utils/response');
const cron=require('../controllers/cron.controller');

const zBool=z.preprocess(
  v=>typeof v==='string' ? ['true','1','on','yes'].includes(v.toLowerCase()) : v,
  z.boolean()
);
const ownerCategorySchema=z.object({
  name:z.string().trim().min(2).max(120),
  slug:z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description:z.string().max(2000).optional(),
  sort_order:z.coerce.number().int().min(0).max(10000).optional(),
  is_active:zBool.optional()
});
const ownerServiceSchema=z.object({
  category:z.string().trim().max(80).nullable().optional(),
  name:z.string().trim().min(2).max(120),
  price:z.coerce.number().int().min(0).max(1000000000),
  description:z.string().max(5000).nullable().optional(),
  requirements:z.record(z.any()).optional(),
  is_active:zBool.optional(),
  icon_key:z.string().trim().max(80).regex(/^[a-z0-9_-]+$/).optional(),
  sort_order:z.coerce.number().int().min(0).max(10000).optional()
});
const ownerFaqSchema=z.object({
  category:z.string().trim().max(80),
  question:z.string().trim().min(3).max(240),
  answer:z.string().trim().min(1).max(20000),
  is_published:zBool.optional(),
  sort_order:z.coerce.number().int().min(0).max(10000).optional()
});
const ownerProductContentSchema=z.object({
  type:z.enum(['FILE','IMAGE','VIDEO','AUDIO','TEXT','LINK']),
  title:z.string().trim().min(1).max(160),
  description:z.string().max(2000).optional(),
  text_content:z.string().max(50000).optional(),
  url:z.string().url().refine((value)=>/^https?:\/\//i.test(value),{message:'URL harus menggunakan HTTP atau HTTPS.'}).optional(),
  sort_order:z.coerce.number().int().min(0).max(10000).optional(),
  is_preview:zBool.optional(),
  access_type:z.enum(['PUBLIC','PREVIEW','PURCHASED']).optional()
}).superRefine((v,ctx)=>{
  if(v.type==='TEXT'&&!String(v.text_content||'').trim()){
    ctx.addIssue({
      code:z.ZodIssueCode.custom,
      path:['text_content'],
      message:'Text content wajib diisi untuk tipe TEXT.'
    });
  }

  if(v.type==='LINK'&&!v.url){
    ctx.addIssue({
      code:z.ZodIssueCode.custom,
      path:['url'],
      message:'URL wajib diisi untuk tipe LINK.'
    });
  }

  if(['FILE','IMAGE','VIDEO','AUDIO'].includes(v.type)){
    ctx.addIssue({
      code:z.ZodIssueCode.custom,
      path:['type'],
      message:'Gunakan upload endpoint untuk tipe content berbasis file.'
    });
  }
});

const ownerInformationSchema=z.object({
  type:z.string().trim().min(1).max(40),
  title:z.string().trim().min(2).max(240),
  body:z.string().trim().min(1).max(20000),
  is_published:zBool.optional(),
  publish_at:z.string().max(64).nullable().optional(),
  unpublish_at:z.string().max(64).nullable().optional()
});
const ownerSettingsSchema=z.object({
  items:z.array(z.object({
    key:z.string().trim().min(1).max(120),
    category:z.string().trim().min(1).max(80),
    value_json:z.any(),
    is_public:zBool.optional()
  })).max(200)
});
const ownerMaintenanceSchema=z.object({
  enabled:zBool,
  title:z.string().max(160).optional(),
  message:z.string().max(5000).optional(),
  scheduled_start:z.string().max(64).nullable().optional(),
  scheduled_end:z.string().max(64).nullable().optional(),
  allow_owner_access:zBool
});

const productReviewSchema=z.object({
  rating:z.coerce.number().int().min(1).max(5),
  comment:z.string().trim().min(1).max(2000)
});


const pageRouter=express.Router();
pageRouter.get('/',asyncHandler(page.home));
pageRouter.get('/store',asyncHandler(page.store));
pageRouter.get('/product/:slug',asyncHandler(page.productDetail));
pageRouter.get('/search',asyncHandler(page.search));
pageRouter.get('/services',asyncHandler(page.servicesPage));
pageRouter.get('/faq',asyncHandler(page.faq));
pageRouter.get('/security',asyncHandler(page.security)); pageRouter.get('/privacy',asyncHandler(page.legal)); pageRouter.get('/terms',asyncHandler(page.legal)); pageRouter.get('/refund',asyncHandler(page.legal)); pageRouter.get('/dmca',asyncHandler(page.legal));
pageRouter.get('/auth/login',asyncHandler(page.login));
pageRouter.get('/auth/register',asyncHandler(page.register));

pageRouter.post(
  '/auth/login',
  sensitiveRateLimit(),
  validate(z.object({
    email:z.string().email(),
    password:z.string().min(8)
  })),
  asyncHandler(async(req,res,next)=>{
    try{
      const authService=require('../services/auth/auth.service');
      const {setAuthSession}=require('../utils/auth-session');
      const data=await authService.login(req.body,{
        ip:req.ip,
        userAgent:req.get('user-agent')
      });
      await setAuthSession(req,data);
      return res.redirect(
        safeNextPath(req.query.next,'/dashboard')
      );
    }catch(error){
      if(error?.expose && Number(error.status)<500){
        const nextPath=safeNextPath(
          req.query.next,
          '/dashboard'
        );

        return res.redirect(
          '/auth/login?next='+
          encodeURIComponent(nextPath)+
          '&error='+encodeURIComponent(error.message)
        );
      }
      return next(error);
    }
  })
);

pageRouter.post('/auth/register',
  sensitiveRateLimit(),
  validate(z.object({
    email:z.string().email(),
    password:z.string().min(8),
    username:z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/)
  })),
  asyncHandler(async(req,res)=>{
    await require('../services/auth/auth.service').register(req.body);
    return res.redirect(
      '/auth/login?success=' +
      encodeURIComponent('Registrasi berhasil. Periksa email jika verifikasi diperlukan.')
    );
  })
);

pageRouter.get('/auth/forgot-password',asyncHandler(page.forgotPassword));
pageRouter.get('/auth/reset-password',asyncHandler(page.resetPassword));

pageRouter.post(
  '/auth/forgot-password',
  sensitiveRateLimit(),
  validate(z.object({email:z.string().email()})),
  asyncHandler(async(req,res,next)=>{
    try{
      await require('../services/auth/auth.service')
        .sendPasswordReset(req.body.email);
      return res.redirect(
        '/auth/forgot-password?success='+
        encodeURIComponent(
          'Jika email terdaftar, instruksi reset password akan dikirim.'
        )
      );
    }catch(error){
      if(error?.expose && Number(error.status)<500){
        return res.redirect(
          '/auth/forgot-password?error='+
          encodeURIComponent('Permintaan reset gagal. Coba lagi.')
        );
      }
      return next(error);
    }
  })
);

pageRouter.post(
  '/auth/reset-password',
  sensitiveRateLimit(),
  requireAuth,
  validate(z.object({password:z.string().min(8)})),
  asyncHandler(async(req,res,next)=>{
    try{
      const authService=require('../services/auth/auth.service');
      await authService.updatePassword({
        accessToken:req.session.auth?.accessToken,
        refreshToken:req.session.auth?.refreshToken
      },req.body.password);

      await new Promise((resolve,reject)=>{
        req.session.destroy(error=>{
          if(error) return reject(error);
          resolve();
        });
      });

      res.clearCookie('connect.sid',{
        path:'/',
        httpOnly:true,
        sameSite:'lax',
        secure:loadEnv().NODE_ENV==='production'
      });

      return res.redirect(
        '/auth/login?success='+
        encodeURIComponent('Password berhasil diperbarui. Silakan masuk kembali.')
      );
    }catch(error){
      if(error?.expose && Number(error.status)<500){
        return res.redirect(
          '/auth/reset-password?error='+
          encodeURIComponent(error.message)
        );
      }
      return next(error);
    }
  })
);

pageRouter.get('/auth/callback',asyncHandler(page.authCallback));
pageRouter.get('/dashboard',requireAuth,asyncHandler(page.dashboard));
pageRouter.get('/cart',requireAuth,asyncHandler(page.cartPage));
pageRouter.get('/checkout',requireAuth,asyncHandler(page.checkout));
pageRouter.get('/orders',requireAuth,asyncHandler(page.orders));
pageRouter.get('/orders/:id',requireAuth,asyncHandler(page.orderDetail));
pageRouter.get('/history',requireAuth,asyncHandler(page.history));
pageRouter.get('/deposit',requireAuth,asyncHandler(page.deposit));
pageRouter.get('/profile',requireAuth,asyncHandler(page.profilePage));
pageRouter.get('/messages',requireAuth,asyncHandler(page.messagesPage));
pageRouter.get('/messages/:id',requireAuth,asyncHandler(page.messageDetail));
pageRouter.get('/tickets',requireAuth,asyncHandler(page.ticketsPage));
pageRouter.get('/tickets/:id',requireAuth,asyncHandler(page.ticketDetail));
pageRouter.get('/notifications',requireAuth,asyncHandler(page.notificationsPage));
pageRouter.get('/top-order',asyncHandler(page.topOrder));
pageRouter.get('/payment/:id',requireAuth,asyncHandler(page.paymentStatus));
pageRouter.get('/delivery',requireAuth,asyncHandler(page.delivery));

const owner=express.Router(); owner.use(requireAuth,requireOwner);
const ownerSections=['dashboard','products','categories','orders','payments','deposits','users','roles','tickets','messages','services','information','faq','notifications','maintenance','storage','activity','login-history','reports','top-orders','security','refunds','settings','system'];
for(const s of ownerSections){ owner.get('/'+s,asyncHandler(page.ownerPage(s))); }
owner.get('/messages/:id',asyncHandler(page.ownerMessageDetail));
owner.get('/tickets/:id',asyncHandler(page.ownerTicketDetail));
owner.get('/products/create',(req,res)=>res.redirect('/owner/products?create=1'));
owner.get('/',asyncHandler(page.ownerPage('dashboard')));
pageRouter.use('/owner',owner);

const apiRouter=express.Router();
apiRouter.get('/me',requireAuth,asyncHandler(api.authController.me));
apiRouter.post('/auth/register',validate(z.object({email:z.string().email(),password:z.string().min(8),username:z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/)})),asyncHandler(api.authController.register));
apiRouter.post('/auth/login',validate(z.object({email:z.string().email(),password:z.string().min(8)})),asyncHandler(api.authController.login));
apiRouter.post('/auth/logout',requireAuth,asyncHandler(api.authController.logout));
apiRouter.post('/auth/forgot-password',validate(z.object({email:z.string().email()})),asyncHandler(api.authController.resetRequest));
apiRouter.post('/auth/reset-password',requireAuth,validate(z.object({password:z.string().min(8)})),asyncHandler(api.authController.resetPassword));
apiRouter.get('/auth/callback',asyncHandler(api.authController.callback));
apiRouter.get('/products',asyncHandler(api.productController.list));
apiRouter.get('/products/:slug',asyncHandler(api.productController.detail));

apiRouter.post('/products/:id/review',
  requireAuth,
  validate(productReviewSchema),
  asyncHandler(api.productController.review)
);

apiRouter.get('/categories',asyncHandler(api.productController.categories));
apiRouter.post('/cart',requireAuth,validate(z.object({productId:z.string().uuid(),quantity:z.coerce.number().int().min(1).max(100)})),asyncHandler(api.cartController.add));
apiRouter.get('/cart',requireAuth,asyncHandler(api.cartController.get));
const recipientContactSchema=z.object({
  email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),
  countryCode:z.string().trim().regex(/^[A-Za-z]{2}$/).transform(v=>v.toUpperCase()),
  phone:z.string().trim().transform(v=>v.replace(/\D/g,'')).refine(
    v=>/^[1-9]\d{5,13}$/.test(v),
    'Nomor WhatsApp tidak valid.'
  )
});


const pageRecipientContactSchema=recipientContactSchema.extend({
  returnTo:z.string().max(2048).optional()
});

pageRouter.post(
  '/cart/contact',
  requireAuth,
  sensitiveRateLimit(),
  validate(pageRecipientContactSchema),
  asyncHandler(async(req,res)=>{
    const {returnTo,...contact}=req.body;
    await require('../services/cart/cart.service')
      .setContact(req.user.id,contact);

    const destination=
      returnTo==='/cart' ||
      /^\/product\/[a-z0-9-]+$/i.test(String(returnTo||''))
        ? returnTo
        : '/cart';

    return res.redirect(destination);
  })
);

pageRouter.post(
  '/messages',
  requireAuth,
  sensitiveRateLimit(),
  validate(z.object({
    body:z.string().trim().min(1).max(10000),
    returnTo:z.string().max(2048).optional()
  })),
  asyncHandler(async(req,res)=>{
    await require('../services/support/message.service')
      .sendFromUser(req.user.id,req.body.body);

    const destination=
      /^\/messages(?:\/[0-9a-f-]+)?$/i.test(String(req.body.returnTo||''))
        ? req.body.returnTo
        : '/messages';

    return res.redirect(destination);
  })
);

apiRouter.put(
  '/cart/contact',
  requireAuth,
  validate(recipientContactSchema),
  asyncHandler(api.cartController.setContact)
);
apiRouter.put('/cart/:id',requireAuth,validate(z.object({quantity:z.coerce.number().int().min(1).max(100)})),asyncHandler(api.cartController.update));
apiRouter.delete('/cart/:id',requireAuth,asyncHandler(api.cartController.remove));
apiRouter.delete('/cart',requireAuth,asyncHandler(api.cartController.clear));
apiRouter.get('/checkout/preview',requireAuth,asyncHandler(api.orderController.preview));
apiRouter.post('/orders',requireAuth,validate(z.object({paymentMethod:z.enum(['BALANCE','GATEWAY','SANDBOX','LIVE']),idempotencyKey:z.string().min(8).max(100).optional(),returnUrl:z.string().url().optional(),buyNowProductId:z.string().uuid().optional()})),asyncHandler(api.orderController.create));
apiRouter.get('/orders',requireAuth,asyncHandler(api.orderController.list));
apiRouter.get('/orders/:id',requireAuth,asyncHandler(api.orderController.detail));
apiRouter.post('/payment/create',requireAuth,validate(z.object({orderId:z.string().uuid(),returnUrl:z.string().url().optional()})),asyncHandler(api.paymentController.create));
apiRouter.get('/payment/:id',requireAuth,asyncHandler(api.paymentController.status));
apiRouter.post('/deposit',requireAuth,validate(z.object({amount:z.coerce.number().int().min(1000),idempotencyKey:z.string().min(8).max(100).optional(),returnUrl:z.string().url().optional()})),asyncHandler(api.depositController.create));
apiRouter.get('/deposit',requireAuth,asyncHandler(api.depositController.list));
apiRouter.get('/balance',requireAuth,asyncHandler(api.depositController.wallet));
apiRouter.get('/balance/mutations',requireAuth,asyncHandler(api.depositController.mutations));
apiRouter.get('/download/:contentId',requireAuth,asyncHandler(api.deliveryController.access));
apiRouter.get('/profile',requireAuth,asyncHandler(api.profileController.get));
apiRouter.put('/profile',requireAuth,validate(z.object({username:z.string().min(3).max(32).optional(),display_name:z.string().max(80).optional(),phone:z.string().max(30).optional(),bio:z.string().max(500).optional()})),asyncHandler(api.profileController.update));
apiRouter.get('/profile/login-history',requireAuth,asyncHandler(api.profileController.history));
apiRouter.get('/messages',requireAuth,asyncHandler(api.messageController.list));
apiRouter.post('/messages',requireAuth,validate(z.object({body:z.string().min(1).max(10000)})),asyncHandler(api.messageController.create));
apiRouter.get('/messages/:id',requireAuth,asyncHandler(api.messageController.detail));
apiRouter.get('/tickets',requireAuth,asyncHandler(api.ticketController.list));
apiRouter.post('/tickets',requireAuth,validate(z.object({category:z.string().min(2).max(40),subject:z.string().min(3).max(120),priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).optional(),message:z.string().min(2).max(10000)})),asyncHandler(api.ticketController.create));
apiRouter.get('/tickets/:id',requireAuth,asyncHandler(api.ticketController.detail));
apiRouter.post('/tickets/:id/messages',requireAuth,validate(z.object({body:z.string().min(1).max(10000)})),asyncHandler(api.ticketController.reply));
apiRouter.post('/tickets/:id/status',requireAuth,validate(z.object({status:z.enum(['OPEN','WAITING','REPLIED','CLOSED'])})),asyncHandler(api.ticketController.status));
apiRouter.get('/notifications',requireAuth,asyncHandler(api.notificationController.list));
apiRouter.get('/notifications/unread',requireAuth,asyncHandler(api.notificationController.unread));
apiRouter.put('/notifications/read-all',requireAuth,asyncHandler(api.notificationController.readAll));
apiRouter.put('/notifications/:id/read',requireAuth,asyncHandler(api.notificationController.read));
apiRouter.post(
  '/notifications/delete-selected',
  requireAuth,
  validate(
    z.object({
      ids:z.array(z.string().uuid()).min(1).max(100)
    })
  ),
  asyncHandler(api.notificationController.deleteSelected)
);
apiRouter.delete(
  '/notifications',
  requireAuth,
  asyncHandler(api.notificationController.deleteAll)
);
apiRouter.get('/services',asyncHandler(api.serviceController.list));
apiRouter.post('/service-orders',requireAuth,validate(z.object({serviceId:z.string().uuid(),requestData:z.record(z.any()).default({})})),asyncHandler(api.serviceController.order));
apiRouter.get('/faq',asyncHandler(api.contentController.faq));
apiRouter.get('/information',asyncHandler(api.contentController.information));
apiRouter.get('/search',asyncHandler(api.contentController.search));

const ownerApi=express.Router(); ownerApi.use(requireAuth,requireOwner);
ownerApi.get('/dashboard',asyncHandler(api.ownerController.dashboard));
ownerApi.get('/analytics',asyncHandler(api.ownerController.analytics));
ownerApi.get('/top-orders',asyncHandler(api.ownerController.topOrders));
ownerApi.get('/products',asyncHandler(api.ownerController.products));
ownerApi.post('/products',validate(z.object({name:z.string().min(2),slug:z.string().optional(),category_id:z.string().uuid().nullable().optional(),description:z.string().optional(),price:z.coerce.number().int().min(0),stock:z.coerce.number().int().min(0),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']).optional()})),asyncHandler(api.ownerController.productCreate));
ownerApi.put('/products/:id',validate(z.object({name:z.string().min(2).optional(),slug:z.string().optional(),category_id:z.string().uuid().nullable().optional(),description:z.string().optional(),price:z.coerce.number().int().min(0).optional(),stock:z.coerce.number().int().min(0).optional(),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']).optional(),thumbnail_path:z.string().optional()})),asyncHandler(api.ownerController.productUpdate));
ownerApi.post('/products/:id/publish',asyncHandler(api.ownerController.productPublish));
ownerApi.post('/products/:id/unpublish',asyncHandler(api.ownerController.productUnpublish));
ownerApi.post('/products/:id/archive',asyncHandler(api.ownerController.productArchive));
ownerApi.post('/products/:id/duplicate',asyncHandler(api.ownerController.productDuplicate));
ownerApi.delete('/products/:id/delete',asyncHandler(api.ownerController.productDelete));
ownerApi.post('/products/:id/content',validate(ownerProductContentSchema),asyncHandler(api.ownerController.productContent));ownerApi.get('/products/:id/content',asyncHandler(api.ownerController.productContents));
ownerApi.delete('/products/:id/content/:contentId',asyncHandler(api.ownerController.productContentDelete));
ownerApi.post('/products/:id/upload-init',validate(z.object({
  contentType:z.enum(['THUMBNAIL','FILE','IMAGE','VIDEO','AUDIO']),
  originalName:z.string().trim().min(1).max(255),
  mimeType:z.string().trim().min(1).max(160),
  fileSize:z.coerce.number().int().positive()
})),asyncHandler(api.ownerUploadInit));

ownerApi.post('/products/:id/upload-complete',validate(z.object({
  contentType:z.enum(['THUMBNAIL','FILE','IMAGE','VIDEO','AUDIO']),
  path:z.string().min(1).max(500),
  originalName:z.string().trim().min(1).max(255),
  mimeType:z.string().trim().min(1).max(160),
  fileSize:z.coerce.number().int().positive(),
  title:z.string().max(160).optional(),
  description:z.string().max(2000).optional(),
  sortOrder:z.coerce.number().int().min(0).max(10000).optional(),
  isPreview:zBool.optional(),
  accessType:z.enum(['PUBLIC','PREVIEW','PURCHASED']).optional()
})),asyncHandler(api.ownerUploadComplete));
ownerApi.get('/categories',asyncHandler(api.ownerController.categories));
ownerApi.post('/categories',validate(ownerCategorySchema),asyncHandler(api.ownerController.categoryCreate));
ownerApi.put('/categories/:id',validate(ownerCategorySchema),asyncHandler(api.ownerController.categoryUpdate));
ownerApi.delete('/categories/:id',asyncHandler(api.ownerController.categoryDelete));
ownerApi.get('/orders',asyncHandler(api.ownerController.orders));
ownerApi.post('/orders/:id/status',validate(z.object({status:z.enum(['PENDING','PAID','PROCESSING','COMPLETED','CANCELLED'])})),asyncHandler(api.ownerController.orderStatus));
ownerApi.get('/payments',asyncHandler(api.ownerController.payments));
ownerApi.get('/deposits',asyncHandler(api.ownerController.deposits));
ownerApi.get('/users',asyncHandler(api.ownerController.users));
ownerApi.get('/roles',asyncHandler(api.ownerController.roles));
ownerApi.post('/users/:id/ban',asyncHandler(api.ownerController.ban)); ownerApi.post('/users/:id/unban',asyncHandler(api.ownerController.unban)); ownerApi.post('/users/:id/suspend',asyncHandler(api.ownerController.suspend)); ownerApi.post('/users/:id/unsuspend',asyncHandler(api.ownerController.unsuspend)); ownerApi.post('/users/:id/change-role',validate(z.object({role:z.enum(['USER','MODERATOR','ADMIN','OWNER'])})),asyncHandler(api.ownerController.role)); ownerApi.post('/users/:id/reset-sessions',asyncHandler(api.ownerController.resetSessions)); ownerApi.delete('/users/:id',asyncHandler(api.ownerController.deleteUser));
ownerApi.get('/messages',asyncHandler(api.ownerController.messages)); ownerApi.post('/messages/:userId/reply',validate(z.object({body:z.string().min(1).max(10000)})),asyncHandler(api.ownerController.messageReply));
ownerApi.get('/tickets',asyncHandler(api.ownerController.tickets)); ownerApi.post('/tickets/:id/reply',validate(z.object({body:z.string().min(1).max(10000)})),asyncHandler(api.ownerController.ticketReply)); ownerApi.post('/tickets/:id/status',validate(z.object({status:z.enum(['OPEN','WAITING','REPLIED','CLOSED'])})),asyncHandler(api.ownerController.ticketStatus));
ownerApi.get('/services',asyncHandler(api.ownerController.services)); ownerApi.post('/services',validate(ownerServiceSchema),asyncHandler(api.ownerController.serviceCreate)); ownerApi.put('/services/:id',validate(ownerServiceSchema),asyncHandler(api.ownerController.serviceUpdate));
ownerApi.get('/settings',asyncHandler(api.ownerController.settings)); ownerApi.put('/settings',validate(ownerSettingsSchema),asyncHandler(api.ownerController.settingsSave)); ownerApi.get('/maintenance',asyncHandler(api.ownerController.maintenance)); ownerApi.put('/maintenance',validate(ownerMaintenanceSchema),asyncHandler(api.ownerController.maintenanceSave));
ownerApi.get('/storage',asyncHandler(api.ownerController.storage)); ownerApi.get('/system',asyncHandler(api.ownerController.system)); ownerApi.get('/login-history',asyncHandler(api.ownerController.loginHistory));
ownerApi.get('/activity',asyncHandler(api.ownerController.activity)); ownerApi.get('/reports',asyncHandler(api.ownerController.reports)); ownerApi.get('/security',asyncHandler(api.ownerController.security)); ownerApi.get('/faq',asyncHandler(api.ownerController.faq)); ownerApi.post('/faq',validate(ownerFaqSchema),asyncHandler(api.ownerController.faqCreate)); ownerApi.put('/faq/:id',validate(ownerFaqSchema),asyncHandler(api.ownerController.faqUpdate)); ownerApi.get('/information',asyncHandler(api.ownerController.information)); ownerApi.post('/information',validate(ownerInformationSchema),asyncHandler(api.ownerController.informationCreate)); ownerApi.put('/information/:id',validate(ownerInformationSchema),asyncHandler(api.ownerController.informationUpdate)); ownerApi.get('/notifications',asyncHandler(api.ownerController.notifications)); ownerApi.post('/notifications',validate(z.object({user_id:z.string().uuid().nullable().optional(),type:z.enum(['ORDER','PAYMENT','DEPOSIT','TICKET','SYSTEM','PROMOTION']),title:z.string().min(2).max(160),body:z.string().min(2).max(5000),link:z.string().max(500).nullable().optional()})),asyncHandler(api.ownerController.notificationCreate)); ownerApi.post('/notifications/broadcast',validate(z.object({type:z.enum(['SYSTEM','PROMOTION','ORDER','PAYMENT','DEPOSIT','TICKET']),title:z.string().min(2).max(160),body:z.string().min(2).max(5000),link:z.string().max(500).nullable().optional()})),asyncHandler(api.ownerController.notificationBroadcast)); ownerApi.get('/refunds',asyncHandler(api.ownerController.refunds)); ownerApi.post('/refunds/:id',validate(z.object({reason:z.string().min(5).max(500)})),asyncHandler(api.ownerController.refund));
apiRouter.use('/owner',ownerApi);

const cronRouter=express.Router();
cronRouter.get('/expire',cron.requireCronSecret,asyncHandler(cron.expire));

function createWebhookRouter(providerResolver){
  const router=express.Router();

  router.post('/',express.raw({type:'application/json',limit:'1mb'}),asyncHandler(async(req,res)=>{
    const raw=req.body;
    if(!Buffer.isBuffer(raw)){
      throw Object.assign(
        new Error('Raw webhook body is required.'),
        {status:400,code:'INVALID_WEBHOOK_BODY',expose:true}
      );
    }

    const providerName=String(
      typeof providerResolver==='function' ? providerResolver(req) : providerResolver
    ).toLowerCase();

    let payload;
    try{
      payload=JSON.parse(raw.toString('utf8'));
    }catch{
      throw Object.assign(
        new Error('Invalid webhook JSON'),
        {status:400,code:'INVALID_WEBHOOK_JSON',expose:true}
      );
    }

    let signature;
    if(providerName==='buatqris'){
      const headerEvent=String(req.get('X-BuatQris-Event')||'').trim().toLowerCase();
      const bodyEvent=String(payload.event||'').trim().toLowerCase();
      const delivery=String(req.get('X-BuatQris-Delivery')||'').trim();
      const bodyDelivery=String(
        payload.transaction_id||payload.withdrawal_id||''
      ).trim();

      if(!headerEvent || headerEvent!==bodyEvent){
        throw Object.assign(
          new Error('BuatQris event header does not match webhook body.'),
          {status:400,code:'BUATQRIS_EVENT_MISMATCH',expose:true}
        );
      }

      if(!delivery || delivery!==bodyDelivery){
        throw Object.assign(
          new Error('BuatQris delivery header does not match transaction reference.'),
          {status:400,code:'BUATQRIS_DELIVERY_MISMATCH',expose:true}
        );
      }

      signature=String(req.get('X-BuatQris-Signature')||'');
    }else{
      const configuredHeader=String(
        loadEnv().PAYMENT_WEBHOOK_SIGNATURE_HEADER||'x-signature'
      ).toLowerCase();
      signature=req.headers['x-callback-token']||req.headers[configuredHeader]||'';
    }

    const out=await require('../services/payment/payment.service')
      .processWebhook(raw,signature,payload,providerName);

    if (
      providerName === 'buatqris' &&
      out?.retry === true &&
      out?.reason === 'PAYMENT_REFERENCE_NOT_READY'
    ) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({
        success: false,
        error: {
          code: 'PAYMENT_REFERENCE_NOT_READY',
          message: 'Payment reference is not ready; retry webhook delivery.'
        },
        requestId: req.id
      });
    }

    return ok(res,out);
  }));

  return router;
}

const webhookRouter=createWebhookRouter(
  ()=>String(loadEnv().PAYMENT_PROVIDER||'generic-json').toLowerCase()
);

// Keep the existing callback URL available for transactions created by Xendit.
const buatQrisWebhookRouter=createWebhookRouter('buatqris');
const legacyXenditWebhookRouter=createWebhookRouter('xendit');

module.exports={
  apiRouter,
  pageRouter,
  cronRouter,
  webhookRouter,
  legacyXenditWebhookRouter,
  buatQrisWebhookRouter,
};
