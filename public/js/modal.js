(() => {
  const state = {
    previousFocus: null,
    onKeydown: null,
    pendingConfirm: null
  };

  function focusables(root) {
    return [...root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )].filter(el => {
      const style=window.getComputedStyle(el);
      return (
        style.visibility!=='hidden' &&
        style.display!=='none' &&
        !el.matches(
          '.jyyr-native-file-input,input[type="file"]'
        )
      );
    });
  }

  function ensureStyles() {
    if(document.getElementById('jyyr-accessibility-runtime')) return;
    const style=document.createElement('style');
    style.id='jyyr-accessibility-runtime';
    style.textContent=`
      .modal-close,.icon-button{min-width:44px;min-height:44px}
      .button,.button-block{min-height:44px}
      :focus-visible{outline:2px solid currentColor;outline-offset:3px}
      @media (prefers-reduced-motion: reduce){
        *,*::before,*::after{
          scroll-behavior:auto!important;
          animation-duration:.01ms!important;
          animation-iteration-count:1!important;
          transition-duration:.01ms!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function close(result=false) {
    const root=document.getElementById('modal-root');
    if(!root) return;

    if(state.onKeydown) document.removeEventListener('keydown',state.onKeydown,true);
    state.onKeydown=null;
    root.innerHTML='';
    document.body.classList.remove('no-scroll');

    const target=state.previousFocus;
    state.previousFocus=null;

    const pending=state.pendingConfirm;
    state.pendingConfirm=null;

    if(pending) pending(Boolean(result));

    if(target && target.isConnected && typeof target.focus==='function'){
      requestAnimationFrame(()=>target.focus({preventScroll:true}));
    }
  }

  function open(html) {
    const root=document.getElementById('modal-root');
    if(!root) return;
    ensureStyles();
    if(state.onKeydown) document.removeEventListener('keydown',state.onKeydown,true);
    state.previousFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;

    root.innerHTML=`<div class="modal-backdrop" data-modal-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Dialog">
        ${html}
        <button class="icon-button modal-close" type="button" aria-label="Close" data-modal-close>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
    </div>`;

    const backdrop=root.querySelector('[data-modal-backdrop]');
    const dialog=root.querySelector('.modal');
    const title=dialog?.querySelector('h1,h2,h3,h4,h5,h6');
    if(title){
      title.id=title.id||'jyyr-modal-title';
      dialog.removeAttribute('aria-label');
      dialog.setAttribute('aria-labelledby',title.id);
    }

    backdrop?.addEventListener('click',e=>{
      if(e.target===backdrop) close();
    });

    state.onKeydown=e=>{
      if(e.key==='Escape'){
        e.preventDefault();
        close();
        return;
      }
      if(e.key!=='Tab'||!dialog) return;
      const items=focusables(dialog);
      if(!items.length) return;
      const first=items[0];
      const last=items[items.length-1];
      if(e.shiftKey && document.activeElement===first){
        e.preventDefault();
        last.focus();
      }else if(!e.shiftKey && document.activeElement===last){
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown',state.onKeydown,true);
    document.body.classList.add('no-scroll');

    const items=focusables(dialog||root);
    (items[0]||dialog)?.focus?.();
  }


  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }

  function confirm(message){
    return new Promise(resolve=>{
      open(`
        <div class="stack-form">
          <h2>Konfirmasi</h2>
          <p class="muted">${escapeHtml(message)}</p>
          <div class="inline-actions">
            <button
              class="button button-secondary"
              type="button"
              data-jyyr-confirm-cancel
            >Batal</button>
            <button
              class="button button-primary"
              type="button"
              data-jyyr-confirm-ok
            >Lanjutkan</button>
          </div>
        </div>
      `);

      state.pendingConfirm=resolve;
    });
  }

  window.JYYRModal={open,close,confirm};
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-jyyr-confirm-ok]')){
      close(true);
      return;
    }

    if(e.target.closest('[data-jyyr-confirm-cancel]')){
      close(false);
      return;
    }

    if(e.target.closest('[data-modal-close]')){
      close(false);
    }
  });
})();
