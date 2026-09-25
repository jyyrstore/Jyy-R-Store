window.JYYRApi=(function(){
  const csrf=()=>document.querySelector('meta[name="csrf-token"]')?.content||window.JYYR?.csrf||'';
  const SAFE_METHODS=['GET','HEAD','OPTIONS'];
  const inFlight=new Map();
  const cooldowns=new Map();

  let activeRequests=0;
  let showTimer=null;

  function ensureProgressBar(){
    if(!document.body)return null;

    let root=document.getElementById('jyyr-request-progress');

    if(!root){
      root=document.createElement('div');
      root.id='jyyr-request-progress';
      root.setAttribute('aria-hidden','true');
      root.innerHTML='<div class="jyyr-request-progress-bar"></div>';
      document.body.appendChild(root);
    }

    return root;
  }

  function beginProgress(){
    activeRequests++;

    if(activeRequests!==1)return;

    clearTimeout(showTimer);

    showTimer=setTimeout(()=>{
      const root=ensureProgressBar();
      if(root)root.classList.add('active');
    },80);
  }

  function endProgress(){
    activeRequests=Math.max(0,activeRequests-1);

    if(activeRequests!==0)return;

    clearTimeout(showTimer);

    const root=ensureProgressBar();
    if(!root)return;

    root.classList.remove('active');
    root.classList.add('done');

    setTimeout(()=>{
      if(activeRequests===0)root.classList.remove('done');
    },260);
  }

  function getCooldownError(key){
    const until=Number(cooldowns.get(key)||0);

    if(until<=Date.now()){
      cooldowns.delete(key);
      return null;
    }

    const seconds=Math.max(1,Math.ceil((until-Date.now())/1000));
    const error=new Error(
      `Terlalu banyak request. Tunggu ${seconds} detik sebelum mencoba lagi.`
    );

    error.code='RATE_LIMITED';
    error.status=429;
    error.retryAfter=seconds;

    return error;
  }

  async function execute(url,options,method,key){
    beginProgress();

    try{
      const headers=new Headers(options.headers||{});

      if(!headers.has('Accept')){
        headers.set('Accept','application/json');
      }

      if(!SAFE_METHODS.includes(method)){
        headers.set('x-csrf-token',csrf());
      }

      let body=options.body;

      if(
        body &&
        !(body instanceof FormData) &&
        typeof body!=='string'
      ){
        headers.set('Content-Type','application/json');
        body=JSON.stringify(body);
      }

      const res=await fetch(url,{
        ...options,
        method,
        headers,
        body,
        credentials:'same-origin'
      });

      let data=null;

      try{
        data=await res.json();
      }catch{
        /* response may not contain JSON */
      }

      if(!res.ok || data?.success===false){
        const retryAfter=Number(data?.error?.retryAfter||0);

        if(res.status===429 && retryAfter>0){
          cooldowns.set(
            key,
            Date.now() + (retryAfter*1000)
          );
        }

        const message=
          res.status===429 && retryAfter>0
            ? `Terlalu banyak request. Tunggu ${retryAfter} detik sebelum mencoba lagi.`
            : (data?.error?.message||`Request failed (${res.status})`);

        const error=new Error(message);
        error.code=data?.error?.code;
        error.status=res.status;
        error.details=data?.error?.details;
        error.retryAfter=retryAfter;
        throw error;
      }

      return data?.data??data;
    }finally{
      endProgress();
    }
  }

  function mutationFingerprint(body){
    if(body instanceof FormData){
      return null;
    }

    if(typeof body==='string'){
      return body;
    }

    if(body===undefined){
      return '';
    }

    try{
      return JSON.stringify(body);
    }catch{
      return String(body);
    }
  }

  function request(url,options={}){
    const method=String(options.method||'GET').toUpperCase();
    const isMutation=!SAFE_METHODS.includes(method);
    const fingerprint=isMutation
      ? mutationFingerprint(options.body)
      : '';

    /*
     * FormData requests are intentionally not deduplicated because two
     * uploads to the same endpoint can legitimately contain different
     * files. JSON/string mutations include their payload in the key.
     */
    const key=fingerprint===null
      ? null
      : `${method}:${url}:${fingerprint}`;

    const cooldownKey=`${method}:${url}`;

    if(isMutation&&key){
      const existing=inFlight.get(key);

      if(existing){
        return existing;
      }
    }

    const cooldownError=
      isMutation
        ? getCooldownError(cooldownKey)
        : null;

    if(cooldownError){
      return Promise.reject(cooldownError);
    }

    const promise=execute(
      url,
      options,
      method,
      cooldownKey
    );

    if(isMutation&&key){
      inFlight.set(key,promise);

      promise
        .finally(()=>{
          if(inFlight.get(key)===promise){
            inFlight.delete(key);
          }
        })
        .catch(()=>{});
    }

    return promise;
  }

  return {request};
})();
