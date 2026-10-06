import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const origin=process.argv[2]??'https://usagi.mikanyan.com';let checks=0;
for(const path of ['/api/account/key','/api/account/key/code']){const r=await fetch(origin+path,{method:path.endsWith('/code')?'POST':'GET',headers:{Origin:origin,'X-Requested-With':'usagi','Content-Type':'application/json'},...(path.endsWith('/code')?{body:'{}'}:{})});assert.equal(r.status,401);checks++;}
const page=await fetch(origin+'/account',{redirect:'manual'});assert.equal(page.status,302);assert.match(page.headers.get('location'),/^\/login\?next=/);checks++;
for(const path of ['/api/auth/key/challenge','/api/auth/key/verify']){const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'X-Requested-With':'usagi','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,422);checks++;}
for(const path of ['/api/auth/key/challenge','/api/auth/key/verify','/api/account/key/code','/api/account/key']){const r=await fetch(origin+path,{method:'POST',headers:{Origin:'https://foreign.example','X-Requested-With':'usagi','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);checks++;}
const html=await fetch(origin+'/login');assert.equal(html.status,200);assert.ok(Buffer.from(await html.arrayBuffer()).equals(await readFile('dist/index.html')));checks++;
const assets=(await readdir('dist/assets')).filter(name=>/^(?:index-|Login-|Account-|private-key-|FileDropzone-)/.test(name));
await Promise.all(assets.map(async name=>{const r=await fetch(origin+'/assets/'+name);assert.equal(r.status,200);assert.ok(Buffer.from(await r.arrayBuffer()).equals(await readFile('dist/assets/'+name)),name+' matches build');checks++;}));
console.log(`PASS: ${checks} production checks; protected account routes, key API validation and CSRF, login HTML and ${assets.length} key-related assets match the verified build. No real email or login credentials used.`);
