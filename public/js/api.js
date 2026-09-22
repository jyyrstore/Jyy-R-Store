window.JYYRApi=(function(){
  const csrf=()=>document.querySelector('meta[name="csrf-token"]')?.content||window.JYYR?.csrf||'';
  async function request(url,options={}){const method=options.method||'GET'; const headers=new Headers(options.headers||{}); if(!headers.has('Accept'))headers.set('Accept','application/json'); if(!['GET','HEAD','OPTIONS'].includes(method)) headers.set('x-csrf-token',csrf()); let body=options.body; if(body && !(body instanceof FormData) && typeof body!=='string'){headers.set('Content-Type','application/json');body=JSON.stringify(body)} const res=await fetch(url,{...options,method,headers,body,credentials:'same-origin'}); let data=null; try{data=await res.json()}catch{} if(!res.ok || data?.success===false){const e=new Error(data?.error?.message||`Request failed (${res.status})`);e.code=data?.error?.code;e.status=res.status;e.details=data?.error?.details;throw e} return data?.data??data}
  return {request};
})();
