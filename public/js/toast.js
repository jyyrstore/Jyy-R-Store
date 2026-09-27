(() => {
  const active = new Map();

  const config = {
    success: {
      title: 'Berhasil',
      icon: 'check'
    },
    error: {
      title: 'Terjadi kesalahan',
      icon: 'circle-x'
    },
    info: {
      title: 'Informasi',
      icon: 'info'
    },
    warning: {
      title: 'Perhatian',
      icon: 'info'
    }
  };

  function escapeHtml(value){
    return String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
      }[char])
    );
  }

  function show(message,type='info',options={}){
    const root=document.getElementById('toast-root');

    if(!root)return;

    const safeType=
      config[type]
        ? type
        : 'info';

    const settings=config[safeType];

    const text=String(message ?? '').trim();

    if(!text)return;

    const duration=Math.max(
      1800,
      Number(options.duration)||3200
    );

    const key=`${safeType}|${text}`;

    const existing=active.get(key);

    if(existing){
      clearTimeout(existing.timer);

      existing.timer=setTimeout(
        () => close(existing.el,key),
        duration
      );

      existing.el.classList.remove('toast-pulse');

      requestAnimationFrame(()=>{
        existing.el.classList.add('toast-pulse');
      });

      return existing.el;
    }

    const el=document.createElement('div');

    el.className=`toast ${safeType}`;
    el.setAttribute(
      'role',
      safeType==='error'
        ? 'alert'
        : 'status'
    );
    el.setAttribute(
      'aria-live',
      safeType==='error'
        ? 'assertive'
        : 'polite'
    );

    const title=
      options.title ||
      settings.title;

    const icon=
      window.JYYRIcon?.(
        settings.icon,
        'icon toast-icon'
      ) ||
      '';

    el.innerHTML=`
      <span class="toast-icon-wrap" aria-hidden="true">
        ${icon}
      </span>

      <span class="toast-content">
        <strong class="toast-title">
          ${escapeHtml(title)}
        </strong>

        <span class="toast-message">
          ${escapeHtml(text)}
        </span>
      </span>

      <button
        class="toast-close"
        type="button"
        aria-label="Tutup notifikasi"
      >×</button>
    `;

    const closeButton=
      el.querySelector('.toast-close');

    closeButton?.addEventListener(
      'click',
      () => close(el,key)
    );

    root.appendChild(el);

    const timer=setTimeout(
      () => close(el,key),
      duration
    );

    active.set(
      key,
      {
        el,
        timer
      }
    );

    return el;
  }

  function close(el,key){
    const entry=active.get(key);

    if(entry?.timer){
      clearTimeout(entry.timer);
    }

    active.delete(key);

    el.classList.add('toast-closing');

    setTimeout(()=>{
      el.remove();
    },180);
  }

  window.JYYRToast={
    show,

    success(message,options={}){
      return show(
        message,
        'success',
        options
      );
    },

    error(message,options={}){
      return show(
        message,
        'error',
        options
      );
    },

    info(message,options={}){
      return show(
        message,
        'info',
        options
      );
    },

    warning(message,options={}){
      return show(
        message,
        'warning',
        options
      );
    }
  };
})();
