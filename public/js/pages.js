(function(){
  const api=window.JYYRApi,toast=window.JYYRToast;
  const money=v=>window.JYYR.formatIDR(v), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const csrf=()=>window.JYYR?.csrf||'';

  async function hydrateCartBadge(){
    const badges=[...document.querySelectorAll('[data-cart-badge]')];

    if(!badges.length||!api?.request)return;

    try{
      const cart=await api.request('/api/cart');
      const count=(cart?.items||[]).reduce(
        (sum,item)=>sum+Number(item.quantity||0),
        0
      );

      badges.forEach(badge=>{
        badge.textContent=count>99?'99+':String(count);
        badge.hidden=count<=0;
      });
    }catch{
      badges.forEach(badge=>{ badge.hidden=true; });
    }
  }

  async function hydrateNotificationBadge(){
    const badges=[...document.querySelectorAll('[data-notification-badge]')];

    if(!badges.length||!api?.request)return;

    try{
      const result=await api.request('/api/notifications/unread');
      const count=Number(result?.count||0);

      badges.forEach(badge=>{
        badge.textContent=count>99?'99+':String(count);
        badge.hidden=count<=0;
      });
    }catch{
      badges.forEach(badge=>{ badge.hidden=true; });
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener(
      'DOMContentLoaded',
      ()=>{
        hydrateCartBadge();
        hydrateNotificationBadge();
      },
      {once:true}
    );
  }else{
    hydrateCartBadge();
    hydrateNotificationBadge();
  }
  const svg=name=>({plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',x:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',package:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.5 9.4-9-5.1M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>'}[name]||'');

  async function ownerAction(url,body={},method='POST',ok='Selesai'){const r=await api.request(url,{method,body});toast.success(ok);return r;}
  let tusLoaderPromise=null;

  function uploadSignedFile(file,signedUrl,{progressEl=null,statusEl=null}={}){
    return new Promise((resolve,reject)=>{
      if(!signedUrl){
        reject(new Error('Signed upload URL tidak tersedia.'));
        return;
      }

      const xhr=new XMLHttpRequest();

      xhr.open('PUT',signedUrl,true);
      xhr.withCredentials=false;
      xhr.timeout=15*60*1000;

      if(file.type){
        xhr.setRequestHeader(
          'content-type',
          file.type
        );
      }

      xhr.upload.onprogress=e=>{
        if(!e.lengthComputable)return;

        const pct=Math.round(
          (e.loaded/e.total)*100
        );

        if(progressEl){
          progressEl.hidden=false;
          progressEl.value=pct;
        }

        if(statusEl){
          statusEl.textContent=
            `Mengunggah… ${pct}% · `+
            `${(e.loaded/1024/1024).toFixed(1)} / `+
            `${(e.total/1024/1024).toFixed(1)} MB`;
        }
      };

      xhr.onload=()=>{
        if(xhr.status>=200 && xhr.status<300){
          if(progressEl){
            progressEl.hidden=false;
            progressEl.value=100;
          }

          if(statusEl){
            statusEl.textContent=
              'Upload Storage selesai. Menyimpan metadata…';
          }

          resolve();
          return;
        }

        reject(
          new Error(
            `Upload Storage gagal (${xhr.status}).`
          )
        );
      };

      xhr.onerror=()=>{
        reject(
          new Error(
            'Koneksi ke Storage terputus saat upload.'
          )
        );
      };

      xhr.ontimeout=()=>{
        reject(
          new Error(
            'Upload Storage timeout. Periksa koneksi lalu coba lagi.'
          )
        );
      };

      xhr.onabort=()=>{
        reject(
          new Error(
            'Upload dibatalkan.'
          )
        );
      };

      xhr.send(file);
    });
  }

  function loadTus(){
    if(window.tus?.Upload)return Promise.resolve(window.tus);
    if(tusLoaderPromise)return tusLoaderPromise;

    tusLoaderPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tus-js-client@4/dist/tus.min.js';
      script.async=true;

      script.onload=()=>{
        if(window.tus?.Upload)resolve(window.tus);
        else reject(new Error('Library upload resumable gagal dimuat.'));
      };

      script.onerror=()=>{
        reject(new Error('Library upload resumable gagal dimuat.'));
      };

      document.head.appendChild(script);
    });

    return tusLoaderPromise;
  }

  async function uploadOwnerFile(productId,file,{contentType='THUMBNAIL',progressEl=null,statusEl=null,meta={}}={}){
    if(!file)return null;

    const init=await api.request(
      '/api/owner/products/'+encodeURIComponent(productId)+'/upload-init',
      {
        method:'POST',
        body:{
          contentType,
          originalName:file.name||'file',
          mimeType:file.type||'application/octet-stream',
          fileSize:file.size
        }
      }
    );

    if(progressEl){
      progressEl.hidden=false;
      progressEl.value=0;
    }

    if(statusEl){
      statusEl.textContent='Menyiapkan upload langsung ke Storage…';
    }

    if(contentType==='THUMBNAIL'){
      await uploadSignedFile(
        file,
        init.signedUrl,
        {
          progressEl,
          statusEl
        }
      );
    }else{
      const tus=await loadTus();

      await new Promise((resolve,reject)=>{
        const upload=new tus.Upload(file,{
        endpoint:init.uploadEndpoint,
        retryDelays:[0,3000,5000,10000,20000],
        headers:{
          'x-signature':init.token
        },
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        chunkSize:6*1024*1024,

        metadata:{
          bucketName:init.bucket,
          objectName:init.path,
          contentType:file.type||init.mimeType||'application/octet-stream'
        },

        onError:error=>{
          reject(new Error(error?.message||'Upload Storage gagal.'));
        },

        onProgress:(uploaded,total)=>{
          if(total>0){
            const pct=Math.round(uploaded/total*100);

            if(progressEl)progressEl.value=pct;

            if(statusEl){
              statusEl.textContent=
                `Mengunggah… ${pct}% · `+
                `${(uploaded/1024/1024).toFixed(1)} / `+
                `${(total/1024/1024).toFixed(1)} MB`;
            }
          }
        },

        onSuccess:()=>{
          if(progressEl)progressEl.value=100;

          if(statusEl){
            statusEl.textContent='Upload Storage selesai. Menyimpan metadata…';
          }

          resolve();
        }
      });

        upload.start();
      });
    }

    const completed=await api.request(
      '/api/owner/products/'+encodeURIComponent(productId)+'/upload-complete',
      {
        method:'POST',
        body:{
          contentType,
          path:init.path,
          originalName:file.name||init.originalName,
          mimeType:file.type||init.mimeType||'application/octet-stream',
          fileSize:file.size,
          title:meta.title,
          description:meta.description,
          sortOrder:Number(meta.sortOrder||0),
          isPreview:Boolean(meta.isPreview),
          accessType:meta.accessType||'PURCHASED'
        }
      }
    );

    if(statusEl){
      statusEl.textContent='Upload berhasil disimpan.';
    }

    return completed;
  }

  function open(html,onReady){window.JYYRModal.open(html);onReady?.();}


  function ownerContentTypeLabel(type){
    return ({
      FILE:'File / ZIP',
      IMAGE:'Gambar',
      VIDEO:'Video',
      AUDIO:'Audio',
      TEXT:'Teks',
      LINK:'Link'
    })[String(type||'').toUpperCase()]||String(type||'Content');
  }

  function ownerAccessLabel(access){
    return ({
      PURCHASED:'Hanya pembeli',
      PREVIEW:'Preview',
      PUBLIC:'Publik'
    })[String(access||'').toUpperCase()]||String(access||'PURCHASED');
  }

  function ownerContentIsValid(c){
    const type=String(c.type||'').toUpperCase();
    if(['FILE','IMAGE','VIDEO','AUDIO'].includes(type)) return !!c.storage_path;
    if(type==='TEXT') return !!String(c.text_content||'').trim();
    if(type==='LINK') return !!String(c.url||'').trim();
    return false;
  }

  async function openOwnerContentManager(
    productId,
    productName='Produk',
    productStatus='DRAFT',
    hasThumbnail=null
  ){
    try{
      const r=await api.request('/api/owner/products/'+encodeURIComponent(productId)+'/content');
      const items=Array.isArray(r)?r:(r.items||[]);

      const coverReady=hasThumbnail===null ? null : Boolean(hasThumbnail);
      const validContentCount=items.filter(ownerContentIsValid).length;
      const canPublish=String(productStatus)==='DRAFT'
        && coverReady===true
        && items.length>0
        && validContentCount===items.length;

      const rows=items.length
        ? items.map((c,i)=>{
            const type=String(c.type||'').toUpperCase();
            const access=String(c.access_type||'PURCHASED').toUpperCase();
            const valid=ownerContentIsValid(c);
            const meta=[
              ownerContentTypeLabel(type),
              ownerAccessLabel(access),
              c.file_size?`${(Number(c.file_size)/1024/1024).toFixed(2)} MB`:null
            ].filter(Boolean).join(' · ');

            return `
              <article class="owner-content-row ${valid?'is-valid':'is-invalid'}">
                <div class="owner-content-row-main">
                  <div class="owner-content-icon">${svg(type==='LINK'?'plus':'package')}</div>
                  <div class="owner-content-row-copy">
                    <strong>${esc(c.title||('Content '+(i+1)))}</strong>
                    <span>${esc(meta)}</span>
                    ${
                      valid
                        ? `<small class="owner-content-valid">Content siap digunakan.</small>`
                        : `<small class="owner-content-invalid">Content belum lengkap.</small>`
                    }
                  </div>
                </div>

                <button
                  class="button button-danger button-small"
                  type="button"
                  data-owner-content-delete="${esc(c.id)}"
                  data-owner-content-product="${esc(productId)}"
                  data-owner-content-name="${esc(productName)}"
                  data-owner-content-status="${esc(productStatus)}"
                  data-owner-content-has-thumbnail="${coverReady===true?'1':'0'}">
                  Hapus
                </button>
              </article>
            `;
          }).join('')
        : `
          <div class="owner-content-empty">
            <div class="owner-content-empty-icon">${svg('package')}</div>
            <strong>Belum ada content</strong>
            <p>Tambahkan file, gambar, video, audio, teks, atau link yang akan diberikan kepada pembeli.</p>
          </div>
        `;

      let coverStatus='';
      if(coverReady===true){
        coverStatus=`
          <div class="owner-readiness-card is-ready">
            <span class="owner-readiness-icon">✓</span>
            <div>
              <strong>Cover produk siap</strong>
              <small>Cover sudah tersedia untuk halaman Store.</small>
            </div>
          </div>
        `;
      }else if(coverReady===false){
        coverStatus=`
          <div class="owner-readiness-card is-error">
            <span class="owner-readiness-icon">!</span>
            <div>
              <strong>Cover produk belum ada</strong>
              <small>Kembali ke Edit Produk dan upload cover sebelum publish.</small>
            </div>
          </div>
        `;
      }else{
        coverStatus=`
          <div class="owner-readiness-card">
            <span class="owner-readiness-icon">i</span>
            <div>
              <strong>Status cover belum diketahui</strong>
              <small>Server tetap akan melakukan pemeriksaan saat publish.</small>
            </div>
          </div>
        `;
      }

      const contentReady=items.length>0 && validContentCount===items.length;

      const contentStatus=contentReady
        ? `
          <div class="owner-readiness-card is-ready">
            <span class="owner-readiness-icon">✓</span>
            <div>
              <strong>${items.length} content siap</strong>
              <small>Semua content sudah memiliki data yang diperlukan.</small>
            </div>
          </div>
        `
        : `
          <div class="owner-readiness-card ${items.length?'is-error':''}">
            <span class="owner-readiness-icon">${items.length?'!':'+'}</span>
            <div>
              <strong>${items.length?`${validContentCount} dari ${items.length} content siap`:'Belum ada content'}</strong>
              <small>${items.length?'Periksa content yang bertanda belum lengkap.':'Tambahkan minimal satu content sebelum publish.'}</small>
            </div>
          </div>
        `;

      const publishBlock=String(productStatus)==='DRAFT'
        ? `
          <section class="owner-publish-panel">
            <div class="owner-publish-head">
              <div>
                <span class="product-modal-kicker">Langkah 3 dari 3</span>
                <h3>Publikasikan Produk</h3>
                <p>Produk hanya bisa dipublikasikan jika cover dan content sudah lengkap.</p>
              </div>
              <span class="owner-publish-state ${canPublish?'is-ready':'is-waiting'}">
                ${canPublish?'Siap dipublish':'Belum siap'}
              </span>
            </div>

            <div class="owner-publish-checklist">
              <div class="${coverReady===true?'done':''}">
                <span>${coverReady===true?'✓':'○'}</span>
                <span>Cover produk</span>
              </div>
              <div class="${items.length>0?'done':''}">
                <span>${items.length>0?'✓':'○'}</span>
                <span>Minimal 1 content</span>
              </div>
              <div class="${contentReady?'done':''}">
                <span>${contentReady?'✓':'○'}</span>
                <span>Semua content valid</span>
              </div>
            </div>

            <button
              class="button button-primary button-block owner-publish-button"
              type="button"
              data-owner-publish="${esc(productId)}"
              ${canPublish?'':'disabled'}>
              ${canPublish?'Publikasikan Produk':'Lengkapi Persyaratan Dulu'}
            </button>
          </section>
        `
        : `
          <section class="owner-published-panel">
            <strong>Produk sudah dipublikasikan.</strong>
            <span>Content dan cover dapat dikelola dari halaman produk owner.</span>
          </section>
        `;

      open(`
        <div class="stack-form owner-content-manager">
          <header class="product-modal-head">
            <div class="product-modal-kicker">Owner Store · Langkah 2</div>
            <h2>Content & Publish</h2>
            <p><strong>${esc(productName)}</strong> · Status <strong>${esc(productStatus)}</strong></p>

            <div class="product-flow-steps">
              <span>1. Data Produk</span>
              <span class="active">2. Content</span>
              <span>3. Publish</span>
            </div>
          </header>

          <section class="owner-content-overview">
            <div class="owner-content-overview-item">
              <span class="owner-content-overview-label">Produk</span>
              <strong>${esc(productName)}</strong>
            </div>
            <div class="owner-content-overview-item">
              <span class="owner-content-overview-label">Status</span>
              <strong>${esc(productStatus)}</strong>
            </div>
            <div class="owner-content-overview-item">
              <span class="owner-content-overview-label">Content</span>
              <strong>${items.length}</strong>
            </div>
          </section>

          <section class="owner-readiness-grid">
            ${coverStatus}
            ${contentStatus}
          </section>

          <section class="owner-content-list-section">
            <div class="owner-section-title">
              <div>
                <h3>Content Produk</h3>
                <p>Ini adalah isi yang akan diterima atau dibuka untuk pembeli sesuai aturan akses.</p>
              </div>
              <span class="badge">${items.length} item</span>
            </div>

            <div class="owner-content-list">${rows}</div>
          </section>

          <form
            data-owner-content-form
            data-product-id="${esc(productId)}"
            data-product-name="${esc(productName)}"
            data-product-status="${esc(productStatus)}"
            data-product-has-thumbnail="${coverReady===true?'1':'0'}"
            class="owner-content-form">

            <div class="owner-section-title">
              <div>
                <h3>Tambah Content</h3>
                <p>Pilih jenis content. Form akan menampilkan field yang memang dibutuhkan.</p>
              </div>
            </div>

            <div class="owner-content-form-grid">
              <label class="field">
                <span>Jenis Content</span>
                <select name="type" data-owner-content-type>
                  <option value="FILE">File / ZIP</option>
                  <option value="IMAGE">Gambar</option>
                  <option value="VIDEO">Video</option>
                  <option value="AUDIO">Audio</option>
                  <option value="TEXT">Teks</option>
                  <option value="LINK">Link</option>
                </select>
                <small class="field-help" data-owner-content-type-help>
                  Gunakan File untuk ZIP atau PDF yang memang akan diunduh pembeli.
                </small>
              </label>

              <label class="field">
                <span>Judul</span>
                <input name="title" required maxlength="160" placeholder="Contoh: Preset Loading Screen MLBB">
              </label>

              <label class="field full">
                <span>Deskripsi</span>
                <textarea name="description" maxlength="2000" rows="3" placeholder="Jelaskan singkat isi content ini."></textarea>
              </label>

              <div class="owner-context-field full" data-owner-content-field="file">
                <label class="field">
                  <span>File</span>
                  <input
                    name="file"
                    type="file"
                    data-owner-content-file
                    accept=".zip,.pdf">
                  <small class="field-help">File akan diupload langsung ke Storage dan diverifikasi oleh server.</small>
                </label>
              </div>

              <div class="owner-context-field full" data-owner-content-field="text" hidden>
                <label class="field">
                  <span>Isi Teks</span>
                  <textarea name="text_content" maxlength="50000" rows="8" placeholder="Masukkan isi teks yang akan dibaca pembeli."></textarea>
                </label>
              </div>

              <div class="owner-context-field full" data-owner-content-field="url" hidden>
                <label class="field">
                  <span>Link Content</span>
                  <input
                    name="url"
                    type="url"
                    maxlength="2000"
                    placeholder="https://contoh.com/preset">
                  <small class="field-help">Cocok untuk preset Alight Motion atau content lain yang dibagikan melalui link.</small>
                </label>
              </div>

              <label class="field full">
                <span>Akses</span>
                <select name="access_type" data-owner-content-access>
                  <option value="PURCHASED">Hanya pembeli</option>
                  <option value="PREVIEW">Preview sebelum membeli</option>
                  <option value="PUBLIC">Publik</option>
                </select>
                <small class="field-help" data-owner-content-access-help>
                  Hanya user yang memiliki pembelian terkonfirmasi yang dapat membuka content ini.
                </small>
              </label>
            </div>

            <progress data-upload-progress value="0" max="100" hidden></progress>
            <div class="owner-upload-status" data-upload-status>Belum ada upload berjalan.</div>

            <div class="product-modal-actions">
              <button class="button button-secondary" type="button" data-modal-close>Tutup</button>
              <button class="button button-primary" type="submit">Simpan Content</button>
            </div>
          </form>

          ${publishBlock}
        </div>
      `);
    }catch(err){
      toast.error(err.message);
    }
  }
  function formButtons(label='Simpan'){return `<div class="inline-actions"><button class="button button-primary">${esc(label)}</button><button class="button button-secondary" type="button" data-modal-close>Batal</button></div>`}

  document.addEventListener('error',e=>{const img=e.target;if(img?.matches?.('[data-image-fallback]')){img.hidden=true;img.nextElementSibling?.removeAttribute('hidden')} if(img?.matches?.('[data-image-fallback-hide]'))img.hidden=true;},{capture:true});
  document.addEventListener('change',e=>{
    const input=e.target.closest('[data-thumbnail-input]');
    if(!input)return;
    const file=input.files?.[0];
    const form=input.closest('form');
    const preview=form?.querySelector('[data-thumbnail-preview]');
    const empty=form?.querySelector('[data-thumbnail-empty]');
    const status=form?.querySelector('[data-thumbnail-status]');
    if(!file){
      if(preview)preview.hidden=true;
      if(empty)empty.hidden=false;
      if(status)status.textContent='Belum ada thumbnail dipilih.';
      return;
    }
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      input.value='';
      if(preview)preview.hidden=true;
      if(empty)empty.hidden=false;
      if(status)status.textContent='Thumbnail harus JPG, PNG, atau WebP.';
      toast.error('Thumbnail harus JPG, PNG, atau WebP.');
      return;
    }
    if(preview){
      if(preview.dataset.objectUrl)URL.revokeObjectURL(preview.dataset.objectUrl);
      const url=URL.createObjectURL(file);
      preview.src=url;
      preview.dataset.objectUrl=url;
      preview.hidden=false;
      if(empty)empty.hidden=true;
    }
    if(status)status.textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
  });
  function syncOwnerContentForm(form){
    if(!form)return;

    const type=String(
      form.querySelector(
        '[data-owner-content-type]'
      )?.value || 'FILE'
    ).toUpperCase();

    const access=String(
      form.querySelector(
        '[data-owner-content-access]'
      )?.value || 'PURCHASED'
    ).toUpperCase();

    form.querySelectorAll(
      '[data-owner-content-field]'
    ).forEach(field=>{
      const fieldType=String(
        field.dataset.ownerContentField || ''
      );

      const visible=(
        (
          fieldType==='file' &&
          ['FILE','IMAGE','VIDEO','AUDIO'].includes(type)
        ) ||
        (
          fieldType==='text' &&
          type==='TEXT'
        ) ||
        (
          fieldType==='url' &&
          type==='LINK'
        )
      );

      field.hidden=!visible;
    });

    const file=form.querySelector(
      '[data-owner-content-file]'
    );

    const lastType=String(
      form.dataset.ownerContentLastType || ''
    );

    if(file){
      if(
        lastType &&
        lastType!==type
      ){
        file.value='';
      }

      file.accept=(
        type==='FILE'
          ? '.zip,.pdf'
          : type==='IMAGE'
            ? 'image/jpeg,image/png,image/webp'
            : type==='VIDEO'
              ? 'video/mp4,video/webm,video/quicktime'
              : type==='AUDIO'
                ? 'audio/mpeg,audio/wav,audio/ogg,audio/mp4'
                : ''
      );

      file.disabled=![
        'FILE',
        'IMAGE',
        'VIDEO',
        'AUDIO'
      ].includes(type);
    }

    form.dataset.ownerContentLastType=type;

    const help={
      FILE:'Upload ZIP atau PDF yang akan diterima pembeli.',
      IMAGE:'Upload gambar JPG, PNG, atau WebP.',
      VIDEO:'Upload video MP4, WEBM, atau MOV.',
      AUDIO:'Upload audio MP3, WAV, OGG, atau M4A.',
      TEXT:'Isi teks yang dapat dibaca pembeli.',
      LINK:'Gunakan link langsung, misalnya link preset Alight Motion.'
    };

    const typeHelp=form.querySelector(
      '[data-owner-content-type-help]'
    );

    if(typeHelp){
      typeHelp.textContent=
        help[type] || '';
    }

    const accessHelp={
      PURCHASED:
        'Hanya user yang memiliki pembelian terkonfirmasi yang dapat membuka content ini.',
      PREVIEW:
        'Content akan ditandai sebagai preview dan dapat dibuka sebelum pembelian.',
      PUBLIC:
        'Content dapat diakses tanpa entitlement pembelian.'
    };

    const accessHelpEl=form.querySelector(
      '[data-owner-content-access-help]'
    );

    if(accessHelpEl){
      accessHelpEl.textContent=
        accessHelp[access] || '';
    }

    const uploadStatus=form.querySelector(
      '[data-upload-status]'
    );

    if(
      uploadStatus &&
      !uploadStatus.dataset.uploading
    ){
      uploadStatus.textContent=
        [
          'FILE',
          'IMAGE',
          'VIDEO',
          'AUDIO'
        ].includes(type)
          ? 'Belum ada upload berjalan.'
          : 'Tidak membutuhkan upload file.';
    }
  }

  document.addEventListener('change',e=>{
    const form=e.target.closest('[data-owner-content-form]');
    if(form && (
      e.target.matches('[data-owner-content-type]') ||
      e.target.matches('[data-owner-content-access]')
    )){
      syncOwnerContentForm(form);
    }
  });

  document.addEventListener('submit',e=>{
    const form=e.target.closest('[data-owner-content-form]');
    if(form)syncOwnerContentForm(form);
  });

  document.querySelectorAll('table').forEach(table=>{const heads=[...table.querySelectorAll('thead th')].map(x=>x.textContent.trim());table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>{if(heads[i])cell.setAttribute('data-label',heads[i])}));});
  document.addEventListener('input',e=>{
    const bio=e.target.closest('[data-profile-bio]');
    if(!bio)return;

    const counter=bio.form?.querySelector('[data-profile-bio-count]');

    if(counter){
      counter.textContent=String(bio.value.length);
    }
  });

  document.addEventListener('click',async e=>{
    const retry=e.target.closest('[data-retry]'); if(retry){location.reload();return}
    const searchRetry=e.target.closest('[data-search-retry]'); if(searchRetry){search();return}
    const openUrl=e.target.closest('[data-open-content-url]'); if(openUrl){window.open(openUrl.dataset.openContentUrl,'_blank','noopener');return}

    const buy=e.target.closest('[data-buy-now]'); if(buy){buy.disabled=true;try{const cart=await api.request('/api/cart');const existing=(cart?.items||[]).find(i=>String(i.product_id)===String(buy.dataset.buyNow));if(existing){await api.request('/api/cart/'+encodeURIComponent(existing.id),{method:'PUT',body:{quantity:1}})}else{await api.request('/api/cart',{method:'POST',body:{productId:buy.dataset.buyNow,quantity:1}})}location.href='/checkout'}catch(err){toast.error(err.message)}finally{buy.disabled=false}}
    const add=e.target.closest('[data-add-cart]'); if(add){add.disabled=true;try{await api.request('/api/cart',{method:'POST',body:{productId:add.dataset.addCart,quantity:1}});toast.success('Produk ditambahkan ke keranjang.');await hydrateCartBadge();}catch(err){toast.error(err.message)}finally{add.disabled=false}}
    const rm=e.target.closest('[data-cart-remove]'); if(rm){try{await api.request('/api/cart/'+rm.dataset.cartRemove,{method:'DELETE'});location.reload()}catch(err){toast.error(err.message)}}
    const clearCart=e.target.closest('[data-cart-clear]'); if(clearCart){if(!(await window.JYYRModal.confirm('Kosongkan keranjang? Semua item akan dihapus.')))return;clearCart.disabled=true;try{await api.request('/api/cart',{method:'DELETE'});toast.success('Keranjang dikosongkan.');location.reload()}catch(err){toast.error(err.message)}finally{clearCart.disabled=false}}
    const minus=e.target.closest('[data-cart-minus]'),plus=e.target.closest('[data-cart-plus]');
    if(minus||plus){
      const btn=minus||plus;
      const id=btn.dataset[minus?'cartMinus':'cartPlus'];
      const card=btn.closest('.cart-item');
      const qtyNode=card?.querySelector('.quantity span');
      const lineNode=card?.querySelector('[data-cart-line-total]');
      const controls=card?.querySelectorAll('.quantity .icon-button')||[];
      const current=Number(qtyNode?.textContent||0);
      const qty=current+(plus?1:-1);

      if(qty<1)return;

      controls.forEach(x=>x.disabled=true);
      card?.setAttribute('aria-busy','true');

      try{
        await api.request(
          '/api/cart/'+encodeURIComponent(id),
          {
            method:'PUT',
            body:{quantity:qty}
          }
        );

        const updated=await api.request('/api/cart');
        const item=(updated?.items||[]).find(
          x=>String(x.id)===String(id)
        );

        if(item){
          if(qtyNode)qtyNode.textContent=String(item.quantity);
          if(lineNode)lineNode.textContent=money(item.lineTotal);
        }

        const totalNode=document.querySelector(
          '[data-cart-summary-total]'
        );

        if(totalNode){
          totalNode.textContent=money(updated?.total||0);
        }

        await hydrateCartBadge();
      }catch(err){
        toast.error(err.message);
      }finally{
        controls.forEach(x=>x.disabled=false);
        card?.removeAttribute('aria-busy');
      }
    }
    const amount=e.target.closest('[data-deposit-amount]');if(amount){document.querySelectorAll('[data-deposit-amount]').forEach(x=>x.classList.remove('selected'));amount.classList.add('selected');const custom=document.getElementById('deposit-custom');if(custom)custom.value=Number(amount.dataset.depositAmount)}
    const read=e.target.closest('[data-read-notification]');if(read){try{await api.request('/api/notifications/'+read.dataset.readNotification+'/read',{method:'PUT'});read.closest('.notification-card')?.classList.remove('unread');read.remove();await hydrateNotificationBadge()}catch(err){toast.error(err.message)}}
    const tab=e.target.closest('[data-tab-target]');if(tab){const name=tab.dataset.tabTarget;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));tab.classList.add('active');document.querySelector(`[data-tab="${name}"]`)?.classList.add('active')}
    const dep=e.target.closest('[data-deposit-submit]');if(dep){const v=Number(document.getElementById('deposit-custom')?.value||0);if(v<1000)return toast.error('Minimum deposit Rp1.000.');dep.disabled=true;try{const r=await api.request('/api/deposit',{method:'POST',body:{amount:v,returnUrl:location.origin+'/deposit'}});if(r.paymentUrl)location.href=r.paymentUrl;else toast.success('Deposit dibuat.')}catch(err){toast.error(err.message)}finally{dep.disabled=false}}
    const checkout=e.target.closest('[data-checkout-confirm]');if(checkout){const method=document.querySelector('input[name="paymentMethod"]:checked')?.value||'BALANCE';checkout.disabled=true;try{const r=await api.request('/api/orders',{method:'POST',body:{paymentMethod:method,returnUrl:location.origin+'/orders'}});if(r.payment?.paymentUrl)location.href=r.payment.paymentUrl;else location.href='/orders/'+r.order.id}catch(err){toast.error(err.message)}finally{checkout.disabled=false}}

    const download=e.target.closest('[data-download-content]');if(download){download.disabled=true;try{const r=await api.request('/api/download/'+download.dataset.downloadContent);if(r.url)window.open(r.url,'_blank','noopener');else if(r.content?.type==='TEXT')toast.success('Content teks tersedia di halaman.');else toast.error('Secure URL tidak tersedia.')}catch(err){toast.error(err.message)}finally{download.disabled=false}}
    const service=e.target.closest('[data-service-order]');if(service){open(`<form data-service-order-form class="stack-form"><h2>Pesan ${esc(service.dataset.serviceName)}</h2><p class="muted">Harga ${money(service.dataset.servicePrice)} akan dipotong dari saldo setelah konfirmasi.</p><input type="hidden" name="serviceId" value="${esc(service.dataset.serviceOrder)}"><label class="field"><span>Username (opsional)</span><input name="username"></label><label class="field"><span>URL (opsional)</span><input name="url" type="url"></label><label class="field"><span>Quantity</span><input name="quantity" type="number" min="1" value="1"></label><label class="field"><span>Target (opsional)</span><input name="target"></label><label class="field"><span>Notes</span><textarea name="notes"></textarea></label>${formButtons('Konfirmasi Service')}</form>`)}

    const dep2=e.target.closest('[data-owner-create]');if(dep2){const section=dep2.dataset.ownerCreate;const forms={
      categories:`<form data-owner-category-form class="stack-form"><h2>Tambah Kategori</h2><label class="field"><span>Nama</span><input name="name" required maxlength="80"></label><label class="field"><span>Slug (opsional)</span><input name="slug" maxlength="100"></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" checked></label>${formButtons()}}</form>`,
      products:`<form data-owner-product-form class="product-form-modal">
  <div class="product-modal-head">
    <div class="product-modal-kicker">Owner Store · Langkah 1</div>
    <h2>Buat Produk</h2>
    <p>Lengkapi informasi dasar dan <strong>Cover Produk</strong>. Produk disimpan sebagai <strong>DRAFT</strong> sebelum dipublikasikan.</p>
    <div class="product-flow-steps"><span class="active">1. Data Produk</span><span>2. Content</span><span>3. Publish</span></div>
  </div>

  <section class="product-modal-section">
    <div class="product-modal-section-title">
      <strong>Cover Produk</strong>
      <span class="badge">JPG · PNG · WEBP</span>
    </div>

    <div class="product-thumbnail-box">
      <div class="product-thumbnail-empty" data-thumbnail-empty>Preview Thumbnail</div>
      <div class="product-upload-info">
        <strong>Pilih gambar produk</strong>
        <small>Gunakan gambar yang jelas agar produk terlihat bagus di halaman Store.</small>
        <input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" data-thumbnail-input>
        <small data-thumbnail-status>Belum ada thumbnail dipilih.</small>
        <progress data-thumbnail-progress value="0" max="100" hidden></progress>
        <img class="product-thumbnail-preview" data-thumbnail-preview alt="Preview thumbnail" hidden>
      </div>
    </div>
  </section>

  <section class="product-modal-section">
    <div class="product-modal-section-title">
      <strong>Informasi Produk</strong>
    </div>

    <div class="product-modal-grid">
      <label class="field full">
        <span>Nama Produk</span>
        <input name="name" required placeholder="Contoh: Alight Motion Premium">
      </label>

      <label class="field">
        <span>Slug</span>
        <input name="slug" placeholder="Opsional">
      </label>

      <label class="field">
        <span>Kategori</span>
        <select name="category_id">
          <option value="">Tanpa kategori</option>
          ${(window.__OWNER_CATEGORIES||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span>Harga</span>
        <input name="price" type="number" min="0" required placeholder="10000">
      </label>

      <label class="field">
        <span>Stock</span>
        <input name="stock" type="number" min="0" required placeholder="10">
      </label>

      <label class="field full">
        <span>Description</span>
        <textarea name="description" rows="4" placeholder="Deskripsi singkat produk..."></textarea>
      </label>

      <div class="product-flow-note full">
        <strong>Setelah disimpan</strong>
        <span>Produk masuk ke <b>DRAFT</b>. Lanjutkan ke <b>Kelola Content</b>, tambahkan barang yang akan diterima pembeli, lalu Publish.</span>
      </div>
    </div>
  </section>

  <div class="product-modal-actions">
    <button class="button button-secondary" type="button" data-modal-close>Batal</button>
    <button class="button button-primary" type="submit">Simpan Produk</button>
  </div>
</form>`,
      services:`<form data-owner-service-form class="stack-form"><h2>Tambah Service</h2><label class="field"><span>Nama</span><input name="name" required></label><label class="field"><span>Kategori</span><input name="category"></label><label class="field"><span>Harga</span><input name="price" type="number" min="0"></label><label class="field"><span>Icon key (SVG semantic)</span><input name="icon_key" value="settings" maxlength=40></label><label class="field"><span>Urutan</span><input name="sort_order" type="number" value="0" min="0"></label><label class="field"><span>Description</span><textarea name="description"></textarea></label><label class="field"><span>Requirements JSON</span><textarea name="requirements">{}</textarea></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" checked></label>${formButtons()}</form>`,
      faq:`<form data-owner-faq-form class="stack-form"><h2>Tambah FAQ</h2><label class="field"><span>Category</span><input name="category" required></label><label class="field"><span>Question</span><input name="question" required></label><label class="field"><span>Answer</span><textarea name="answer" required></textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" checked></label>${formButtons()}</form>`,
      information:`<form data-owner-info-form class="stack-form"><h2>Tambah Information</h2><label class="field"><span>Type</span><select name="type"><option>ANNOUNCEMENT</option><option>BANNER</option><option>PROMOTION</option><option>MAINTENANCE_NOTICE</option><option>SYSTEM_NOTICE</option></select></label><label class="field"><span>Title</span><input name="title" required></label><label class="field"><span>Body</span><textarea name="body" required></textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" checked></label>${formButtons()}</form>`}[section]; if(forms)open(forms)}

    const ep=e.target.closest('[data-owner-edit-product]');
    if(ep){
      let d;
      try{d=JSON.parse(ep.dataset.ownerEditProduct)}catch{return}

      open(`
        <form data-owner-product-edit class="product-form-modal">

          <div class="product-modal-head">
            <div class="product-modal-kicker">Owner Store · Data Produk</div>
            <h2>Edit Produk</h2>
            <p>Perubahan data produk tidak otomatis mengubah status publish.</p>
          </div>

          <input type="hidden" name="id" value="${esc(d.id)}">

          <section class="product-modal-section">
            <div class="product-modal-section-title">
              <strong>Informasi Produk</strong>
            </div>

            <div class="product-modal-grid">
              <label class="field full">
                <span>Nama Produk</span>
                <input name="name" value="${esc(d.name)}" required maxlength="160">
              </label>

              <label class="field">
                <span>Slug</span>
                <input name="slug" value="${esc(d.slug||'')}" maxlength="140">
              </label>

              <label class="field">
                <span>Kategori</span>
                <select name="category_id">
                  <option value="">Tanpa kategori</option>
                  ${(window.__OWNER_CATEGORIES||[]).map(c=>`
                    <option value="${esc(c.id)}" ${d.category_id===c.id?'selected':''}>
                      ${esc(c.name)}
                    </option>
                  `).join('')}
                </select>
              </label>

              <label class="field">
                <span>Harga</span>
                <input name="price" type="number" min="0" value="${Number(d.price)||0}">
              </label>

              <label class="field">
                <span>Stok / Kuota</span>
                <input name="stock" type="number" min="0" value="${Number(d.stock)||0}">
              </label>

              <label class="field full">
                <span>Deskripsi</span>
                <textarea name="description" rows="5" maxlength="5000">${esc(d.description||'')}</textarea>
              </label>
            </div>
          </section>

          <section class="product-modal-section">
            <div class="product-modal-section-title">
              <strong>Cover Produk</strong>
              <span class="badge">JPG · PNG · WEBP</span>
            </div>

            <div class="product-thumbnail-box">
              ${
                d.thumbnail_url
                  ? `<img class="product-thumbnail-preview" data-current-thumbnail src="${esc(d.thumbnail_url)}" alt="Cover produk saat ini">`
                  : `<div class="product-thumbnail-empty" data-thumbnail-empty>Belum ada cover</div>`
              }

              <div class="product-upload-info">
                <strong>${d.thumbnail_url?'Ganti cover produk':'Upload cover produk'}</strong>
                <small>Gunakan gambar utama yang jelas untuk tampilan Store.</small>
                <input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" data-thumbnail-input>
                <small class="muted" data-thumbnail-status>Belum ada perubahan cover.</small>
                <progress data-thumbnail-progress value="0" max="100" hidden></progress>
                <img class="product-thumbnail-preview" data-thumbnail-preview alt="Preview cover baru" hidden>
              </div>
            </div>
          </section>

          <div class="product-modal-actions">
            <button class="button button-secondary" type="button" data-modal-close>Batal</button>
            <button class="button button-primary" type="submit">Simpan Perubahan</button>
          </div>
        </form>
      `);
    }

    const content=e.target.closest('[data-owner-content]');if(content){await openOwnerContentManager(content.dataset.ownerContent,content.dataset.ownerProductName||'Produk',content.dataset.ownerProductStatus||'DRAFT',content.dataset.ownerHasThumbnail==='1');}

    const contentDelete=e.target.closest('[data-owner-content-delete]');if(contentDelete){if(!(await window.JYYRModal.confirm('Hapus content ini?')))return;try{await ownerAction('/api/owner/products/'+encodeURIComponent(contentDelete.dataset.ownerContentProduct)+'/content/'+encodeURIComponent(contentDelete.dataset.ownerContentDelete),{},'DELETE','Content dihapus.');await openOwnerContentManager(contentDelete.dataset.ownerContentProduct,contentDelete.dataset.ownerContentName||'Produk',contentDelete.dataset.ownerContentStatus||'DRAFT',contentDelete.dataset.ownerContentHasThumbnail==='1')}catch(err){toast.error(err.message)}}
    const publish=e.target.closest('[data-owner-publish]');if(publish){if(!(await window.JYYRModal.confirm('Publish produk ini?')))return;try{await ownerAction('/api/owner/products/'+publish.dataset.ownerPublish+'/publish',{},'POST','Produk dipublish.');location.reload()}catch(err){toast.error(err.message)}}
    const unpublish=e.target.closest('[data-owner-unpublish]');if(unpublish){if(!(await window.JYYRModal.confirm('Unpublish produk ini?')))return;try{await ownerAction('/api/owner/products/'+unpublish.dataset.ownerUnpublish+'/unpublish',{},'POST','Produk di-unpublish.');location.reload()}catch(err){toast.error(err.message)}}
    const dup=e.target.closest('[data-owner-duplicate]');if(dup){if(!(await window.JYYRModal.confirm('Duplikat produk ini?')))return;try{await ownerAction('/api/owner/products/'+dup.dataset.ownerDuplicate+'/duplicate',{},'POST','Produk diduplikasi.');location.reload()}catch(err){toast.error(err.message)}}
    const delp=e.target.closest('[data-owner-delete-product]');if(delp){if(!(await window.JYYRModal.confirm('Arsipkan produk ini? Data transaksi tidak dihapus.')))return;try{await ownerAction('/api/owner/products/'+delp.dataset.ownerDeleteProduct+'/delete',{},'DELETE','Produk diarsipkan.');location.reload()}catch(err){toast.error(err.message)}}
    const user=e.target.closest('[data-owner-user]');if(user){const id=user.dataset.ownerUser,status=user.dataset.ownerStatus,role=user.dataset.ownerRole;open(`<div class="stack-form"><h2>Kelola ${esc(user.dataset.ownerUsername)}</h2><p class="muted">Status: ${esc(status)} · Role: ${esc(role)}</p><div class="button-grid"><button class="button button-secondary" data-user-ban="${id}">Ban</button><button class="button button-secondary" data-user-unban="${id}">Unban</button><button class="button button-secondary" data-user-suspend="${id}">Suspend</button><button class="button button-secondary" data-user-unsuspend="${id}">Unsuspend</button><button class="button button-secondary" data-user-reset="${id}">Reset Sessions</button><button class="button button-danger" data-user-delete="${id}">Delete (Anonymize)</button></div><label class="field"><span>Role</span><select id="user-role-select"><option ${role==='USER'?'selected':''}>USER</option><option ${role==='MODERATOR'?'selected':''}>MODERATOR</option><option ${role==='ADMIN'?'selected':''}>ADMIN</option><option ${role==='OWNER'?'selected':''}>OWNER</option></select></label><button class="button button-primary" data-user-role="${id}">Change Role</button></div>`)}
    const tick=e.target.closest('[data-owner-ticket]');if(tick){open(`<form data-owner-ticket-form class="stack-form"><h2>${esc(tick.dataset.ownerTicketNumber)}</h2><input type="hidden" name="id" value="${esc(tick.dataset.ownerTicket)}"><label class="field"><span>Reply</span><textarea name="body" required></textarea></label><label class="field"><span>Status</span><select name="status"><option>OPEN</option><option>WAITING</option><option>REPLIED</option><option>CLOSED</option></select></label>${formButtons('Reply / Update')}</form>`)}
    const editCat=e.target.closest('[data-owner-edit-category]');if(editCat){let d;try{d=JSON.parse(editCat.dataset.ownerEditCategory)}catch{return}open(`<form data-owner-category-edit class="stack-form"><h2>Edit Kategori</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Nama</span><input name="name" value="${esc(d.name)}" required></label><label class="field"><span>Slug</span><input name="slug" value="${esc(d.slug)}"></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" ${d.is_active?'checked':''}></label>${formButtons()}</form>`)}
    const editSvc=e.target.closest('[data-owner-edit-service]');if(editSvc){let d;try{d=JSON.parse(editSvc.dataset.ownerEditService)}catch{return}open(`<form data-owner-service-edit class="stack-form"><h2>Edit Service</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Nama</span><input name="name" value="${esc(d.name)}" required></label><label class="field"><span>Kategori</span><input name="category" value="${esc(d.category||'')}"></label><label class="field"><span>Harga</span><input name="price" type="number" value="${Number(d.price)||0}" min="0"></label><label class="field"><span>Description</span><textarea name="description">${esc(d.description||'')}</textarea></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" ${d.is_active?'checked':''}></label>${formButtons()}</form>`)}
    const editFaq=e.target.closest('[data-owner-edit-faq]');if(editFaq){let d;try{d=JSON.parse(editFaq.dataset.ownerEditFaq)}catch{return}open(`<form data-owner-faq-edit class="stack-form"><h2>Edit FAQ</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Category</span><input name="category" value="${esc(d.category)}"></label><label class="field"><span>Question</span><input name="question" value="${esc(d.question)}"></label><label class="field"><span>Answer</span><textarea name="answer">${esc(d.answer)}</textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" ${d.is_published?'checked':''}></label>${formButtons()}</form>`)}
    const editInfo=e.target.closest('[data-owner-edit-info]');if(editInfo){let d;try{d=JSON.parse(editInfo.dataset.ownerEditInfo)}catch{return}open(`<form data-owner-info-edit class="stack-form"><h2>Edit Information</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Type</span><input name="type" value="${esc(d.type)}"></label><label class="field"><span>Title</span><input name="title" value="${esc(d.title)}"></label><label class="field"><span>Body</span><textarea name="body">${esc(d.body)}</textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" ${d.is_published?'checked':''}></label>${formButtons()}</form>`)}

    const b=e.target.closest('[data-user-ban]');if(b&&await window.JYYRModal.confirm('Ban user ini?')){try{await ownerAction('/api/owner/users/'+b.dataset.userBan+'/ban');location.reload()}catch(err){toast.error(err.message)}}
    const ub=e.target.closest('[data-user-unban]');if(ub){try{await ownerAction('/api/owner/users/'+ub.dataset.userUnban+'/unban');location.reload()}catch(err){toast.error(err.message)}}
    const su=e.target.closest('[data-user-suspend]');if(su&&await window.JYYRModal.confirm('Suspend user ini?')){try{await ownerAction('/api/owner/users/'+su.dataset.userSuspend+'/suspend');location.reload()}catch(err){toast.error(err.message)}}
    const usu=e.target.closest('[data-user-unsuspend]');if(usu){try{await ownerAction('/api/owner/users/'+usu.dataset.userUnsuspend+'/unsuspend');location.reload()}catch(err){toast.error(err.message)}}
    const rs=e.target.closest('[data-user-reset]');if(rs){try{await ownerAction('/api/owner/users/'+rs.dataset.userReset+'/reset-sessions');toast.success('Session user direset.')}catch(err){toast.error(err.message)}}
    const du=e.target.closest('[data-user-delete]');if(du&&await window.JYYRModal.confirm('Anonymize account ini? Histori order/payment dipertahankan.')){try{await ownerAction('/api/owner/users/'+du.dataset.userDelete,{},'DELETE','User dianonymisasi.');location.reload()}catch(err){toast.error(err.message)}}
    const cr=e.target.closest('[data-user-role]');if(cr){const role=document.getElementById('user-role-select')?.value;if(role&&await window.JYYRModal.confirm('Ubah role user?')){try{await ownerAction('/api/owner/users/'+cr.dataset.userRole+'/change-role',{role});location.reload()}catch(err){toast.error(err.message)}}}
    const oi=e.target.closest('[data-owner-order-inspect]');if(oi){let d;try{d=JSON.parse(oi.dataset.ownerOrderInspect)}catch{return}open(`<div class="stack-form"><h2>Order ${esc(d.order_number||d.id)}</h2><div class="summary-row"><span>User</span><b>${esc(d.username||'—')}</b></div><div class="summary-row"><span>Total</span><b>${money(d.total)}</b></div><div class="summary-row"><span>Status</span><b>${esc(d.status)}</b></div><div class="summary-row"><span>Payment</span><b>${esc(d.payment_method||'—')}</b></div><p class="muted">Payment gateway tetap harus dikonfirmasi oleh webhook resmi. Owner hanya dapat menjalankan transisi fulfillment yang valid.</p><button class="button button-secondary button-block" type="button" data-modal-close>Tutup</button></div>`)}
    const os=e.target.closest('[data-owner-order-status]');if(os){if(!(await window.JYYRModal.confirm(`Ubah status order ke ${os.dataset.status}?`)))return;try{await ownerAction('/api/owner/orders/'+os.dataset.ownerOrderStatus+'/status',{status:os.dataset.status},'POST','Status order diperbarui.');location.reload()}catch(err){toast.error(err.message)}}
    const rb=e.target.closest('[data-owner-refund-order]');if(rb){open(`<form data-refund-form class="stack-form"><h2>Refund Order</h2><input type="hidden" name="order_id" value="${esc(rb.dataset.ownerRefundOrder)}"><label class="field"><span>Alasan</span><textarea name="reason" minlength="5" required></textarea></label>${formButtons('Process Refund')}</form>`)}
    const om=e.target.closest('[data-owner-message]');if(om){open(`<form data-owner-message-form class="stack-form"><h2>Balas Pesan</h2><input type="hidden" name="user_id" value="${esc(om.dataset.ownerMessage)}"><label class="field"><span>Pesan</span><textarea name="body" minlength="1" maxlength="10000" required></textarea></label>${formButtons('Kirim Pesan')}</form>`)}
  });

  if(location.pathname==='/owner/products' && new URLSearchParams(location.search).get('create')==='1') setTimeout(()=>document.querySelector('[data-owner-create="products"]')?.click(),0);

  document.addEventListener('submit',async e=>{
    const auth=e.target.closest('[data-auth-form]'); if(auth){e.preventDefault();const type=auth.dataset.authForm;const body=Object.fromEntries(new FormData(auth));const path=type==='login'?'/api/auth/login':type==='register'?'/api/auth/register':type==='forgot'?'/api/auth/forgot-password':'/api/auth/reset-password';const btn=auth.querySelector('button');btn.disabled=true;try{const r=await api.request(path,{method:'POST',body});if(type==='login')location.href='/dashboard';else if(type==='register')location.href='/auth/login?error=Registrasi berhasil. Periksa email jika verification aktif.';else toast.success(r.message||'Request diterima.')}catch(err){toast.error(err.message)}finally{btn.disabled=false}}
    const pf=e.target.closest('#profile-form');
    if(pf){
      e.preventDefault();

      if(pf.dataset.submitting==='1'){
        return;
      }

      pf.dataset.submitting='1';

      const btn=pf.querySelector('#profile-save, button[type="submit"]');
      const originalText=btn?.textContent||'Simpan perubahan';

      if(btn){
        btn.disabled=true;
        btn.setAttribute('aria-busy','true');
        btn.textContent='Menyimpan…';
      }

      try{
        const formData=new FormData(pf);

        const updated=await api.request(
          '/api/profile',
          {
            method:'PUT',
            body:Object.fromEntries(formData)
          }
        );

        const nextProfile=updated||{};

        if(window.JYYR){
          window.JYYR.user={
            ...(window.JYYR.user||{}),
            ...nextProfile
          };
        }

        const username=
          nextProfile.username||
          formData.get('username')||
          'Akun';

        const displayName=
          nextProfile.display_name||
          formData.get('display_name')||
          username;

        document
          .querySelectorAll('[data-profile-name]')
          .forEach(el=>{
            el.textContent=username;
          });

        document
          .querySelectorAll('[data-profile-avatar]')
          .forEach(el=>{
            el.textContent=
              String(displayName)
                .trim()
                .slice(0,1)
                .toUpperCase()||
              'U';
          });

        document
          .querySelectorAll('[data-profile-display]')
          .forEach(el=>{
            el.textContent=displayName;
          });

        document
          .querySelectorAll('[data-profile-username]')
          .forEach(el=>{
            el.textContent=username;
          });

        document
          .querySelectorAll('[data-profile-detail="username"]')
          .forEach(el=>{
            el.textContent=`@${username}`;
          });

        document
          .querySelectorAll('[data-profile-detail="display_name"]')
          .forEach(el=>{
            el.textContent=displayName;
          });

        document
          .querySelectorAll('[data-profile-detail="email"]')
          .forEach(el=>{
            el.textContent=
              nextProfile.email||
              document.querySelector(
                '#profile-form [type="email"]'
              )?.value||
              'Tidak tersedia';
          });

        document
          .querySelectorAll('[data-profile-detail="phone"]')
          .forEach(el=>{
            el.textContent=
              nextProfile.phone||
              formData.get('phone')||
              'Belum ditambahkan';
          });

        document
          .querySelectorAll('[data-profile-detail="bio"]')
          .forEach(el=>{
            el.textContent=
              nextProfile.bio||
              formData.get('bio')||
              'Belum ada bio.';
          });

        pf
          .closest('.profile-edit-disclosure')
          ?.removeAttribute('open');

        toast.success('Profil diperbarui.');
      }catch(err){
        toast.error(
          err.message||
          'Profil gagal diperbarui.'
        );
      }finally{
        if(btn){
          btn.disabled=false;
          btn.removeAttribute('aria-busy');
          btn.textContent=originalText;
        }

        delete pf.dataset.submitting;
      }
    }

    const reply=e.target.closest('[data-ticket-reply]');if(reply){e.preventDefault();const body=new FormData(reply).get('body');try{await api.request('/api/tickets/'+reply.dataset.ticketReply+'/messages',{method:'POST',body:{body}});location.reload()}catch(err){toast.error(err.message)}}
    const msg=e.target.closest('[data-message-form]');if(msg){e.preventDefault();const body=new FormData(msg).get('body');const btn=msg.querySelector('button');btn.disabled=true;try{await api.request('/api/messages',{method:'POST',body:{body}});toast.success('Pesan terkirim.');location.reload()}catch(err){toast.error(err.message)}finally{btn.disabled=false}}
    const maint=e.target.closest('[data-owner-maintenance]');if(maint){e.preventDefault();const fd=new FormData(maint);const body={enabled:fd.get('enabled')==='on',title:fd.get('title'),message:fd.get('message'),scheduled_start:fd.get('scheduled_start')||null,scheduled_end:fd.get('scheduled_end')||null,allow_owner_access:fd.get('allow_owner_access')==='on'};try{await api.request('/api/owner/maintenance',{method:'PUT',body});toast.success('Maintenance setting tersimpan.')}catch(err){toast.error(err.message)}}
    const form=e.target.closest('[data-deposit-submit]');if(form){e.preventDefault()}
    const category=e.target.closest('[data-owner-category-form], [data-owner-category-edit]');if(category){e.preventDefault();const fd=Object.fromEntries(new FormData(category));fd.is_active=fd.is_active==='on';try{const id=fd.id;if(id)await ownerAction('/api/owner/categories/'+id,{name:fd.name,slug:fd.slug,is_active:fd.is_active},'PUT','Kategori diperbarui.');else await ownerAction('/api/owner/categories',{name:fd.name,slug:fd.slug,is_active:fd.is_active},'POST','Kategori dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const pfm=e.target.closest('[data-owner-product-form]');
    if(pfm){
      e.preventDefault();

      const formData=new FormData(pfm);
      const thumbnail=formData.get('thumbnail');
      const fd=Object.fromEntries(formData);

      delete fd.thumbnail;
      delete fd.status;

      fd.status='DRAFT';
      fd.price=Number(fd.price);
      fd.stock=Number(fd.stock);
      if(!fd.category_id)fd.category_id=null;

      const btn=pfm.querySelector('button[type="submit"]');
      if(btn)btn.disabled=true;

      let thumbnailReady=false;

      try{
        const created=await ownerAction(
          '/api/owner/products',
          fd,
          'POST',
          'Produk DRAFT dibuat.'
        );

        if(thumbnail instanceof File && thumbnail.size){
          const progress=pfm.querySelector('[data-thumbnail-progress]');
          const status=pfm.querySelector('[data-thumbnail-status]');

          await uploadOwnerFile(
            created.id,
            thumbnail,
            {
              contentType:'THUMBNAIL',
              progressEl:progress,
              statusEl:status
            }
          );

          thumbnailReady=true;
        }

        window.JYYRModal.close();

        await openOwnerContentManager(
          created.id,
          created.name||fd.name,
          'DRAFT',
          thumbnailReady
        );
      }catch(err){
        toast.error(err.message);
      }finally{
        if(btn)btn.disabled=false;
      }
    }

    const pem=e.target.closest('[data-owner-product-edit]');if(pem){e.preventDefault();const formData=new FormData(pem);const thumbnail=formData.get('thumbnail');const fd=Object.fromEntries(formData);const id=fd.id;delete fd.id;delete fd.thumbnail;fd.price=Number(fd.price);fd.stock=Number(fd.stock);try{await ownerAction('/api/owner/products/'+id,fd,'PUT','Produk diperbarui.');if(thumbnail instanceof File && thumbnail.size){const progress=pem.querySelector('[data-thumbnail-progress]'),status=pem.querySelector('[data-thumbnail-status]');await uploadOwnerFile(id,thumbnail,{contentType:'THUMBNAIL',progressEl:progress,statusEl:status});toast.success('Thumbnail berhasil diperbarui.')}window.JYYRModal.close();location.reload()}catch(err){toast.error(err.message)}}
    const cfm=e.target.closest('[data-owner-content-form]');
    if(cfm){
      e.preventDefault();

      if(cfm.dataset.submitting==='1'){
        return;
      }

      const fd=new FormData(cfm);
      const type=String(
        fd.get('type')||'FILE'
      ).toUpperCase();

      const id=
        fd.get('product_id') ||
        cfm.dataset.productId;

      const file=fd.get('file');

      const title=String(
        fd.get('title')||''
      ).trim();

      const description=String(
        fd.get('description')||''
      ).trim();

      const textContent=String(
        fd.get('text_content')||''
      ).trim();

      const url=String(
        fd.get('url')||''
      ).trim();

      const access=String(
        fd.get('access_type')||'PURCHASED'
      ).toUpperCase();

      if(!title){
        toast.error(
          'Judul content wajib diisi.'
        );
        return;
      }

      if(
        ['FILE','IMAGE','VIDEO','AUDIO'].includes(type) &&
        !(file instanceof File && file.size)
      ){
        toast.error(
          'Pilih file terlebih dahulu.'
        );
        return;
      }

      if(
        type==='TEXT' &&
        !textContent
      ){
        toast.error(
          'Isi teks wajib diisi.'
        );
        return;
      }

      if(
        type==='LINK' &&
        !url
      ){
        toast.error(
          'Link content wajib diisi.'
        );
        return;
      }

      if(type==='LINK'){
        try{
          new URL(url);
        }catch{
          toast.error(
            'URL tidak valid.'
          );
          return;
        }
      }

      cfm.dataset.submitting='1';

      const btn=
        cfm.querySelector(
          'button[type="submit"]'
        );

      const originalText=
        btn?.textContent ||
        'Simpan Content';

      if(btn){
        btn.disabled=true;
        btn.setAttribute(
          'aria-busy',
          'true'
        );
        btn.textContent=
          ['FILE','IMAGE','VIDEO','AUDIO'].includes(type)
            ? 'Mengunggah…'
            : 'Menyimpan…';
      }

      try{
        if(
          file instanceof File &&
          file.size &&
          ['FILE','IMAGE','VIDEO','AUDIO'].includes(type)
        ){
          const progress=
            cfm.querySelector(
              '[data-upload-progress]'
            );

          const status=
            cfm.querySelector(
              '[data-upload-status]'
            );

          await uploadOwnerFile(
            id,
            file,
            {
              contentType:type,
              progressEl:progress,
              statusEl:status,
              meta:{
                title,
                description,
                accessType:access,
                isPreview:
                  access==='PREVIEW',
                sortOrder:0
              }
            }
          );

          toast.success(
            'Content berhasil diupload.'
          );
        }else{
          await ownerAction(
            '/api/owner/products/' +
            encodeURIComponent(id) +
            '/content',
            {
              product_id:id,
              type,
              title,
              description,
              text_content:
                type==='TEXT'
                  ? textContent
                  : undefined,
              url:
                type==='LINK'
                  ? url
                  : undefined,
              is_preview:
                access==='PREVIEW',
              access_type:access,
              sort_order:0
            },
            'POST',
            'Content berhasil ditambahkan.'
          );
        }

        await openOwnerContentManager(
          id,
          cfm.dataset.productName ||
            'Produk',
          cfm.dataset.productStatus ||
            'DRAFT',
          cfm.dataset.productHasThumbnail==='1'
        );
      }catch(err){
        toast.error(
          err.message ||
          'Operasi gagal.'
        );
      }finally{
        if(btn){
          btn.disabled=false;
          btn.removeAttribute(
            'aria-busy'
          );
          btn.textContent=
            originalText;
        }

        delete cfm.dataset.submitting;
      }
    }

    const sem=e.target.closest('[data-owner-service-form], [data-owner-service-edit]');if(sem){e.preventDefault();const fd=Object.fromEntries(new FormData(sem));fd.price=Number(fd.price||0);fd.sort_order=Number(fd.sort_order||0);fd.is_active=fd.is_active==='on';try{fd.requirements=fd.requirements?JSON.parse(fd.requirements):{};}catch{toast.error('Requirements harus JSON valid.');return}const id=fd.id;delete fd.id;if(id)await ownerAction('/api/owner/services/'+id,fd,'PUT','Service diperbarui.');else await ownerAction('/api/owner/services',fd,'POST','Service dibuat.');location.reload()}
    const ff=e.target.closest('[data-owner-faq-form], [data-owner-faq-edit]');if(ff){e.preventDefault();const fd=Object.fromEntries(new FormData(ff));fd.is_published=fd.is_published==='on';const id=fd.id;delete fd.id;try{if(id)await ownerAction('/api/owner/faq/'+id,fd,'PUT','FAQ diperbarui.');else await ownerAction('/api/owner/faq',fd,'POST','FAQ dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const fi=e.target.closest('[data-owner-info-form], [data-owner-info-edit]');if(fi){e.preventDefault();const fd=Object.fromEntries(new FormData(fi));fd.is_published=fd.is_published==='on';const id=fd.id;delete fd.id;try{if(id)await ownerAction('/api/owner/information/'+id,fd,'PUT','Information diperbarui.');else await ownerAction('/api/owner/information',fd,'POST','Information dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const sf=e.target.closest('[data-service-order-form]');if(sf){e.preventDefault();const fd=Object.fromEntries(new FormData(sf));const serviceId=fd.serviceId;delete fd.serviceId;fd.quantity=Number(fd.quantity||1);try{const r=await api.request('/api/service-orders',{method:'POST',body:{serviceId,requestData:fd}});toast.success('Service berhasil dipesan.');location.href='/orders/'+r.order.id}catch(err){toast.error(err.message)}}
    const nt=e.target.closest('[data-owner-notification-create]');if(nt){e.preventDefault();const fd=Object.fromEntries(new FormData(nt));if(!fd.user_id)fd.user_id=null;try{await ownerAction('/api/owner/notifications',fd,'POST','Notification dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const tf=e.target.closest('[data-owner-ticket-form]');if(tf){e.preventDefault();const fd=Object.fromEntries(new FormData(tf));try{if(fd.body)await ownerAction('/api/owner/tickets/'+fd.id+'/reply',{body:fd.body},'POST','Balasan dikirim.');await ownerAction('/api/owner/tickets/'+fd.id+'/status',{status:fd.status},'POST','Status ticket diperbarui.');location.reload()}catch(err){toast.error(err.message)}}
    const rf=e.target.closest('[data-refund-form]');if(rf){e.preventDefault();const fd=Object.fromEntries(new FormData(rf));try{await ownerAction('/api/owner/refunds/'+fd.order_id,{reason:fd.reason},'POST','Refund diproses.');location.reload()}catch(err){toast.error(err.message)}}
    const omf=e.target.closest('[data-owner-message-form]');if(omf){e.preventDefault();const fd=Object.fromEntries(new FormData(omf));try{await ownerAction('/api/owner/messages/'+fd.user_id+'/reply',{body:fd.body},'POST','Pesan dikirim.');location.reload()}catch(err){toast.error(err.message)}}
  });

  async function search(){
    const q=document.getElementById('search-query')?.value?.trim();
    const root=document.getElementById('search-results');

    if(!root)return;

    if(!q){
      root.innerHTML='';
      return;
    }

    root.innerHTML=
      '<div class="panel search-loading" aria-live="polite">'+
      'Mencari hasil untuk “'+esc(q)+'”…</div>';

    try{
      const r=await api.request(
        '/api/search?q='+encodeURIComponent(q)
      );

      const products=r.products||[];
      const categories=r.categories||[];
      const services=r.services||[];

      const productMarkup=products.length
        ? `<div class="product-grid">${products.map(p=>`
            <a class="list-card" href="/product/${encodeURIComponent(p.slug)}">
              <div>
                <strong>${esc(p.name)}</strong>
                <span>${esc(p.category_name||'Produk')}</span>
              </div>
              <b>${money(p.price)}</b>
            </a>
          `).join('')}</div>`
        : `<div class="empty-state">
            <h3>Produk tidak ditemukan</h3>
            <p>Coba kata kunci lain.</p>
          </div>`;

      const categoryMarkup=categories.length
        ? `<div class="search-chip-grid">${categories.map(c=>`
            <a class="category-card" href="/store?category=${encodeURIComponent(c.slug)}">
              <span class="category-card__content">
                <strong class="category-card__name">${esc(c.name)}</strong>
                <small class="category-card__description">
                  ${esc(c.description||'Lihat produk')}
                </small>
              </span>
              <span class="category-card__arrow" aria-hidden="true">→</span>
            </a>
          `).join('')}</div>`
        : `<div class="empty-state compact">
            <p>Tidak ada kategori yang cocok.</p>
          </div>`;

      const serviceMarkup=services.length
        ? `<div class="service-grid">${services.map(s=>`
            <article class="service-card">
              <div>
                <div class="eyebrow">${esc(s.category||'Layanan')}</div>
                <h3>${esc(s.name)}</h3>
                <p>${esc(s.description||'Layanan Jyy’R Store.')}</p>
              </div>
              <div class="service-footer">
                <strong>${money(s.price)}</strong>
                <button
                  class="button button-primary button-small"
                  type="button"
                  data-service-order="${esc(s.id)}"
                  data-service-name="${esc(s.name)}"
                  data-service-price="${esc(s.price)}"
                >Pesan</button>
              </div>
            </article>
          `).join('')}</div>`
        : `<div class="empty-state compact">
            <p>Tidak ada layanan yang cocok.</p>
          </div>`;

      root.innerHTML=`
        <div class="search-section">
          <div class="section-header">
            <div>
              <div class="eyebrow">Produk</div>
              <h2>Produk</h2>
            </div>
          </div>
          ${productMarkup}
        </div>

        <div class="search-section">
          <div class="section-header">
            <div>
              <div class="eyebrow">Kategori</div>
              <h2>Kategori</h2>
            </div>
          </div>
          ${categoryMarkup}
        </div>

        <div class="search-section">
          <div class="section-header">
            <div>
              <div class="eyebrow">Layanan</div>
              <h2>Layanan</h2>
            </div>
          </div>
          ${serviceMarkup}
        </div>
      `;
    }catch(err){
      root.innerHTML=`
        <div class="empty-state">
          <h3>Pencarian gagal</h3>
          <p>${esc(err.message||'Terjadi kesalahan saat mencari.')}</p>
          <button
            class="button button-secondary button-small"
            type="button"
            data-search-retry
          >Coba lagi</button>
        </div>
      `;
    }
  }

  document.querySelector('.filter-bar[action="/search"]')?.addEventListener('submit',e=>{e.preventDefault();history.pushState({},'', '/search?q='+encodeURIComponent(document.getElementById('search-query').value.trim()));search()}); if(location.pathname==='/search')search();
})();
