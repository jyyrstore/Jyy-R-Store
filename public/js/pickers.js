(() => {
  const state = {
    activeSelect:null
  };

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[c]));

  function syncSelect(root){
    const value=root?.querySelector('[data-jyyr-select-value]');
    const label=root?.querySelector('[data-jyyr-select-label]');
    if(!value||!label)return;

    const current=String(value.value||'');
    const options=[
      ...root.querySelectorAll('[data-jyyr-select-option]')
    ];

    const selected=
      options.find(
        option=>String(option.dataset.value||'')===current
      )||options[0];

    if(selected){
      label.textContent=
        selected.dataset.label||
        selected.textContent.trim();
    }

    options.forEach(option=>{
      const selected=
        String(option.dataset.value||'')===current;

      option.classList.toggle('active',selected);
      option.setAttribute(
        'aria-selected',
        selected?'true':'false'
      );
    });
  }

  function positionSelect(root){
    const trigger=root?.querySelector(
      '[data-jyyr-select-trigger]'
    );
    const menu=root?.querySelector(
      '[data-jyyr-select-menu]'
    );

    if(!trigger||!menu)return;

    const rect=trigger.getBoundingClientRect();
    const width=Math.max(160,rect.width);
    const height=Math.min(
      260,
      Math.max(80,menu.scrollHeight||260)
    );

    let top=rect.bottom+7;

    if(
      window.innerHeight-rect.bottom<height+12 &&
      rect.top>window.innerHeight-rect.bottom
    ){
      top=rect.top-height-7;
    }

    menu.style.left=`${Math.round(rect.left)}px`;
    menu.style.top=`${Math.round(Math.max(8,top))}px`;
    menu.style.width=`${Math.round(width)}px`;
  }

  function closeSelect(){
    const root=state.activeSelect;
    if(!root)return;

    root.classList.remove('open');

    root.querySelector(
      '[data-jyyr-select-trigger]'
    )?.setAttribute(
      'aria-expanded',
      'false'
    );

    const menu=root.querySelector(
      '[data-jyyr-select-menu]'
    );

    if(menu){
      menu.style.left='';
      menu.style.top='';
      menu.style.width='';
    }

    state.activeSelect=null;
  }

  function openSelect(root,focusIndex=null){
    if(!root)return;

    if(state.activeSelect===root){
      closeSelect();
      return;
    }

    closeSelect();

    const trigger=root.querySelector(
      '[data-jyyr-select-trigger]'
    );

    const options=[
      ...root.querySelectorAll(
        '[data-jyyr-select-option]'
      )
    ];

    if(!trigger||!options.length)return;

    syncSelect(root);

    root.classList.add('open');

    trigger.setAttribute(
      'aria-expanded',
      'true'
    );

    state.activeSelect=root;

    positionSelect(root);

    const value=root.querySelector(
      '[data-jyyr-select-value]'
    );

    const currentIndex=options.findIndex(
      option=>
        String(option.dataset.value||'')===
        String(value?.value||'')
    );

    const index=
      focusIndex===null
        ? Math.max(0,currentIndex)
        : Math.max(
            0,
            Math.min(
              options.length-1,
              focusIndex
            )
          );

    options[index]?.focus();
  }

  function chooseOption(option){
    const root=option.closest(
      '[data-jyyr-select]'
    );

    if(!root)return;

    const value=root.querySelector(
      '[data-jyyr-select-value]'
    );

    if(!value)return;

    value.value=
      String(option.dataset.value||'');

    syncSelect(root);

    value.dispatchEvent(
      new Event('input',{bubbles:true})
    );

    value.dispatchEvent(
      new Event('change',{bubbles:true})
    );

    closeSelect();

    requestAnimationFrame(()=>{
      root.querySelector(
        '[data-jyyr-select-trigger]'
      )?.focus({
        preventScroll:true
      });
    });
  }

  function pad(v){
    return String(v).padStart(2,'0');
  }

  function formatDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')){
      return 'Pilih tanggal';
    }

    const [y,m,d]=value.split('-').map(Number);

    return new Intl.DateTimeFormat(
      'id-ID',
      {
        day:'2-digit',
        month:'short',
        year:'numeric'
      }
    ).format(
      new Date(y,m-1,d)
    );
  }

  function formatDateTime(value){
    const match=
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
        .exec(value||'');

    if(!match){
      return 'Pilih tanggal & waktu';
    }

    const [,
      y,
      m,
      d,
      h,
      min
    ]=match.map(Number);

    return (
      new Intl.DateTimeFormat(
        'id-ID',
        {
          day:'2-digit',
          month:'short',
          year:'numeric'
        }
      ).format(
        new Date(y,m-1,d,h,min)
      )+
      ` · ${pad(h)}:${pad(min)}`
    );
  }

  function parseDate(input){
    const mode=
      input.dataset.jyyrPickerMode||'date';

    const raw=
      input.dataset.jyyrValue||'';

    if(
      mode==='datetime' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
    ){
      const [date,time]=raw.split('T');
      const [year,month,day]=
        date.split('-').map(Number);
      const [hour,minute]=
        time.split(':').map(Number);

      return {
        year,
        month:month-1,
        day,
        hour,
        minute
      };
    }

    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      const [year,month,day]=
        raw.split('-').map(Number);

      return {
        year,
        month:month-1,
        day,
        hour:9,
        minute:0
      };
    }

    const now=new Date();

    return {
      year:now.getFullYear(),
      month:now.getMonth(),
      day:now.getDate(),
      hour:now.getHours(),
      minute:Math.floor(now.getMinutes()/5)*5
    };
  }

  function toISO(value,mode){
    const date=
      `${value.year}-${pad(value.month+1)}-${pad(value.day)}`;

    return mode==='datetime'
      ? `${date}T${pad(value.hour)}:${pad(value.minute)}`
      : date;
  }

  function renderCalendar(root,stateValue){
    const title=
      root.querySelector(
        '[data-jyyr-calendar-title]'
      );

    const calendar=
      root.querySelector(
        '[data-jyyr-calendar]'
      );

    if(!title||!calendar)return;

    title.textContent=
      new Intl.DateTimeFormat(
        'id-ID',
        {
          month:'long',
          year:'numeric'
        }
      ).format(
        new Date(
          stateValue.year,
          stateValue.month,
          1
        )
      );

    const first=
      new Date(
        stateValue.year,
        stateValue.month,
        1
      );

    const last=
      new Date(
        stateValue.year,
        stateValue.month+1,
        0
      ).getDate();

    const offset=
      (first.getDay()+6)%7;

    const cells=
      Math.ceil((offset+last)/7)*7;

    let html='';

    for(let i=0;i<cells;i++){
      const day=i-offset+1;

      if(day<1||day>last){
        html+=
          '<span class="jyyr-calendar-empty"></span>';
      }else{
        const active=
          day===stateValue.day;

        html+=`
          <button
            type="button"
            class="jyyr-calendar-day${active?' active':''}"
            data-jyyr-day="${day}"
            aria-pressed="${active?'true':'false'}"
          >${day}</button>
        `;
      }
    }

    calendar.innerHTML=html;
  }

  function openDatePicker(input){
    if(!window.JYYRModal?.open)return;

    const mode=
      input.dataset.jyyrPickerMode||'date';

    const value=parseDate(input);

    const selected={...value};

    window.JYYRModal.open(`
      <div
        class="jyyr-picker-modal"
        data-jyyr-picker-panel
      >
        <div class="jyyr-picker-head">
          <div class="jyyr-picker-kicker">Jyy'R Picker</div>
          <h2>${
            mode==='datetime'
              ? 'Pilih tanggal & waktu'
              : 'Pilih tanggal'
          }</h2>
        </div>

        <div class="jyyr-calendar-nav">
          <button
            class="icon-button"
            type="button"
            data-jyyr-calendar-prev
            aria-label="Bulan sebelumnya"
          >‹</button>

          <strong data-jyyr-calendar-title></strong>

          <button
            class="icon-button"
            type="button"
            data-jyyr-calendar-next
            aria-label="Bulan berikutnya"
          >›</button>
        </div>

        <div class="jyyr-calendar-weekdays">
          <span>Sen</span>
          <span>Sel</span>
          <span>Rab</span>
          <span>Kam</span>
          <span>Jum</span>
          <span>Sab</span>
          <span>Min</span>
        </div>

        <div
          class="jyyr-calendar"
          data-jyyr-calendar
        ></div>

        ${
          mode==='datetime'
            ? `
              <div class="jyyr-time-picker">
                <div class="jyyr-time-column">
                  <span>Jam</span>
                  <div class="jyyr-stepper">
                    <button type="button" data-jyyr-hour-down>−</button>
                    <strong data-jyyr-hour></strong>
                    <button type="button" data-jyyr-hour-up>+</button>
                  </div>
                </div>

                <div class="jyyr-time-separator">:</div>

                <div class="jyyr-time-column">
                  <span>Menit</span>
                  <div class="jyyr-stepper">
                    <button type="button" data-jyyr-minute-down>−</button>
                    <strong data-jyyr-minute></strong>
                    <button type="button" data-jyyr-minute-up>+</button>
                  </div>
                </div>
              </div>

              <div class="jyyr-time-presets">
                <button type="button" class="jyyr-time-preset" data-jyyr-time-preset="08:00">Pagi<small>08:00</small></button>
                <button type="button" class="jyyr-time-preset" data-jyyr-time-preset="12:00">Siang<small>12:00</small></button>
                <button type="button" class="jyyr-time-preset" data-jyyr-time-preset="18:00">Sore<small>18:00</small></button>
                <button type="button" class="jyyr-time-preset" data-jyyr-time-preset="21:00">Malam<small>21:00</small></button>
              </div>
            `
            : ''
        }

        <div class="jyyr-picker-preview">
          <span>Dipilih</span>
          <strong data-jyyr-picker-preview></strong>
        </div>

        <div class="jyyr-picker-actions">
          <button
            class="button button-secondary"
            type="button"
            data-jyyr-picker-cancel
          >Batal</button>

          <button
            class="button button-primary"
            type="button"
            data-jyyr-picker-apply
          >Terapkan</button>
        </div>
      </div>
    `);

    const root=
      document.querySelector(
        '#modal-root [data-jyyr-picker-panel]'
      );

    if(!root)return;

    const update=()=>{
      renderCalendar(root,selected);

      const iso=
        toISO(selected,mode);

      const preview=
        root.querySelector(
          '[data-jyyr-picker-preview]'
        );

      if(preview){
        preview.textContent=
          mode==='datetime'
            ? formatDateTime(iso)
            : formatDate(iso);
      }

      root.querySelector(
        '[data-jyyr-hour]'
      )?.replaceChildren(
        document.createTextNode(
          pad(selected.hour)
        )
      );

      root.querySelector(
        '[data-jyyr-minute]'
      )?.replaceChildren(
        document.createTextNode(
          pad(selected.minute)
        )
      );
    };

    update();

    root.addEventListener('click',event=>{
      const day=
        event.target.closest('[data-jyyr-day]');

      if(day){
        selected.day=
          Number(day.dataset.jyyrDay);

        update();
        return;
      }

      if(
        event.target.closest(
          '[data-jyyr-calendar-prev]'
        )
      ){
        selected.month--;

        if(selected.month<0){
          selected.month=11;
          selected.year--;
        }

        const max=
          new Date(
            selected.year,
            selected.month+1,
            0
          ).getDate();

        selected.day=
          Math.min(selected.day,max);

        update();
        return;
      }

      if(
        event.target.closest(
          '[data-jyyr-calendar-next]'
        )
      ){
        selected.month++;

        if(selected.month>11){
          selected.month=0;
          selected.year++;
        }

        const max=
          new Date(
            selected.year,
            selected.month+1,
            0
          ).getDate();

        selected.day=
          Math.min(selected.day,max);

        update();
        return;
      }

      const preset=
        event.target.closest(
          '[data-jyyr-time-preset]'
        );

      if(preset){
        const [hour,minute]=
          preset.dataset.jyyrTimePreset
            .split(':')
            .map(Number);

        selected.hour=hour;
        selected.minute=minute;

        update();
        return;
      }

      if(
        event.target.closest('[data-jyyr-hour-up]')
      ){
        selected.hour=(selected.hour+1)%24;
        update();
        return;
      }

      if(
        event.target.closest('[data-jyyr-hour-down]')
      ){
        selected.hour=(selected.hour+23)%24;
        update();
        return;
      }

      if(
        event.target.closest('[data-jyyr-minute-up]')
      ){
        selected.minute=(selected.minute+5)%60;
        update();
        return;
      }

      if(
        event.target.closest('[data-jyyr-minute-down]')
      ){
        selected.minute=(selected.minute+55)%60;
        update();
        return;
      }

      if(
        event.target.closest(
          '[data-jyyr-picker-cancel]'
        )
      ){
        window.JYYRModal.close();
        return;
      }

      if(
        event.target.closest(
          '[data-jyyr-picker-apply]'
        )
      ){
        const iso=
          toISO(selected,mode);

        input.dataset.jyyrValue=iso;

        input.value=
          mode==='datetime'
            ? formatDateTime(iso)
            : formatDate(iso);

        const hidden=
          input.closest(
            '[data-jyyr-date-field]'
          )?.querySelector(
            '[data-jyyr-picker-value]'
          );

        if(hidden){
          hidden.value=iso;
          hidden.dispatchEvent(
            new Event('input',{bubbles:true})
          );
          hidden.dispatchEvent(
            new Event('change',{bubbles:true})
          );
        }else{
          input.dispatchEvent(
            new Event('input',{bubbles:true})
          );
          input.dispatchEvent(
            new Event('change',{bubbles:true})
          );
        }

        window.JYYRModal.close();
      }
    });
  }

  function initDateFields(){
    document
      .querySelectorAll(
        '[data-jyyr-date-field]'
      )
      .forEach(field=>{
        const input=
          field.querySelector(
            '[data-jyyr-picker]'
          );

        const hidden=
          field.querySelector(
            '[data-jyyr-picker-value]'
          );

        if(!input||input.dataset.jyyrReady)return;

        if(
          hidden?.value &&
          !input.dataset.jyyrValue
        ){
          input.dataset.jyyrValue=hidden.value;
        }

        const raw=
          input.dataset.jyyrValue||'';

        input.value=
          input.dataset.jyyrPickerMode==='datetime'
            ? formatDateTime(raw)
            : formatDate(raw);

        input.dataset.jyyrReady='1';

        input.addEventListener(
          'click',
          ()=>openDatePicker(input)
        );

        input.addEventListener(
          'keydown',
          event=>{
            if(
              event.key==='Enter'||
              event.key===' '
            ){
              event.preventDefault();
              openDatePicker(input);
            }
          }
        );
      });
  }

  function syncFile(input){
    const root=
      input?.closest(
        '[data-jyyr-file-picker]'
      );

    if(!root)return;

    const file=input.files?.[0];

    root.querySelector(
      '[data-jyyr-file-name]'
    )?.replaceChildren(
      document.createTextNode(
        file?.name||
        'Belum ada file dipilih.'
      )
    );

    const clear=
      root.querySelector(
        '[data-jyyr-file-clear]'
      );

    if(clear){
      clear.hidden=!file;
    }

    root.classList.toggle(
      'has-file',
      !!file
    );
  }

  function init(){
    document
      .querySelectorAll('[data-jyyr-select]')
      .forEach(syncSelect);

    initDateFields();

    document
      .querySelectorAll('[data-jyyr-file-input]')
      .forEach(syncFile);
  }

  document.addEventListener('click',event=>{
    const trigger=
      event.target.closest(
        '[data-jyyr-select-trigger]'
      );

    if(trigger){
      event.preventDefault();
      openSelect(
        trigger.closest('[data-jyyr-select]')
      );
      return;
    }

    const option=
      event.target.closest(
        '[data-jyyr-select-option]'
      );

    if(option){
      event.preventDefault();
      chooseOption(option);
      return;
    }

    const fileTrigger=
      event.target.closest(
        '[data-jyyr-file-trigger]'
      );

    if(fileTrigger){
      event.preventDefault();

      const root=
        fileTrigger.closest(
          '[data-jyyr-file-picker]'
        );

      const input=
        root?.querySelector(
          '[data-jyyr-file-input]'
        );

      if(input&&!input.disabled){
        input.click();
      }

      return;
    }

    const fileClear=
      event.target.closest(
        '[data-jyyr-file-clear]'
      );

    if(fileClear){
      event.preventDefault();

      const root=
        fileClear.closest(
          '[data-jyyr-file-picker]'
        );

      const input=
        root?.querySelector(
          '[data-jyyr-file-input]'
        );

      if(input){
        input.value='';
        syncFile(input);
        input.dispatchEvent(
          new Event('change',{bubbles:true})
        );
      }

      return;
    }

    if(
      state.activeSelect &&
      !state.activeSelect.contains(
        event.target
      )
    ){
      closeSelect();
    }
  });

  document.addEventListener('change',event=>{
    const input=
      event.target.closest(
        '[data-jyyr-file-input]'
      );

    if(input){
      syncFile(input);
    }
  });

  document.addEventListener('keydown',event=>{
    const trigger=
      event.target.closest?.(
        '[data-jyyr-select-trigger]'
      );

    if(trigger){
      const root=
        trigger.closest('[data-jyyr-select]');

      const options=[
        ...(root?.querySelectorAll(
          '[data-jyyr-select-option]'
        )||[])
      ];

      if(event.key==='ArrowDown'){
        event.preventDefault();
        openSelect(root,0);
        return;
      }

      if(event.key==='ArrowUp'){
        event.preventDefault();
        openSelect(
          root,
          Math.max(0,options.length-1)
        );
        return;
      }

      if(event.key==='Escape'){
        event.preventDefault();
        closeSelect();
        return;
      }
    }

    const root=state.activeSelect;

    if(!root)return;

    const options=[
      ...root.querySelectorAll(
        '[data-jyyr-select-option]'
      )
    ];

    const index=
      options.indexOf(
        document.activeElement
      );

    if(index<0)return;

    if(event.key==='ArrowDown'){
      event.preventDefault();
      options[
        Math.min(index+1,options.length-1)
      ]?.focus();
      return;
    }

    if(event.key==='ArrowUp'){
      event.preventDefault();
      options[
        Math.max(index-1,0)
      ]?.focus();
      return;
    }

    if(event.key==='Home'){
      event.preventDefault();
      options[0]?.focus();
      return;
    }

    if(event.key==='End'){
      event.preventDefault();
      options.at(-1)?.focus();
      return;
    }

    if(
      event.key==='Enter'||
      event.key===' '
    ){
      event.preventDefault();

      if(
        document.activeElement?.matches(
          '[data-jyyr-select-option]'
        )
      ){
        chooseOption(
          document.activeElement
        );
      }

      return;
    }

    if(event.key==='Escape'){
      event.preventDefault();
      closeSelect();
    }
  });

  window.addEventListener(
    'resize',
    ()=>{
      if(state.activeSelect){
        positionSelect(
          state.activeSelect
        );
      }
    }
  );

  window.addEventListener(
    'scroll',
    ()=>{
      if(state.activeSelect){
        positionSelect(
          state.activeSelect
        );
      }
    },
    true
  );

  let initTimer=0;

  const scheduleInit=()=>{
    window.clearTimeout(initTimer);

    initTimer=window.setTimeout(()=>{
      init();
    },120);
  };

  const observer=
    new MutationObserver(mutations=>{
      let hasAddedNodes=false;

      for(const mutation of mutations){
        if(mutation.addedNodes?.length){
          hasAddedNodes=true;
          break;
        }
      }

      if(hasAddedNodes){
        scheduleInit();
      }
    });

  function start(){
    init();

    if(document.body){
      observer.observe(
        document.body,
        {
          childList:true,
          subtree:true
        }
      );
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener(
      'DOMContentLoaded',
      start,
      {once:true}
    );
  }else{
    start();
  }

  window.JYYRPicker={
    init,
    scan:init,
    syncFile
  };
})();
