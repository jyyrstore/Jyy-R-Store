const fs=require('fs');const path=require('path');const base=path.join(__dirname,'../../templates/email');
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
function render(name,data={}){const file=path.join(base,`${name}.html`);const template=fs.readFileSync(file,'utf8');return template.replace(/\{\{title\}\}/g,esc(data.title||'Jyy\'R Store')).replace(/\{\{body\}\}/g,esc(data.body||''));}
module.exports={render};
