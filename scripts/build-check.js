const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..'); let failed=false;
const fail=(msg)=>{console.error(`BUILD CHECK FAILED: ${msg}`);failed=true};
const exists=(p)=>fs.existsSync(path.join(root,p));
const required=['server.js','package.json','.env.example','.gitignore','.nvmrc','views/app.ejs','src/routes/index.js','src/controllers/api.controller.js','src/controllers/page.controller.js','database/migrations/001_extensions.sql','database/migrations/028_supporting.sql','database/policies/profiles.sql','database/policies/storage.sql','public/css/variables.css','public/js/api.js','README.md','SECURITY.md','tests'];
for(const p of required)if(!exists(p))fail(`missing ${p}`);
const mig=fs.readdirSync(path.join(root,'database/migrations')).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();for(let i=1;i<=28;i++){const n=String(i).padStart(3,'0')+'_';if(!mig.find(x=>x.startsWith(n)))fail(`missing migration ${n}`)}
const banned=/scaffold\s+placeholder|future responsibility|future implementation|future dependency|TODO:\s*implement|test\s+(?:fixture\s+)?placeholder|test skeleton|PLACEHOLDER:/i;
const bad=[];for(const dir of ['src','public/js','public/css','views','database','scripts','.github']){if(!exists(dir))continue;const stack=[path.join(root,dir)];while(stack.length){const d=stack.pop();for(const name of fs.readdirSync(d)){const p=path.join(d,name),st=fs.statSync(p);if(st.isDirectory())stack.push(p);else if(p===path.join(root,'scripts','build-check.js')){} else if(/\.(js|sql|ejs|html|css|md|yml|yaml)$/.test(name)){const t=fs.readFileSync(p,'utf8');if(banned.test(t))bad.push(path.relative(root,p));if(/localStorage\s*\.\s*[a-zA-Z0-9_]*\s*(?:=|\[)/i.test(t)&&/(role|permission|admin)/i.test(t))bad.push(`${path.relative(root,p)}:localStorage-authz`)}}}}
for(const b of bad)fail(`legacy scaffold residue: ${b}`);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));for(const k of ['express','ejs','@supabase/supabase-js'])if(pkg.dependencies?.[k]==='latest')console.warn(`WARN: ${k} is still an unpinned range; npm install in a networked environment should produce package-lock.json before production deployment.`);
if(failed)process.exit(1);console.log('Build structure check passed.');
