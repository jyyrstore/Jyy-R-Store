const {requestPath}=require('../utils/request-path');
const products = require('../services/product/product.service');
const categories = require('../repositories/categories.repository');
const services = require('../services/service/service.service');
const notifications = require('../services/notification/notification.service');
const profile = require('../services/profile/profile.service');
const orderService = require('../services/order/order.service');
const cart = require('../services/cart/cart.service');
const wallet = require('../services/wallet/wallet.service');
const tickets = require('../services/support/ticket.service');
const faqRepo = require('../repositories/faq.repository');
const infoRepo = require('../repositories/information.repository');
const analytics = require('../services/analytics/analytics.service');
const settings = require('../services/settings/settings.service');
const { query } = require('../config/database');
const { isConfigured, loadEnv } = require('../config/env');
const storage = require('../config/storage');
const auth = require('../services/auth/auth.service');
const messages = require('../services/support/message.service');
const {safeNextPath}=require('../utils/url');
const {setAuthSession}=require('../utils/auth-session');
const {pageParams,paginationUrl}=require('../utils/pagination');
const {paginationMeta}=require('../utils/pagination-meta');

const OWNER_PAGE_SIZE=10;

function ownerPager(req){
  return pageParams({
    page:req.query.page,
    limit:OWNER_PAGE_SIZE
  });
}

function base(req, extra={}) {
  return {
    title:"Jyy'R Store",
    req,
    csrfToken:req.csrfToken?.() || null,
    paginationUrl:(param,page,query={})=>
      paginationUrl(req,param,page,query),
    ...extra
  };
}
function configurationPage(req,res) {
  const env = loadEnv();
  return res.status(503).render('app', base(req, { title:'Configuration Required', view:'pages/configuration', configured:false, env:{nodeEnv:env.NODE_ENV, appUrl:env.APP_URL} }));
}
async function home(req,res,next){
  if(!isConfigured()) return configurationPage(req,res);
  try {
    const [cat,latest,service,ann] = await Promise.all([
      categories.list(true), products.catalog({limit:8,sort:'newest'}), services.list(true), infoRepo.listPublic()
    ]);
    latest.items=latest.items.map(p=>({...p,thumbnail_url:p.thumbnail_path?storage.publicUrl(loadEnv().PUBLIC_ASSET_BUCKET,p.thumbnail_path):null}));
    res.render('app', base(req,{view:'pages/home',categories:cat,products:latest.items,services:service.slice(0,6),announcements:ann.slice(0,5)}));
  } catch(e){ next(e); }
}
async function store(req,res,next){
  try{
    const data=await products.catalog({
      ...req.query,
      limit:20
    });

    data.items=data.items.map(p=>({
      ...p,
      thumbnail_url:p.thumbnail_path
        ? storage.publicUrl(
            loadEnv().PUBLIC_ASSET_BUCKET,
            p.thumbnail_path
          )
        : null
    }));

    res.render(
      'app',
      base(req,{
        view:'pages/store',
        ...data,
        storePagination:
          paginationMeta(
            data.total,
            data.page,
            data.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

async function productDetail(req,res,next){ try { const product=await products.detailBySlug(req.params.slug,req.user?.id); if(product.thumbnail_path) product.thumbnail_url=storage.publicUrl(loadEnv().PUBLIC_ASSET_BUCKET,product.thumbnail_path); res.render('app',base(req,{view:'pages/product-detail',product})); } catch(e){next(e)} }
async function dashboard(req,res,next){ try { const [p,n,c,o,s] = await Promise.all([profile.get(req.user.id),notifications.list(req.user.id),cart.get(req.user.id),orderService.getUserOrders(req.user.id,{limit:5}),services.list(true)]); const mut=await wallet.mutations(req.user.id); res.render('app',base(req,{view:'pages/dashboard',profile:p,notifications:n.slice(0,6),cart:c,orders:o,mutations:mut.slice(0,6),services:s.slice(0,4)})); } catch(e){next(e)} }
async function cartPage(req,res,next){ try { res.render('app',base(req,{view:'pages/cart',cart:await cart.get(req.user.id)})); } catch(e){next(e)} }
async function checkout(req,res,next){
  try{
    const preview=await orderService.preview(req.user.id);
    const walletState=await wallet.get(req.user.id);
    const walletSufficient=
      Number(walletState?.balance||0)>=Number(preview.total||0);

    const requested=String(req.query.payment||'').toUpperCase();

    const selectedPaymentMethod=
      requested==='GATEWAY'
        ? 'GATEWAY'
        : walletSufficient
          ? 'BALANCE'
          : 'GATEWAY';

    res.render(
      'app',
      base(req,{
        view:'pages/checkout',
        preview,
        wallet:walletState,
        walletSufficient,
        selectedPaymentMethod
      })
    );
  }catch(e){
    next(e);
  }
}
async function orders(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const ordersRepo=require('../repositories/orders.repository');

    const [items,total]=await Promise.all([
      orderService.getUserOrders(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      ordersRepo.countForUser(req.user.id)
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/orders',
        orders:items,
        ordersPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

async function orderDetail(req,res,next){
  try{
    const order=await require('../repositories/orders.repository').findForUser(
      req.params.id,
      req.user.id
    );

    if(!order){
      const e=new Error('Order not found.');
      e.status=404;
      e.expose=true;
      throw e;
    }

    const productRepo=require('../repositories/products.repository');
    const accessControl=require('../services/delivery/access-control.service');

    const items=await Promise.all(
      order.items.map(async item=>{
        const [contents,owned]=await Promise.all([
          productRepo.contents(item.product_id),
          accessControl.canAccess(req.user.id,item.product_id)
        ]);

        const mappedContents=await Promise.all(
          contents.map(async content=>{
            const allowed=
              content.access_type==='PUBLIC' ||
              (content.access_type==='PREVIEW' && content.is_preview) ||
              owned;

            let preview_url=null;

            if(allowed && content.storage_path){
              const bucket=
                content.storage_path.startsWith('public-assets/')
                  ? loadEnv().PUBLIC_ASSET_BUCKET
                  : loadEnv().PRIVATE_PRODUCT_BUCKET;

              preview_url=await storage.signedUrl(
                bucket,
                content.storage_path.replace(/^public-assets\//,''),
                loadEnv().SIGNED_URL_EXPIRATION
              ).catch(()=>null);
            }

            return {
              ...content,
              allowed,
              preview_url
            };
          })
        );

        return {
          ...item,
          contents:mappedContents
        };
      })
    );

    const viewOrder={
      ...order,
      items
    };

    res.render(
      'app',
      base(req,{
        view:'pages/order-detail',
        order:viewOrder
      })
    );
  }catch(e){
    next(e);
  }
}

async function history(req,res,next){
  try{
    const orderPager=pageParams({
      page:req.query.ordersPage,
      limit:5
    });

    const mutationPager=pageParams({
      page:req.query.mutationsPage,
      limit:5
    });

    const [
      orders,
      orderTotal,
      mutations,
      mutationTotal
    ]=await Promise.all([
      orderService.getUserOrders(
        req.user.id,
        {
          limit:orderPager.limit,
          offset:orderPager.offset
        }
      ),
      require('../repositories/orders.repository')
        .countForUser(req.user.id),
      wallet.mutations(
        req.user.id,
        mutationPager.limit,
        mutationPager.offset
      ),
      wallet.countMutations(
        req.user.id
      )
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/history',
        orders,
        mutations,
        activeHistoryTab:
          req.query.tab==='mutations'
            ? 'mutations'
            : 'orders',
        ordersPagination:
          paginationMeta(
            orderTotal,
            orderPager.page,
            orderPager.limit
          ),
        mutationsPagination:
          paginationMeta(
            mutationTotal,
            mutationPager.page,
            mutationPager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}
async function deposit(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const depositsRepo=require('../repositories/deposits.repository');
    const depositService=require('../services/deposit/deposit.service');

    const [w,deposits,total]=await Promise.all([
      wallet.get(req.user.id),
      depositService.list(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      depositsRepo.countForUser(req.user.id)
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/deposit',
        wallet:w,
        deposits,
        depositsPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

async function profilePage(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.loginPage,
      limit:5
    });

    const [
      p,
      history,
      total
    ]=await Promise.all([
      profile.get(req.user.id),
      profile.loginHistory(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      profile.countLoginHistory(
        req.user.id
      )
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/profile',
        profile:p,
        loginHistory:history,
        loginPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}
async function messagesPage(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const messageRepo=require('../repositories/messages.repository');

    const [items,total]=await Promise.all([
      messages.list(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      messageRepo.countForUser(req.user.id)
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/messages',
        messages:items,
        messagesPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

async function messageDetail(req,res,next){try{const m=await messages.detail(req.params.id,req.user.id);if(!m){const e=new Error('Message not found.');e.status=404;e.expose=true;throw e;}res.render('app',base(req,{view:'pages/message-detail',message:m}));}catch(e){next(e)}}
async function ticketsPage(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const ticketRepo=require('../repositories/tickets.repository');

    const [items,total]=await Promise.all([
      tickets.list(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      ticketRepo.countForUser(req.user.id)
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/tickets',
        tickets:items,
        ticketsPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

async function ticketDetail(req,res,next){try{const t=await tickets.detail(req.params.id,req.user.id);if(!t){const e=new Error('Ticket not found.');e.status=404;e.expose=true;throw e;}res.render('app',base(req,{view:'pages/ticket-detail',ticket:t}));}catch(e){next(e)}}
async function notificationsPage(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const [
      items,
      total
    ]=await Promise.all([
      notifications.list(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      notifications.count(
        req.user.id
      )
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/notifications',
        notifications:items,
        notificationsPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}
async function servicesPage(req,res,next){try{res.render('app',base(req,{view:'pages/services',services:await services.list(true)}));}catch(e){next(e)}}
async function topOrder(req,res,next){try{const data=(await analytics.period('30d')).top;res.render('app',base(req,{view:'pages/top-order',items:data}));}catch(e){next(e)}}
async function faq(req,res,next){try{res.render('app',base(req,{view:'pages/faq',faqs:await faqRepo.listPublic()}));}catch(e){next(e)}}
async function security(req,res){res.render('app',base(req,{view:'pages/security'}))}
async function legal(req,res){const titles={privacy:'Privacy Policy',terms:'Terms of Service',refund:'Refund Policy'}; res.render('app',base(req,{view:'pages/legal',legalKey:requestPath(req).slice(1),legalTitle:titles[requestPath(req).slice(1)]||'Policy'}))}
async function search(req,res,next){try{res.render('app',base(req,{view:'pages/search',q:req.query.q||'',results:null}));}catch(e){next(e)}}
async function login(req,res){res.render('app',base(req,{view:'pages/auth',mode:'login',error:req.query.error||''}))}
async function register(req,res){res.render('app',base(req,{view:'pages/auth',mode:'register',error:req.query.error||''}))}
async function forgotPassword(req,res){res.render('app',base(req,{view:'pages/auth',mode:'forgot',error:req.query.error||''}))}
async function resetPassword(req,res){res.render('app',base(req,{view:'pages/auth',mode:'reset',error:req.query.error||''}))}
async function authCallback(req,res,next){ try { if(!req.query.code) return res.redirect('/auth/login?error=Kode autentikasi tidak tersedia.'); const d=await auth.exchangeCode(req.query.code); await setAuthSession(req,d); return res.redirect(safeNextPath(req.query.next)); } catch(e){ return next(e); } }
async function paymentStatus(req,res,next){try{const p=await require('../services/payment/payment.service').getStatus(req.params.id,req.user.id);res.render('app',base(req,{view:'pages/payment',payment:p}));}catch(e){next(e)}}
async function delivery(req,res,next){
  try{
    const pager=pageParams({
      page:req.query.page,
      limit:5
    });

    const deliveryRepo=require('../repositories/delivery.repository');

    const [entitlements,total]=await Promise.all([
      deliveryRepo.entitlements(
        req.user.id,
        {
          limit:pager.limit,
          offset:pager.offset
        }
      ),
      deliveryRepo.countEntitlements(req.user.id)
    ]);

    res.render(
      'app',
      base(req,{
        view:'pages/delivery',
        entitlements:entitlements||[],
        deliveryPagination:
          paginationMeta(
            total,
            pager.page,
            pager.limit
          )
      })
    );
  }catch(e){
    next(e);
  }
}

function ownerPage(section){
  return async (req,res,next)=>{
    try{
      let data={};
      if(section==='dashboard'){
        const [dashboardData,analyticsData]=await Promise.all([
          analytics.dashboard(),
          analytics.period(
            req.query.period||'30d',
            req.query.from,
            req.query.to
          )
        ]);

        data.dashboard=dashboardData;
        data.analytics=analyticsData;
      }
      else if(section==='products'){
        const repo=require('../repositories/products.repository');
        const pager=ownerPager(req);

        data.items=await repo.adminList({
          ...req.query,
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAdmin(req.query);

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );

        data.categories=await categories.list(false);
      }

      else if(section==='categories'){ data.items=await categories.list(false); }
      else if(section==='orders'){
        const repo=require('../repositories/orders.repository');
        const pager=ownerPager(req);

        data.items=await repo.adminList({
          ...req.query,
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAdmin(req.query);

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='payments'){
        const repo=require('../repositories/payments.repository');
        const pager=ownerPager(req);

        data.items=await repo.list({
          ...req.query,
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAdmin(req.query);

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='deposits'){
        const repo=require('../repositories/deposits.repository');
        const pager=ownerPager(req);

        data.items=await repo.adminList({
          ...req.query,
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAdmin(req.query);

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='refunds'){
        const repo=require('../repositories/refunds.repository');
        const pager=ownerPager(req);

        data.items=await repo.list({
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.count();

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='users'){
        const repo=require('../repositories/users.repository');
        const pager=ownerPager(req);

        const filters={
          search:req.query.search||'',
          role:req.query.role||'',
          status:req.query.status||'',
          limit:pager.limit,
          offset:pager.offset
        };

        const [items,total]=await Promise.all([
          repo.list(filters),
          repo.count(filters)
        ]);

        data.items=items;

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='roles'){ data.items=await require('../repositories/roles.repository').list(); }
      else if(section==='messages'){
        const repo=require('../repositories/messages.repository');
        const pager=ownerPager(req);

        data.items=await repo.listAll({
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAll();

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='tickets'){
        const repo=require('../repositories/tickets.repository');
        const pager=ownerPager(req);

        data.items=await repo.adminList(
          req.query.status,
          {
            limit:pager.limit,
            offset:pager.offset
          }
        );

        const total=await repo.countAdmin(
          req.query.status
        );

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='activity'){
        const repo=require('../repositories/audit.repository');
        const pager=ownerPager(req);

        data.items=await repo.list(
          pager.limit,
          pager.offset
        );

        const total=await repo.count();

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='services'){ data.items=await services.list(false); }
      else if(section==='settings'){ data.items=await settings.ownerSettings(); data.maintenance=await settings.maintenance(); }
      else if(section==='maintenance'){ data.maintenance=await settings.maintenance(); }
      else if(section==='notifications'){
        const repo=require('../repositories/notification.repository');
        const pager=ownerPager(req);

        data.items=await repo.adminList({
          limit:pager.limit,
          offset:pager.offset
        });

        const total=await repo.countAdmin();

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='reports'){ data.analytics=await analytics.period(req.query.period||'30d',req.query.from,req.query.to); }
      else if(section==='top-orders'){ data.items=(await analytics.period(req.query.period||'30d',req.query.from,req.query.to)).top; }
      else if(section==='security'||section==='login-history'){
        const pager=ownerPager(req);

        data.logins=(
          await query(
            'select * from login_history order by created_at desc limit $1 offset $2',
            [pager.limit,pager.offset]
          )
        ).rows;

        const total=Number(
          (
            await query(
              'select count(*)::int count from login_history'
            )
          ).rows[0].count
        );

        data.ownerPagination=
          paginationMeta(
            total,
            pager.page,
            pager.limit
          );
      }

      else if(section==='storage'){ data.storage={publicBucket:loadEnv().PUBLIC_ASSET_BUCKET,privateBucket:loadEnv().PRIVATE_PRODUCT_BUCKET,userBucket:loadEnv().USER_UPLOAD_BUCKET}; }
      else if(section==='system'){ data.system={node:process.version,environment:loadEnv().NODE_ENV,uptime:process.uptime(),configured:isConfigured()}; }
      else if(section==='faq'){ data.items=await faqRepo.listAll(); }
      else if(section==='information'){ data.items=await infoRepo.listAll(); }
      res.render('app',base(req,{view:'owner/index',ownerSection:section,...data}));
    }catch(e){next(e)}
  }
}
module.exports={home,store,productDetail,dashboard,cartPage,checkout,orders,orderDetail,history,deposit,profilePage,messagesPage,messageDetail,ticketsPage,ticketDetail,notificationsPage,servicesPage,topOrder,faq,security,legal,search,login,register,forgotPassword,resetPassword,authCallback,paymentStatus,delivery,ownerPage,configurationPage};
