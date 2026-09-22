(function(){
  const api=window.JYYRApi,toast=window.JYYRToast;
  const money=v=>window.JYYR.formatIDR(v), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const csrf=()=>window.JYYR?.csrf||'';
  const svg=name=>({plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',x:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',package:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.5 9.4-9-5.1M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>'}[name]||'');

  async function ownerAction(url,body={},method='POST',ok='Selesai'){const r=await api.request(url,{method,body});toast.success(ok);return r;}
  async function uploadOwnerFile(productId,file,{contentType='THUMBNAIL',progressEl=null,statusEl=null}={}){
    if(!file) return null;
    return await new Promise((resolve,reject)=>{
      const x=new XMLHttpRequest();
      x.open('POST','/api/owner/products/'+encodeURIComponent(productId)+'/upload');
      x.withCredentials=true;
      x.setRequestHeader('X-CSRF-Token',csrf());
      x.upload.onprogress=e=>{
        if(e.lengthComputable){
          const pct=Math.round(e.loaded/e.total*100);
          if(progressEl){progressEl.hidden=false;progressEl.value=pct;}
          if(statusEl)statusEl.textContent=`Mengunggah thumbnail… ${pct}% · ${(e.loaded/1024/1024).toFixed(1)} / ${(e.total/1024/1024).toFixed(1)} MB`;
        }
      };
      x.onload=()=>{
        try{
          const v=JSON.parse(x.responseText);
          if(x.status>=200&&x.status<300&&v.success!==false) resolve(v);
          else reject(new Error(v.error?.message||'Upload thumbnail gagal.'));
        }catch{reject(new Error('Response upload thumbnail tidak valid.'))}
      };
      x.onerror=()=>reject(new Error('Network error saat upload thumbnail.'));
      x.onabort=()=>reject(new Error('Upload thumbnail dibatalkan.'));
      const fd=new FormData();
      fd.append('file',file);
      fd.append('contentType',contentType);
      x.send(fd);
    });
  }
  function open(html,onReady){window.JYYRModal.open(html);onReady?.();}
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
  document.querySelectorAll('table').forEach(table=>{const heads=[...table.querySelectorAll('thead th')].map(x=>x.textContent.trim());table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>{if(heads[i])cell.setAttribute('data-label',heads[i])}));});
  document.addEventListener('click',async e=>{
    const retry=e.target.closest('[data-retry]'); if(retry){location.reload();return}
    const openUrl=e.target.closest('[data-open-content-url]'); if(openUrl){window.open(openUrl.dataset.openContentUrl,'_blank','noopener');return}

    const add=e.target.closest('[data-add-cart]'); if(add){add.disabled=true;try{await api.request('/api/cart',{method:'POST',body:{productId:add.dataset.addCart,quantity:1}});toast.success('Produk ditambahkan ke cart.')}catch(err){toast.error(err.message)}finally{add.disabled=false}}
    const rm=e.target.closest('[data-cart-remove]'); if(rm){try{await api.request('/api/cart/'+rm.dataset.cartRemove,{method:'DELETE'});location.reload()}catch(err){toast.error(err.message)}}
    const minus=e.target.closest('[data-cart-minus]'),plus=e.target.closest('[data-cart-plus]'); if(minus||plus){const btn=minus||plus,id=btn.dataset[minus?'cartMinus':'cartPlus'],card=btn.closest('.cart-item');const qty=Number(card.querySelector('.quantity span').textContent)+(plus?1:-1);if(qty<1)return;try{await api.request('/api/cart/'+id,{method:'PUT',body:{quantity:qty}});location.reload()}catch(err){toast.error(err.message)}}
    const amount=e.target.closest('[data-deposit-amount]');if(amount){document.querySelectorAll('[data-deposit-amount]').forEach(x=>x.classList.remove('selected'));amount.classList.add('selected');const custom=document.getElementById('deposit-custom');if(custom)custom.value=Number(amount.dataset.depositAmount)}
    const read=e.target.closest('[data-read-notification]');if(read){try{await api.request('/api/notifications/'+read.dataset.readNotification+'/read',{method:'PUT'});read.closest('.notification-card')?.classList.remove('unread');read.remove()}catch(err){toast.error(err.message)}}
    const tab=e.target.closest('[data-tab-target]');if(tab){const name=tab.dataset.tabTarget;document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));tab.classList.add('active');document.querySelector(`[data-tab="${name}"]`)?.classList.add('active')}
    const dep=e.target.closest('[data-deposit-submit]');if(dep){const v=Number(document.getElementById('deposit-custom')?.value||0);if(v<1000)return toast.error('Minimum deposit Rp1.000.');dep.disabled=true;try{const r=await api.request('/api/deposit',{method:'POST',body:{amount:v,returnUrl:location.origin+'/deposit'}});if(r.paymentUrl)location.href=r.paymentUrl;else toast.success('Deposit dibuat.')}catch(err){toast.error(err.message)}finally{dep.disabled=false}}
    const checkout=e.target.closest('[data-checkout-confirm]');if(checkout){const method=document.getElementById('payment-method')?.value||'BALANCE';checkout.disabled=true;try{const r=await api.request('/api/orders',{method:'POST',body:{paymentMethod:method,returnUrl:location.origin+'/orders'}});if(r.payment?.paymentUrl)location.href=r.payment.paymentUrl;else location.href='/orders/'+r.order.id}catch(err){toast.error(err.message)}finally{checkout.disabled=false}}

    const download=e.target.closest('[data-download-content]');if(download){download.disabled=true;try{const r=await api.request('/api/download/'+download.dataset.downloadContent);if(r.url)window.open(r.url,'_blank','noopener');else if(r.content?.type==='TEXT')toast.success('Content teks tersedia di halaman.');else toast.error('Secure URL tidak tersedia.')}catch(err){toast.error(err.message)}finally{download.disabled=false}}
    const service=e.target.closest('[data-service-order]');if(service){open(`<form data-service-order-form class="stack-form"><h2>Pesan ${esc(service.dataset.serviceName)}</h2><p class="muted">Harga ${money(service.dataset.servicePrice)} akan dipotong dari saldo setelah konfirmasi.</p><input type="hidden" name="serviceId" value="${esc(service.dataset.serviceOrder)}"><label class="field"><span>Username (opsional)</span><input name="username"></label><label class="field"><span>URL (opsional)</span><input name="url" type="url"></label><label class="field"><span>Quantity</span><input name="quantity" type="number" min="1" value="1"></label><label class="field"><span>Target (opsional)</span><input name="target"></label><label class="field"><span>Notes</span><textarea name="notes"></textarea></label>${formButtons('Konfirmasi Service')}</form>`)}

    const dep2=e.target.closest('[data-owner-create]');if(dep2){const section=dep2.dataset.ownerCreate;const forms={
      categories:`<form data-owner-category-form class="stack-form"><h2>Tambah Kategori</h2><label class="field"><span>Nama</span><input name="name" required maxlength="80"></label><label class="field"><span>Slug (opsional)</span><input name="slug" maxlength="100"></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" checked></label>${formButtons()}}</form>`,
      products:`<form data-owner-product-form class="product-form-modal">
  <div class="product-modal-head">
    <div class="product-modal-kicker">Owner Store</div>
    <h2>Tambah Produk</h2>
    <p>Buat produk baru dan siapkan thumbnail sebelum ditampilkan di Store.</p>
  </div>

  <section class="product-modal-section">
    <div class="product-modal-section-title">
      <strong>Thumbnail Produk</strong>
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

      <label class="field full">
        <span>Status</span>
        <select name="status">
          <option>DRAFT</option>
          <option>PUBLISHED</option>
        </select>
      </label>
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

    const ep=e.target.closest('[data-owner-edit-product]');if(ep){let d;try{d=JSON.parse(ep.dataset.ownerEditProduct)}catch{return}open(`<form data-owner-product-edit class="stack-form"><h2>Edit Produk</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Nama</span><input name="name" value="${esc(d.name)}" required></label><label class="field"><span>Slug</span><input name="slug" value="${esc(d.slug)}"></label><label class="form-grid"><span class="field"><span>Harga</span><input name="price" type="number" min="0" value="${Number(d.price)||0}"></span><span class="field"><span>Stock</span><input name="stock" type="number" min="0" value="${Number(d.stock)||0}"></span></label><label class="field"><span>Description</span><textarea name="description">${esc(d.description||'')}</textarea></label><label class="field"><span>Thumbnail Produk</span>${d.thumbnail_url?`<img class="thumbnail-preview" data-current-thumbnail src="${esc(d.thumbnail_url)}" alt="Thumbnail saat ini">`:``}<input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" data-thumbnail-input><small class="muted">Pilih file baru untuk mengganti thumbnail.</small><img class="thumbnail-preview" data-thumbnail-preview alt="Preview thumbnail baru" hidden><progress data-thumbnail-progress value="0" max="100" hidden></progress><small class="muted" data-thumbnail-status>Belum ada thumbnail baru dipilih.</small></label><label class="field"><span>Status</span><select name="status"><option ${d.status==='DRAFT'?'selected':''}>DRAFT</option><option ${d.status==='PUBLISHED'?'selected':''}>PUBLISHED</option><option ${d.status==='ARCHIVED'?'selected':''}>ARCHIVED</option></select></label>${formButtons('Update Product')}</form>`)}

    const content=e.target.closest('[data-owner-content]');if(content){open(`<div class="stack-form"><h2>Tambah Product Content</h2><form data-owner-content-form data-product-id="${esc(content.dataset.ownerContent)}"><label class="field"><span>Type</span><select name="type"><option>FILE</option><option>IMAGE</option><option>VIDEO</option><option>AUDIO</option><option>TEXT</option><option>LINK</option></select></label><label class="field"><span>Title</span><input name="title" required></label><label class="field"><span>Description</span><textarea name="description"></textarea></label><label class="field content-field-text"><span>Text Content</span><textarea name="text_content"></textarea></label><label class="field content-field-link"><span>URL</span><input name="url" type="url"></label><label class="field"><span>Access</span><select name="access_type"><option>PURCHASED</option><option>PREVIEW</option><option>PUBLIC</option></select></label><label class="field"><span>Upload file (untuk FILE/IMAGE/VIDEO/AUDIO)</span><input name="file" type="file" accept="image/*,video/*,audio/*,.zip,.rar,.7z,.pdf"></label><progress data-upload-progress value="0" max="100" hidden></progress><small class="muted" data-upload-status>Preview akan menyesuaikan tipe content setelah file dipilih.</small>${formButtons('Add Content')}</form></div>`,()=>{})}

    const publish=e.target.closest('[data-owner-publish]');if(publish){if(!confirm('Publish produk ini?'))return;try{await ownerAction('/api/owner/products/'+publish.dataset.ownerPublish+'/publish',{},'POST','Produk dipublish.');location.reload()}catch(err){toast.error(err.message)}}
    const unpublish=e.target.closest('[data-owner-unpublish]');if(unpublish){if(!confirm('Unpublish produk ini?'))return;try{await ownerAction('/api/owner/products/'+unpublish.dataset.ownerUnpublish+'/unpublish',{},'POST','Produk di-unpublish.');location.reload()}catch(err){toast.error(err.message)}}
    const dup=e.target.closest('[data-owner-duplicate]');if(dup){try{await ownerAction('/api/owner/products/'+dup.dataset.ownerDuplicate+'/duplicate',{},'POST','Produk diduplikasi.');location.reload()}catch(err){toast.error(err.message)}}
    const delp=e.target.closest('[data-owner-delete-product]');if(delp){if(!confirm('Arsipkan produk ini? Data transaksi tidak dihapus.'))return;try{await ownerAction('/api/owner/products/'+delp.dataset.ownerDeleteProduct+'/delete',{},'DELETE','Produk diarsipkan.');location.reload()}catch(err){toast.error(err.message)}}
    const user=e.target.closest('[data-owner-user]');if(user){const id=user.dataset.ownerUser,status=user.dataset.ownerStatus,role=user.dataset.ownerRole;open(`<div class="stack-form"><h2>Kelola ${esc(user.dataset.ownerUsername)}</h2><p class="muted">Status: ${esc(status)} · Role: ${esc(role)}</p><div class="button-grid"><button class="button button-secondary" data-user-ban="${id}">Ban</button><button class="button button-secondary" data-user-unban="${id}">Unban</button><button class="button button-secondary" data-user-suspend="${id}">Suspend</button><button class="button button-secondary" data-user-unsuspend="${id}">Unsuspend</button><button class="button button-secondary" data-user-reset="${id}">Reset Sessions</button><button class="button button-danger" data-user-delete="${id}">Delete (Anonymize)</button></div><label class="field"><span>Role</span><select id="user-role-select"><option ${role==='USER'?'selected':''}>USER</option><option ${role==='MODERATOR'?'selected':''}>MODERATOR</option><option ${role==='ADMIN'?'selected':''}>ADMIN</option><option ${role==='OWNER'?'selected':''}>OWNER</option></select></label><button class="button button-primary" data-user-role="${id}">Change Role</button></div>`)}
    const tick=e.target.closest('[data-owner-ticket]');if(tick){open(`<form data-owner-ticket-form class="stack-form"><h2>${esc(tick.dataset.ownerTicketNumber)}</h2><input type="hidden" name="id" value="${esc(tick.dataset.ownerTicket)}"><label class="field"><span>Reply</span><textarea name="body" required></textarea></label><label class="field"><span>Status</span><select name="status"><option>OPEN</option><option>WAITING</option><option>REPLIED</option><option>CLOSED</option></select></label>${formButtons('Reply / Update')}</form>`)}
    const editCat=e.target.closest('[data-owner-edit-category]');if(editCat){let d;try{d=JSON.parse(editCat.dataset.ownerEditCategory)}catch{return}open(`<form data-owner-category-edit class="stack-form"><h2>Edit Kategori</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Nama</span><input name="name" value="${esc(d.name)}" required></label><label class="field"><span>Slug</span><input name="slug" value="${esc(d.slug)}"></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" ${d.is_active?'checked':''}></label>${formButtons()}</form>`)}
    const editSvc=e.target.closest('[data-owner-edit-service]');if(editSvc){let d;try{d=JSON.parse(editSvc.dataset.ownerEditService)}catch{return}open(`<form data-owner-service-edit class="stack-form"><h2>Edit Service</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Nama</span><input name="name" value="${esc(d.name)}" required></label><label class="field"><span>Kategori</span><input name="category" value="${esc(d.category||'')}"></label><label class="field"><span>Harga</span><input name="price" type="number" value="${Number(d.price)||0}" min="0"></label><label class="field"><span>Description</span><textarea name="description">${esc(d.description||'')}</textarea></label><label class="switch-row"><span>Aktif</span><input type="checkbox" name="is_active" ${d.is_active?'checked':''}></label>${formButtons()}</form>`)}
    const editFaq=e.target.closest('[data-owner-edit-faq]');if(editFaq){let d;try{d=JSON.parse(editFaq.dataset.ownerEditFaq)}catch{return}open(`<form data-owner-faq-edit class="stack-form"><h2>Edit FAQ</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Category</span><input name="category" value="${esc(d.category)}"></label><label class="field"><span>Question</span><input name="question" value="${esc(d.question)}"></label><label class="field"><span>Answer</span><textarea name="answer">${esc(d.answer)}</textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" ${d.is_published?'checked':''}></label>${formButtons()}</form>`)}
    const editInfo=e.target.closest('[data-owner-edit-info]');if(editInfo){let d;try{d=JSON.parse(editInfo.dataset.ownerEditInfo)}catch{return}open(`<form data-owner-info-edit class="stack-form"><h2>Edit Information</h2><input type="hidden" name="id" value="${esc(d.id)}"><label class="field"><span>Type</span><input name="type" value="${esc(d.type)}"></label><label class="field"><span>Title</span><input name="title" value="${esc(d.title)}"></label><label class="field"><span>Body</span><textarea name="body">${esc(d.body)}</textarea></label><label class="switch-row"><span>Published</span><input type="checkbox" name="is_published" ${d.is_published?'checked':''}></label>${formButtons()}</form>`)}

    const b=e.target.closest('[data-user-ban]');if(b&&confirm('Ban user ini?')){try{await ownerAction('/api/owner/users/'+b.dataset.userBan+'/ban');location.reload()}catch(err){toast.error(err.message)}}
    const ub=e.target.closest('[data-user-unban]');if(ub){try{await ownerAction('/api/owner/users/'+ub.dataset.userUnban+'/unban');location.reload()}catch(err){toast.error(err.message)}}
    const su=e.target.closest('[data-user-suspend]');if(su&&confirm('Suspend user ini?')){try{await ownerAction('/api/owner/users/'+su.dataset.userSuspend+'/suspend');location.reload()}catch(err){toast.error(err.message)}}
    const usu=e.target.closest('[data-user-unsuspend]');if(usu){try{await ownerAction('/api/owner/users/'+usu.dataset.userUnsuspend+'/unsuspend');location.reload()}catch(err){toast.error(err.message)}}
    const rs=e.target.closest('[data-user-reset]');if(rs){try{await ownerAction('/api/owner/users/'+rs.dataset.userReset+'/reset-sessions');toast.success('Session user direset.')}catch(err){toast.error(err.message)}}
    const du=e.target.closest('[data-user-delete]');if(du&&confirm('Anonymize account ini? Histori order/payment dipertahankan.')){try{await ownerAction('/api/owner/users/'+du.dataset.userDelete,{},'DELETE','User dianonymisasi.');location.reload()}catch(err){toast.error(err.message)}}
    const cr=e.target.closest('[data-user-role]');if(cr){const role=document.getElementById('user-role-select')?.value;if(role&&confirm('Ubah role user?')){try{await ownerAction('/api/owner/users/'+cr.dataset.userRole+'/change-role',{role});location.reload()}catch(err){toast.error(err.message)}}}
    const oi=e.target.closest('[data-owner-order-inspect]');if(oi){let d;try{d=JSON.parse(oi.dataset.ownerOrderInspect)}catch{return}open(`<div class="stack-form"><h2>Order ${esc(d.order_number||d.id)}</h2><div class="summary-row"><span>User</span><b>${esc(d.username||'—')}</b></div><div class="summary-row"><span>Total</span><b>${money(d.total)}</b></div><div class="summary-row"><span>Status</span><b>${esc(d.status)}</b></div><div class="summary-row"><span>Payment</span><b>${esc(d.payment_method||'—')}</b></div><p class="muted">Payment gateway tetap harus dikonfirmasi oleh webhook resmi. Owner hanya dapat menjalankan transisi fulfillment yang valid.</p><button class="button button-secondary button-block" type="button" data-modal-close>Tutup</button></div>`)}
    const os=e.target.closest('[data-owner-order-status]');if(os){if(!confirm(`Ubah status order ke ${os.dataset.status}?`))return;try{await ownerAction('/api/owner/orders/'+os.dataset.ownerOrderStatus+'/status',{status:os.dataset.status},'POST','Status order diperbarui.');location.reload()}catch(err){toast.error(err.message)}}
    const rb=e.target.closest('[data-owner-refund-order]');if(rb){open(`<form data-refund-form class="stack-form"><h2>Refund Order</h2><input type="hidden" name="order_id" value="${esc(rb.dataset.ownerRefundOrder)}"><label class="field"><span>Alasan</span><textarea name="reason" minlength="5" required></textarea></label>${formButtons('Process Refund')}</form>`)}
    const om=e.target.closest('[data-owner-message]');if(om){open(`<form data-owner-message-form class="stack-form"><h2>Balas Pesan</h2><input type="hidden" name="user_id" value="${esc(om.dataset.ownerMessage)}"><label class="field"><span>Pesan</span><textarea name="body" minlength="1" maxlength="10000" required></textarea></label>${formButtons('Kirim Pesan')}</form>`)}
  });

  if(location.pathname==='/owner/products' && new URLSearchParams(location.search).get('create')==='1') setTimeout(()=>document.querySelector('[data-owner-create="products"]')?.click(),0);

  document.addEventListener('submit',async e=>{
    const auth=e.target.closest('[data-auth-form]'); if(auth){e.preventDefault();const type=auth.dataset.authForm;const body=Object.fromEntries(new FormData(auth));const path=type==='login'?'/api/auth/login':type==='register'?'/api/auth/register':type==='forgot'?'/api/auth/forgot-password':'/api/auth/reset-password';const btn=auth.querySelector('button');btn.disabled=true;try{const r=await api.request(path,{method:'POST',body});if(type==='login')location.href='/dashboard';else if(type==='register')location.href='/auth/login?error=Registrasi berhasil. Periksa email jika verification aktif.';else toast.success(r.message||'Request diterima.')}catch(err){toast.error(err.message)}finally{btn.disabled=false}}
    const pf=e.target.closest('#profile-form');if(pf){e.preventDefault();try{await api.request('/api/profile',{method:'PUT',body:Object.fromEntries(new FormData(pf))});toast.success('Profil diperbarui.')}catch(err){toast.error(err.message)}}
    const reply=e.target.closest('[data-ticket-reply]');if(reply){e.preventDefault();const body=new FormData(reply).get('body');try{await api.request('/api/tickets/'+reply.dataset.ticketReply+'/messages',{method:'POST',body:{body}});location.reload()}catch(err){toast.error(err.message)}}
    const msg=e.target.closest('[data-message-form]');if(msg){e.preventDefault();const body=new FormData(msg).get('body');const btn=msg.querySelector('button');btn.disabled=true;try{await api.request('/api/messages',{method:'POST',body:{body}});toast.success('Pesan terkirim.');location.reload()}catch(err){toast.error(err.message)}finally{btn.disabled=false}}
    const maint=e.target.closest('[data-owner-maintenance]');if(maint){e.preventDefault();const fd=new FormData(maint);const body={enabled:fd.get('enabled')==='on',title:fd.get('title'),message:fd.get('message'),scheduled_start:fd.get('scheduled_start')||null,scheduled_end:fd.get('scheduled_end')||null,allow_owner_access:fd.get('allow_owner_access')==='on'};try{await api.request('/api/owner/maintenance',{method:'PUT',body});toast.success('Maintenance setting tersimpan.')}catch(err){toast.error(err.message)}}
    const form=e.target.closest('[data-deposit-submit]');if(form){e.preventDefault()}
    const category=e.target.closest('[data-owner-category-form], [data-owner-category-edit]');if(category){e.preventDefault();const fd=Object.fromEntries(new FormData(category));fd.is_active=fd.is_active==='on';try{const id=fd.id;if(id)await ownerAction('/api/owner/categories/'+id,{name:fd.name,slug:fd.slug,is_active:fd.is_active},'PUT','Kategori diperbarui.');else await ownerAction('/api/owner/categories',{name:fd.name,slug:fd.slug,is_active:fd.is_active},'POST','Kategori dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const pfm=e.target.closest('[data-owner-product-form]');if(pfm){e.preventDefault();const formData=new FormData(pfm);const thumbnail=formData.get('thumbnail');const fd=Object.fromEntries(formData);delete fd.thumbnail;fd.price=Number(fd.price);fd.stock=Number(fd.stock);if(!fd.category_id)fd.category_id=null;try{const created=await ownerAction('/api/owner/products',fd,'POST','Produk dibuat.');if(thumbnail instanceof File && thumbnail.size){const progress=pfm.querySelector('[data-thumbnail-progress]'),status=pfm.querySelector('[data-thumbnail-status]');await uploadOwnerFile(created.id,thumbnail,{contentType:'THUMBNAIL',progressEl:progress,statusEl:status});toast.success('Produk dan thumbnail berhasil disimpan.')}window.JYYRModal.close();location.reload()}catch(err){toast.error(err.message)}}
    const pem=e.target.closest('[data-owner-product-edit]');if(pem){e.preventDefault();const formData=new FormData(pem);const thumbnail=formData.get('thumbnail');const fd=Object.fromEntries(formData);const id=fd.id;delete fd.id;delete fd.thumbnail;fd.price=Number(fd.price);fd.stock=Number(fd.stock);try{await ownerAction('/api/owner/products/'+id,fd,'PUT','Produk diperbarui.');if(thumbnail instanceof File && thumbnail.size){const progress=pem.querySelector('[data-thumbnail-progress]'),status=pem.querySelector('[data-thumbnail-status]');await uploadOwnerFile(id,thumbnail,{contentType:'THUMBNAIL',progressEl:progress,statusEl:status});toast.success('Thumbnail berhasil diperbarui.')}window.JYYRModal.close();location.reload()}catch(err){toast.error(err.message)}}
    const cfm=e.target.closest('[data-owner-content-form]');if(cfm){e.preventDefault();const fd=new FormData(cfm),type=fd.get('type'),id=fd.get('product_id')||cfm.dataset.productId,file=fd.get('file');try{if(file&&file.size&&['FILE','IMAGE','VIDEO','AUDIO'].includes(type)){fd.append('contentType',type);const progress=cfm.querySelector('[data-upload-progress]'),status=cfm.querySelector('[data-upload-status]');if(progress)progress.hidden=false;const out=await new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','/api/owner/products/'+id+'/upload');x.withCredentials=true;x.setRequestHeader('X-CSRF-Token',csrf());x.upload.onprogress=e=>{if(e.lengthComputable){const pct=Math.round(e.loaded/e.total*100);if(progress)progress.value=pct;if(status)status.textContent=`Uploading… ${pct}% · ${(e.loaded/1024/1024).toFixed(1)} / ${(e.total/1024/1024).toFixed(1)} MB`;}};x.onload=()=>{try{const v=JSON.parse(x.responseText);if(x.status>=200&&x.status<300&&v.success!==false)resolve(v);else reject(new Error(v.error?.message||'Upload gagal'))}catch{reject(new Error('Response upload tidak valid.'))}};x.onerror=()=>reject(new Error('Network error saat upload.'));x.onabort=()=>reject(new Error('Upload dibatalkan.'));x.send(fd)});toast.success('Content berhasil diupload.')}else{const body=Object.fromEntries(fd);delete body.file;body.is_preview=fd.get('is_preview')==='on';await ownerAction('/api/owner/products/'+id+'/content',body,'POST','Content dibuat.')}window.JYYRModal.close();location.reload()}catch(err){toast.error(err.message)}}
    const sem=e.target.closest('[data-owner-service-form], [data-owner-service-edit]');if(sem){e.preventDefault();const fd=Object.fromEntries(new FormData(sem));fd.price=Number(fd.price||0);fd.sort_order=Number(fd.sort_order||0);fd.is_active=fd.is_active==='on';try{fd.requirements=fd.requirements?JSON.parse(fd.requirements):{};}catch{toast.error('Requirements harus JSON valid.');return}const id=fd.id;delete fd.id;if(id)await ownerAction('/api/owner/services/'+id,fd,'PUT','Service diperbarui.');else await ownerAction('/api/owner/services',fd,'POST','Service dibuat.');location.reload()}
    const ff=e.target.closest('[data-owner-faq-form], [data-owner-faq-edit]');if(ff){e.preventDefault();const fd=Object.fromEntries(new FormData(ff));fd.is_published=fd.is_published==='on';const id=fd.id;delete fd.id;try{if(id)await ownerAction('/api/owner/faq/'+id,fd,'PUT','FAQ diperbarui.');else await ownerAction('/api/owner/faq',fd,'POST','FAQ dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const fi=e.target.closest('[data-owner-info-form], [data-owner-info-edit]');if(fi){e.preventDefault();const fd=Object.fromEntries(new FormData(fi));fd.is_published=fd.is_published==='on';const id=fd.id;delete fd.id;try{if(id)await ownerAction('/api/owner/information/'+id,fd,'PUT','Information diperbarui.');else await ownerAction('/api/owner/information',fd,'POST','Information dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const sf=e.target.closest('[data-service-order-form]');if(sf){e.preventDefault();const fd=Object.fromEntries(new FormData(sf));const serviceId=fd.serviceId;delete fd.serviceId;fd.quantity=Number(fd.quantity||1);try{const r=await api.request('/api/service-orders',{method:'POST',body:{serviceId,requestData:fd}});toast.success('Service berhasil dipesan.');location.href='/orders/'+r.order.id}catch(err){toast.error(err.message)}}
    const nt=e.target.closest('[data-owner-notification-create]');if(nt){e.preventDefault();const fd=Object.fromEntries(new FormData(nt));if(!fd.user_id)fd.user_id=null;try{await ownerAction('/api/owner/notifications',fd,'POST','Notification dibuat.');location.reload()}catch(err){toast.error(err.message)}}
    const tf=e.target.closest('[data-owner-ticket-form]');if(tf){e.preventDefault();const fd=Object.fromEntries(new FormData(tf));try{if(fd.body)await ownerAction('/api/owner/tickets/'+fd.id+'/reply',{body:fd.body},'POST','Balasan dikirim.');await ownerAction('/api/owner/tickets/'+fd.id+'/status',{status:fd.status},'POST','Status ticket diperbarui.');location.reload()}catch(err){toast.error(err.message)}}
    const rf=e.target.closest('[data-refund-form]');if(rf){e.preventDefault();const fd=Object.fromEntries(new FormData(rf));try{await ownerAction('/api/owner/refunds/'+fd.order_id,{reason:fd.reason},'POST','Refund diproses.');location.reload()}catch(err){toast.error(err.message)}}
    const omf=e.target.closest('[data-owner-message-form]');if(omf){e.preventDefault();const fd=Object.fromEntries(new FormData(omf));try{await ownerAction('/api/owner/messages/'+fd.user_id+'/reply',{body:fd.body},'POST','Pesan dikirim.');location.reload()}catch(err){toast.error(err.message)}}
  });

  async function search(){const q=document.getElementById('search-query')?.value?.trim(),root=document.getElementById('search-results');if(!root||!q)return;root.innerHTML='<div class="panel">Mencari...</div>';try{const r=await api.request('/api/search?q='+encodeURIComponent(q));root.innerHTML=`<div class="section"><h2>Produk</h2><div class="product-grid">${(r.products||[]).map(p=>`<a class="list-card" href="/product/${encodeURIComponent(p.slug)}"><div><strong>${esc(p.name)}</strong><span>${esc(p.category_name||'Product')}</span></div><b>${money(p.price)}</b></a>`).join('')||'<div class="empty-state"><h3>Tidak ada produk</h3></div>'}</div></div>`}catch(err){root.innerHTML='<div class="empty-state"><h3>Gagal memuat hasil</h3><p>'+esc(err.message)+'</p></div>'}}
  document.querySelector('.filter-bar[action="/search"]')?.addEventListener('submit',e=>{e.preventDefault();history.pushState({},'', '/search?q='+encodeURIComponent(document.getElementById('search-query').value.trim()));search()}); if(location.pathname==='/search')search();
})();
