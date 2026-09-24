// Small input normalization helper for deterministic formats; not a policy engine.

function parseUserAgent(userAgent){
  const ua=String(userAgent||'').trim();

  if(!ua){
    return {
      device:'Perangkat tidak diketahui',
      browser:'Browser tidak diketahui'
    };
  }

  let device='Perangkat tidak diketahui';
  let browser='Browser tidak diketahui';

  const android=ua.match(/Android\s+([\d.]+)/i);
  const chrome=ua.match(/(?:Chrome|CriOS)\/([\d.]+)/i);
  const firefox=ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/i);
  const edge=ua.match(/(?:Edg|EdgiOS|EdgA)\/([\d.]+)/i);
  const safari=ua.match(/Version\/([\d.]+).*Safari\//i);
  const opera=ua.match(/(?:OPR|Opera)\/([\d.]+)/i);
  const curl=ua.match(/curl\/([\d.]+)/i);

  if(curl){
    device='CLI';
    browser=`curl ${curl[1]}`;
    return {device,browser};
  }

  if(/iPad/i.test(ua)){
    device='iPad';
  }else if(/iPhone/i.test(ua)){
    device='iPhone';
  }else if(/Android/i.test(ua)){
    device=android
      ? `Android ${android[1]}`
      : 'Android';
  }else if(/Windows/i.test(ua)){
    device='Windows';
  }else if(/Macintosh|Mac OS X/i.test(ua)){
    device='macOS';
  }else if(/Linux/i.test(ua)){
    device='Linux';
  }

  if(edge){
    browser=`Edge ${edge[1]}`;
  }else if(opera){
    browser=`Opera ${opera[1]}`;
  }else if(chrome){
    browser=`Chrome ${chrome[1]}`;
  }else if(firefox){
    browser=`Firefox ${firefox[1]}`;
  }else if(safari){
    browser=`Safari ${safari[1]}`;
  }

  return {device,browser};
}

module.exports={
  parseUserAgent
};
