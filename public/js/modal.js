window.JYYRModal={
  open(html){
    const root=document.getElementById('modal-root');
    root.innerHTML=`<div class="modal-backdrop" data-modal-backdrop><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}<button class="icon-button modal-close" aria-label="Close" data-modal-close><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div>`;
    const backdrop=root.querySelector('[data-modal-backdrop]');
    backdrop?.addEventListener('click',e=>{if(e.target===backdrop)window.JYYRModal.close()});
    document.body.classList.add('no-scroll');
    root.querySelector('input,textarea,select,button')?.focus();
  },
  close(){const root=document.getElementById('modal-root');if(root)root.innerHTML='';document.body.classList.remove('no-scroll')}
};
document.addEventListener('click',e=>{if(e.target.closest('[data-modal-close]'))window.JYYRModal.close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.JYYRModal.close()});
