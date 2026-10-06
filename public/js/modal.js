(() => {
  const state = {
    previousFocus: null,
    onKeydown: null,
    pendingConfirm: null,
    onViewportResize: null
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
      .modal:not(.modal-confirm) .modal-close,
      .modal:not(.modal-confirm) .icon-button{min-width:44px;min-height:44px}
      .modal:not(.modal-confirm) .button,
      .modal:not(.modal-confirm) .button-block{min-height:44px}
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

    if(state.onKeydown){
      document.removeEventListener(
        'keydown',
        state.onKeydown,
        true
      );
    }

    if(
      state.onViewportResize &&
      window.visualViewport
    ){
      window.visualViewport.removeEventListener(
        'resize',
        state.onViewportResize
      );

      window.visualViewport.removeEventListener(
        'scroll',
        state.onViewportResize
      );
    }

    state.onKeydown=null;
    state.onViewportResize=null;

    root.style.removeProperty('--jyyr-modal-vh');
    root.style.removeProperty('--jyyr-modal-offset-top');

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

  function open(html, modalClass=''){
    const root=document.getElementById('modal-root');
    if(!root) return;
    ensureStyles();
    if(state.onKeydown) document.removeEventListener('keydown',state.onKeydown,true);
    state.previousFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;

    root.innerHTML=`<div class="modal-backdrop" data-modal-backdrop>
      <div class="modal${modalClass ? ` ${modalClass}` : ''}" role="dialog" aria-modal="true" aria-label="Dialog">
        ${html}
        <button class="icon-button modal-close" type="button" aria-label="Close" data-modal-close>
          ${window.JYYRIcon?.('circle-x','icon icon-circle-x')||''}
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

    const syncViewport=()=>{
      if(!dialog) return;

      const viewportHeight=
        window.visualViewport?.height ||
        window.innerHeight;

      const viewportOffsetTop=
        window.visualViewport?.offsetTop ||
        0;

      root.style.setProperty(
        '--jyyr-modal-vh',
        `${Math.max(0,viewportHeight)}px`
      );

      root.style.setProperty(
        '--jyyr-modal-offset-top',
        `${viewportOffsetTop}px`
      );
    };

    const ensureFocusedFieldVisible=()=>{
      const active=document.activeElement;

      if(
        active &&
        dialog &&
        dialog.contains(active) &&
        (
          active.matches('input,textarea,select') ||
          active.isContentEditable
        )
      ){
        requestAnimationFrame(()=>{
          const dialogRect=dialog.getBoundingClientRect();
          const activeRect=active.getBoundingClientRect();
          const edge=24;

          if(activeRect.bottom > dialogRect.bottom-edge){
            dialog.scrollTop +=
              activeRect.bottom -
              (dialogRect.bottom-edge);
          }else if(activeRect.top < dialogRect.top+edge){
            dialog.scrollTop -=
              (dialogRect.top+edge) -
              activeRect.top;
          }
        });
      }
    };

    syncViewport();

    if(window.visualViewport){
      state.onViewportResize=()=>{
        syncViewport();
        ensureFocusedFieldVisible();
      };

      window.visualViewport.addEventListener(
        'resize',
        state.onViewportResize
      );

      window.visualViewport.addEventListener(
        'scroll',
        state.onViewportResize
      );
    }

    dialog?.addEventListener(
      'focusin',
      ensureFocusedFieldVisible
    );

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
        <div class="stack-form modal-confirm-form">
          <h2>Konfirmasi</h2>
          <p class="muted">${escapeHtml(message)}</p>
          <div class="inline-actions">
            <button
              class="button button-secondary"
              type="button"
              data-jyyr-confirm-cancel
            >${window.JYYRIcon?.('circle-x','icon icon-circle-x')||''}Batal</button>
            <button
              class="button button-primary"
              type="button"
              data-jyyr-confirm-ok
            >Lanjutkan</button>
          </div>
        </div>
      `, 'modal-confirm');

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
