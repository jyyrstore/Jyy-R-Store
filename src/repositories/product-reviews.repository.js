const {query}=require('../config/database');
const {badRequest,forbidden,notFound}=require('../utils/error');

const PURCHASE_STATUSES=['PAID','PROCESSING','COMPLETED'];

function safeLimit(value,fallback=5){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(100,Math.max(1,n));
}

function safeOffset(value){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n)) return 0;
  return Math.min(1000000,Math.max(0,n));
}

function normalizeInput({rating,comment}={}){
  const numericRating=Number(rating);
  if(!Number.isInteger(numericRating)||numericRating<1||numericRating>5){
    throw badRequest(
      'INVALID_REVIEW_RATING',
      'Rating harus berupa angka 1 sampai 5.'
    );
  }

  const normalizedComment=String(comment||'').trim();

  if(!normalizedComment||normalizedComment.length>2000){
    throw badRequest(
      'INVALID_REVIEW_COMMENT',
      'Komentar ulasan wajib diisi dan maksimal 2000 karakter.'
    );
  }

  return {
    rating:numericRating,
    comment:normalizedComment
  };
}

async function productExists(productId){
  return Boolean(
    (
      await query(
        "select 1 from products where id=$1 and status='PUBLISHED'",
        [productId]
      )
    ).rowCount
  );
}

async function hasPurchase(productId,userId){
  return Boolean(
    (
      await query(
        `select 1
         from order_items oi
         join orders o on o.id=oi.order_id
         where oi.product_id=$1
           and o.user_id=$2
           and o.status=any($3::order_status[])
         limit 1`,
        [productId,userId,PURCHASE_STATUSES]
      )
    ).rowCount
  );
}

async function canReview(productId,userId){
  if(!userId)return false;
  if(!(await productExists(productId)))return false;
  return hasPurchase(productId,userId);
}

async function findForUser(productId,userId){
  return (
    await query(
      `select id,product_id,user_id,rating,comment,created_at,updated_at
       from product_reviews
       where product_id=$1 and user_id=$2
       limit 1`,
      [productId,userId]
    )
  ).rows[0]||null;
}

async function viewerState(productId,userId){
  if(!userId){
    return {review:null,canReview:false};
  }

  const [review,eligible]=await Promise.all([
    findForUser(productId,userId),
    canReview(productId,userId)
  ]);

  return {
    review,
    canReview:eligible
  };
}

async function listForProduct(productId,{limit=5,offset=0}={}){
  const lim=safeLimit(limit,5);
  const off=safeOffset(offset);

  return (
    await query(
      `select
         pr.id,
         pr.product_id,
         pr.rating,
         pr.comment,
         pr.created_at,
         pr.updated_at,
         p.username,
         p.display_name,
         purchase.purchase_at
       from product_reviews pr
       join profiles p on p.id=pr.user_id
       join products product on product.id=pr.product_id
       left join lateral (
         select coalesce(
           o.completed_at,
           o.paid_at,
           o.created_at
         ) purchase_at
         from order_items oi
         join orders o on o.id=oi.order_id
         where oi.product_id=pr.product_id
           and o.user_id=pr.user_id
           and o.status=any($2::order_status[])
         order by coalesce(
           o.completed_at,
           o.paid_at,
           o.created_at
         ) desc
         limit 1
       ) purchase on true
       where pr.product_id=$1
         and product.status='PUBLISHED'
       order by pr.created_at desc
       limit $3
       offset $4`,
      [
        productId,
        PURCHASE_STATUSES,
        lim,
        off
      ]
    )
  ).rows;
}

async function countForProduct(productId){
  return Number(
    (
      await query(
        `select count(*)::int count
         from product_reviews pr
         join products p on p.id=pr.product_id
         where pr.product_id=$1
           and p.status='PUBLISHED'`,
        [productId]
      )
    ).rows[0].count
  );
}

async function summaryForProduct(productId){
  const row=(
    await query(
      `select
         count(*)::int review_count,
         round(coalesce(avg(rating),0),1)::numeric average_rating,
         count(*) filter(where rating=5)::int five_star,
         count(*) filter(where rating=4)::int four_star,
         count(*) filter(where rating=3)::int three_star,
         count(*) filter(where rating=2)::int two_star,
         count(*) filter(where rating=1)::int one_star
       from product_reviews pr
       join products p on p.id=pr.product_id
       where pr.product_id=$1
         and p.status='PUBLISHED'`,
      [productId]
    )
  ).rows[0]||{};

  return {
    reviewCount:Number(row.review_count||0),
    averageRating:Number(row.average_rating||0),
    distribution:{
      5:Number(row.five_star||0),
      4:Number(row.four_star||0),
      3:Number(row.three_star||0),
      2:Number(row.two_star||0),
      1:Number(row.one_star||0)
    }
  };
}

async function upsertForBuyer(productId,userId,input){
  const normalized=normalizeInput(input);

  if(!(await productExists(productId))){
    throw notFound('Product not found.');
  }

  if(!(await hasPurchase(productId,userId))){
    throw forbidden(
      'Ulasan hanya dapat diberikan setelah pembelian terkonfirmasi.'
    );
  }

  return (
    await query(
      `insert into product_reviews(
         product_id,user_id,rating,comment
       )
       values($1,$2,$3,$4)
       on conflict(product_id,user_id)
       do update set
         rating=excluded.rating,
         comment=excluded.comment,
         updated_at=now()
       returning
         id,product_id,user_id,rating,comment,created_at,updated_at`,
      [
        productId,
        userId,
        normalized.rating,
        normalized.comment
      ]
    )
  ).rows[0];
}

module.exports={
  listForProduct,
  countForProduct,
  summaryForProduct,
  findForUser,
  viewerState,
  canReview,
  upsertForBuyer
};
