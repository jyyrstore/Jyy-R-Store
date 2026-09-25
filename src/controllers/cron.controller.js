const crypto = require('crypto');
const { loadEnv } = require('../config/env');
const { query } = require('../config/database');
const storage = require('../config/storage');
const { log } = require('../config/logging');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireCronSecret(req, res, next) {
  const secret = String(loadEnv().CRON_SECRET || '');
  if (!secret) {
    return res.status(503).json({
      success: false,
      error: { code: 'CRON_SECRET_NOT_CONFIGURED', message: 'Cron endpoint is not configured.' }
    });
  }

  const authorization = String(req.get('authorization') || '');
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const supplied = bearer || String(req.get('x-cron-secret') || '');

  if (!safeEqual(supplied, secret)) {
    return res.status(401).json({
      success: false,
      error: { code: 'CRON_UNAUTHORIZED', message: 'Cron authorization is invalid.' }
    });
  }

  return next();
}


const PRODUCT_UPLOAD_GRACE_MS=6*60*60*1000;
const PRODUCT_FOLDER_PAGE_SIZE=1000;
const PRODUCT_FILE_PAGE_SIZE=1000;
const MAX_ORPHAN_REMOVALS_PER_RUN=50;

const PRODUCT_FOLDER_RE=/^[0-9a-f-]{36}$/i;

const PRODUCT_FILE_RE=
  /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm|mov|mp3|wav|ogg|m4a|zip|pdf)$/i;

async function cleanupProductUploadOrphans(){
  const env=loadEnv();

  const [
    contentRefs,
    thumbnailRefs
  ]=await Promise.all([
    query(
      `select storage_path
       from product_contents
       where storage_path is not null`
    ),
    query(
      `select thumbnail_path
       from products
       where thumbnail_path is not null`
    )
  ]);

  const privateRefs=new Set(
    contentRefs.rows
      .map(row=>String(row.storage_path||''))
      .filter(
        path=>
          Boolean(path) &&
          !path.startsWith('public-assets/')
      )
  );

  const publicRefs=new Set([
    ...thumbnailRefs.rows
      .map(row=>String(row.thumbnail_path||''))
      .filter(Boolean),

    ...contentRefs.rows
      .map(row=>String(row.storage_path||''))
      .filter(
        path=>
          path.startsWith('public-assets/')
      )
      .map(
        path=>
          path.replace(/^public-assets\//,'')
      )
      .filter(Boolean)
  ]);

  const cutoff=
    Date.now()-PRODUCT_UPLOAD_GRACE_MS;

  let scanned=0;
  let removed=0;
  let skipped=0;

  async function cleanupBucket(bucket,refs){
    let folderOffset=0;

    while(
      removed<
      MAX_ORPHAN_REMOVALS_PER_RUN
    ){
      const folders=
        await storage.listObjects(
          bucket,
          'products',
          {
            limit:PRODUCT_FOLDER_PAGE_SIZE,
            offset:folderOffset,
            sortBy:{
              column:'name',
              order:'asc'
            }
          }
        );

      if(!folders.length)break;

      const productFolders=
        folders.filter(
          item=>
            item &&
            item.id===null &&
            PRODUCT_FOLDER_RE.test(
              String(item.name||'')
            )
        );

      for(const folder of productFolders){
        if(
          removed>=
          MAX_ORPHAN_REMOVALS_PER_RUN
        )break;

        const folderName=
          String(folder.name);

        let fileOffset=0;

        while(
          removed<
          MAX_ORPHAN_REMOVALS_PER_RUN
        ){
          const files=
            await storage.listObjects(
              bucket,
              `products/${folderName}`,
              {
                limit:PRODUCT_FILE_PAGE_SIZE,
                offset:fileOffset,
                sortBy:{
                  column:'created_at',
                  order:'asc'
                }
              }
            );

          if(!files.length)break;

          const candidates=[];

          for(const file of files){
            if(!file || file.id===null){
              continue;
            }

            const name=
              String(file.name||'');

            if(!PRODUCT_FILE_RE.test(name)){
              skipped++;
              continue;
            }

            const objectPath=
              `products/${folderName}/${name}`;

            scanned++;

            if(refs.has(objectPath)){
              continue;
            }

            const createdAt=
              Date.parse(
                String(
                  file.created_at||
                  file.updated_at||
                  ''
                )
              );

            if(
              !Number.isFinite(createdAt) ||
              createdAt>cutoff
            ){
              skipped++;
              continue;
            }

            candidates.push(objectPath);

            if(
              candidates.length>=
              MAX_ORPHAN_REMOVALS_PER_RUN-removed
            ){
              break;
            }
          }

          let removedFromPage=0;

          for(const objectPath of candidates){
            try{
              await storage.remove(
                bucket,
                objectPath
              );

              removed++;
              removedFromPage++;
            }catch(error){
              log(
                'warn',
                'product_orphan_cleanup_failed',
                {
                  bucket,
                  path:objectPath,
                  message:
                    error?.message||
                    String(error)
                }
              );
            }

            if(
              removed>=
              MAX_ORPHAN_REMOVALS_PER_RUN
            ){
              break;
            }
          }

          if(
            removed>=
            MAX_ORPHAN_REMOVALS_PER_RUN
          ){
            break;
          }

          /*
           * Deleting files changes the next page's offset.
           * Restart from offset 0 after any successful deletion
           * so no object can be skipped.
           */
          if(removedFromPage>0){
            fileOffset=0;
            continue;
          }

          if(
            files.length<
            PRODUCT_FILE_PAGE_SIZE
          ){
            break;
          }

          fileOffset+=files.length;
        }
      }

      if(
        folders.length<
        PRODUCT_FOLDER_PAGE_SIZE
      ){
        break;
      }

      folderOffset+=folders.length;
    }
  }

  await cleanupBucket(
    env.PRIVATE_PRODUCT_BUCKET,
    privateRefs
  );

  if(
    removed<
    MAX_ORPHAN_REMOVALS_PER_RUN
  ){
    await cleanupBucket(
      env.PUBLIC_ASSET_BUCKET,
      publicRefs
    );
  }

  return {
    scanned,
    removed,
    skipped,
    graceHours:6,
    maxRemovalsPerRun:
      MAX_ORPHAN_REMOVALS_PER_RUN
  };
}

async function expire(req, res) {
  const paymentExpiration = require('../jobs/payment-expiration.job');
  const depositExpiration = require('../jobs/deposit-expiration.job');

  const [payments, deposits] = await Promise.all([
    paymentExpiration.run(),
    depositExpiration.run()
  ]);

  let productUploads={
    scanned:0,
    removed:0,
    skipped:0,
    graceHours:6,
    maxRemovalsPerRun:MAX_ORPHAN_REMOVALS_PER_RUN
  };

  try{
    productUploads=
      await cleanupProductUploadOrphans();
  }catch(error){
    log(
      'warn',
      'product_orphan_cleanup_unavailable',
      {
        message:
          error?.message||
          String(error)
      }
    );
  }

  return res.json({
    success: true,
    payments,
    deposits,
    productUploads,
    requestId: req.id
  });
}

module.exports = { requireCronSecret, expire };
