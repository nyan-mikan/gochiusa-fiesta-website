import {accountFeatureChecks} from './account-features-checks.mjs';
import {privateKeyChecks} from './private-key-checks.mjs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {dialogueChecks} from './dialogue-checks.mjs';
import {automaticScriptChecks} from './automatic-script-checks.mjs';
import {unzipSync,strFromU8} from 'fflate';
import {createServer} from 'node:http';import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {once} from 'node:events';import WebSocket from 'ws';
const origin='http://localhost:8787',suffix=randomUUID().slice(0,8),mail=[];let checks=0;
const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;if(req.method==='POST'&&req.url==='/messages'){const value=JSON.parse(body);if(!mail.some(m=>m.key===value.key))mail.push(value);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'local-'+mail.length}));}else{res.writeHead(404);res.end();}});server.listen(8025,'127.0.0.1');await once(server,'listening');
const env={...process.env,XDG_CONFIG_HOME:join(tmpdir(),'gochiusa-wrangler-local'),WRANGLER_LOG_PATH:join(tmpdir(),'gochiusa-wrangler-logs'),WRANGLER_SEND_METRICS:'false'};
const worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--port','8787','--test-scheduled'],{env,stdio:['ignore','pipe','pipe']});let output='';worker.stdout.on('data',x=>output+=x);worker.stderr.on('data',x=>output+=x);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,data,cookie='',method=data===undefined?'GET':'POST',expected=200){const r=await fetch(origin+path,{method,headers:{'CF-Connecting-IP':'203.0.113.'+(parseInt(suffix.slice(0,6),16)%254+1),...(data!==undefined?{'Content-Type':'application/json','Origin':origin,'X-Requested-With':'usagi'}:{}),...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data),redirect:'manual'});const body=await r.text();assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${method} ${path}: ${r.status} ${body}`);checks++;return {r,v:r.headers.get('content-type')?.includes('application/json')?JSON.parse(body):body};}
async function login(email){const {v}=await request('/api/auth/code',{email});const message=mail.find(m=>m.to===email&&m.key==='auth:'+v.challenge_id);assert.ok(message,'OTP arrives through mail adapter');const code=message.text.match(/[0-9]{6}/)[0];assert.ok(message.html?.includes('>'+code+'</p>'),'HTML and text carry the same OTP');assert.ok(message.html.includes('Gochiusa New Year Fiesta'));assert.ok(message.html.includes('10 分钟内有效'));const {r,v:user}=await request('/api/auth/verify',{challenge_id:v.challenge_id,code});assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);assert.match(r.headers.get('set-cookie'),/Max-Age=604800(?:;|$)/);return {cookie:r.headers.get('set-cookie').split(';')[0],user:user.user,challenge:v.challenge_id,code};}
try{
 for(let i=0;i<80;i++){try{const r=await fetch(origin+'/api/health');if(r.ok)break;}catch{}if(i===79)throw new Error('Worker did not start: '+output);await pause(250);}
 const adminEmail='admin-'+suffix+'@example.test';execFileSync(process.execPath,['scripts/bootstrap-admin.mjs',adminEmail,'local'],{env,stdio:'pipe'});
 const rootEmail='super-'+suffix+'@example.test';execFileSync(process.execPath,['scripts/bootstrap-admin.mjs',rootEmail,'local','super_admin'],{env,stdio:'pipe'});const root=await login(rootEmail);assert.equal(root.user.is_super_admin,true);
 const admin=await login(adminEmail),owner=await login('owner-'+suffix+'@example.test'),other=await login('other-'+suffix+'@example.test');assert.equal(admin.user.role,'admin');assert.equal(owner.user.role,'submitter');
 const localSql=query=>{const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--command',query,'--json'],{env,encoding:'utf8',stdio:'pipe'});return JSON.parse(raw.slice(raw.search(/^\s*\[\s*\{/m)));};
 { // Verify the server lifetime, not just the browser cookie.
 const ownerHash=createHash('sha256').update(owner.cookie.split('=')[1]).digest('hex');
 const row=localSql(`SELECT created_at,expires_at FROM sessions WHERE token_hash='${ownerHash}'`)[0].results[0];assert.equal(Date.parse(row.expires_at)-Date.parse(row.created_at),604800000,'D1 session expires exactly seven days after login');
 const expiredToken=randomUUID(),expiredHash=createHash('sha256').update(expiredToken).digest('hex'),expiredAt=new Date(Date.now()-1000).toISOString(),createdAt=new Date(Date.parse(expiredAt)-604800000).toISOString();
 localSql(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES('${expiredHash}','${owner.user.id}','${expiredAt}','${createdAt}')`);
 await request('/api/me',undefined,'usagi_session='+expiredToken,'GET',401);
 localSql(`DELETE FROM sessions WHERE token_hash='${expiredHash}'`);
 }
 await request('/api/auth/verify',{challenge_id:owner.challenge,code:owner.code},'', 'POST',422);
 await request('/api/admin/settings',undefined,owner.cookie,'GET',403);await request('/api/no-such-route',undefined,'','GET',404);await request('/admin/program',undefined,'','GET',302);await request('/admin/program',undefined,owner.cookie,'GET',403);
 const forged=await fetch(origin+'/api/submissions',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json',Origin:'https://evil.test','X-Requested-With':'usagi'},body:'{}'});assert.equal(forged.status,403);checks++;
 const {v:event}=await request('/api/admin/events',{name:'集成测试 '+suffix,year:2026,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,active:true},admin.cookie);
 await request('/api/admin/bili-role-config',{category_id:null,name:'测试分区 '+suffix,platform_id:null,staff_limit:10,verified:true,evidence_url:'https://www.bilibili.com/blackboard/activity-hezuogongyue.html',labels:['演唱','后期']},admin.cookie,'PUT');
 const {v:config}=await request('/api/form-config',undefined,owner.cookie);const category=config.categories.find(x=>x.name==='测试分区 '+suffix),role=config.roles.find(x=>x.category_id===category.id);

 { // Blessing submissions use real D1, authenticated roles and private local R2.
 await request('/api/wishes?event_id='+event.id,undefined,'','GET',401);
 await request('/api/admin/wishes?event_id='+event.id,undefined,owner.cookie,'GET',403);
 const wishOp={event_id:event.id,operation_id:randomUUID()};const wish=(await request('/api/wishes',wishOp,owner.cookie,'POST',201)).v;
 assert.equal((await request('/api/wishes',wishOp,owner.cookie,'POST',201)).v.id,wish.id);
 assert.equal((await request('/api/admin/wishes?event_id='+event.id,undefined,admin.cookie)).v.total,0);
 await request('/api/wishes/'+wish.id+'/submit',{display_name:'兔兔',text:'',expectedVersion:1,operation_id:randomUUID()},owner.cookie,'POST',422);
 await request('/api/wishes/'+wish.id+'/submit',{display_name:'越权',text:'其他人的稿',expectedVersion:1,operation_id:randomUUID()},other.cookie,'POST',404);
 const wishPublish={display_name:'兔兔/心意',text:'新年快乐！\n愿大家心想事成。',expectedVersion:1,operation_id:randomUUID()};
 await request('/api/wishes/'+wish.id+'/submit',wishPublish,owner.cookie);await request('/api/wishes/'+wish.id+'/submit',wishPublish,owner.cookie);
 await request('/api/wishes/'+wish.id+'/submit',{...wishPublish,operation_id:randomUUID(),text:'覆盖'},owner.cookie,'POST',409);
 let ownWishes=(await request('/api/wishes?event_id='+event.id,undefined,owner.cookie)).v;assert.equal(ownWishes.total,1);assert.equal(ownWishes.items[0].text,wishPublish.text);assert.ok(!JSON.stringify(ownWishes).includes(owner.user.email));
 assert.equal((await request('/api/wishes?event_id='+event.id,undefined,other.cookie)).v.total,0);
 assert.equal((await request('/api/admin/wishes?event_id='+event.id+'&search='+encodeURIComponent('心想'),undefined,admin.cookie)).v.total,1);
 await request('/api/admin/wishes/export?event_id='+event.id+'&kind=text',undefined,owner.cookie,'GET',403);
 const audioWish=(await request('/api/wishes',{event_id:event.id,operation_id:randomUUID()},admin.cookie,'POST',201)).v;
 const wave=Buffer.alloc(44+16000);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(16000,40);
 async function wishAudioRequest(wid,bytes,cookie,status=200){const r=await fetch(origin+'/api/wishes/'+wid+'/audio',{method:'PUT',headers:{Cookie:cookie,Origin:origin,'X-Requested-With':'usagi','X-Filename':encodeURIComponent('新年/祝福.wav')},body:bytes});assert.equal(r.status,status,await r.text());checks++;}
 await wishAudioRequest(audioWish.id,wave,owner.cookie,403);await wishAudioRequest(wish.id,wave,owner.cookie,403);
 await wishAudioRequest(audioWish.id,Buffer.from('<html>fake audio</html>'),admin.cookie,422);
 await wishAudioRequest(audioWish.id,Buffer.alloc(20971521),admin.cookie,413);
 await wishAudioRequest(audioWish.id,wave,admin.cookie);await wishAudioRequest(audioWish.id,wave,admin.cookie);
 const changedWave=Buffer.from(wave);changedWave[50]=1;await wishAudioRequest(audioWish.id,changedWave,admin.cookie,409);
 await request('/api/wishes/'+audioWish.id+'/audio',undefined,owner.cookie,'GET',404);
 const range=await fetch(origin+'/api/wishes/'+audioWish.id+'/audio',{headers:{Cookie:admin.cookie,Range:'bytes=0-43'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'audio/wav');assert.deepEqual(Buffer.from(await range.arrayBuffer()),wave.subarray(0,44));checks++;
 const invalidRange=await fetch(origin+'/api/wishes/'+audioWish.id+'/audio',{headers:{Cookie:admin.cookie,Range:'bytes=999999-'}});assert.equal(invalidRange.status,416);checks++;
 for(const text of ['', ' \n\t　'])await request('/api/wishes/'+audioWish.id+'/submit',{display_name:'语音管理员',text,expectedVersion:1,operation_id:randomUUID()},admin.cookie,'POST',422);
 const retained=(await request('/api/wishes?event_id='+event.id,undefined,admin.cookie)).v.items.find(w=>w.id===audioWish.id);assert.equal(retained.status,'draft');assert.equal(retained.version,1);assert.ok(retained.filename);
 await request('/api/wishes/'+audioWish.id+'/submit',{display_name:'语音管理员',text:'新年快乐！',expectedVersion:1,operation_id:randomUUID()},admin.cookie);
 await wishAudioRequest(audioWish.id,wave,admin.cookie,409);
 const voices=(await request('/api/admin/wishes?event_id='+event.id,undefined,admin.cookie)).v;assert.equal(voices.total,2);assert.equal(voices.items.find(w=>w.id===audioWish.id).filename,'新年_祝福.wav');assert.equal(voices.audio_ready,true);
 async function zip(kind,ids){const r=await fetch(origin+'/api/admin/wishes/export?'+new URLSearchParams({event_id:event.id,kind,...(ids?{ids:ids.join(',')}:{})}),{headers:{Cookie:admin.cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');checks++;return unzipSync(new Uint8Array(await r.arrayBuffer()));}
 const texts=await zip('text');assert.equal(Object.keys(texts).length,2);assert.ok(Object.values(texts).some(b=>strFromU8(b).includes(wishPublish.text)));assert.ok(!Object.keys(texts).some(k=>k.includes('/')));
 const audioFiles=await zip('audio');assert.equal(Object.keys(audioFiles).length,1);assert.deepEqual(Buffer.from(Object.values(audioFiles)[0]),wave);
 assert.equal(Object.keys(await zip('text',[wish.id])).length,1);
 await request('/api/admin/wishes/export-check?event_id='+event.id+'&kind=text&ids='+randomUUID(),undefined,admin.cookie,'GET',422);
 // Audio replacement must be owner-only, draft-only and safe when an old retry arrives.
 const replacementEvent=(await request('/api/admin/events',{name:'音频替换 '+suffix,year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,active:true},admin.cookie)).v;
 const replacement=(await request('/api/wishes',{event_id:replacementEvent.id,operation_id:randomUUID()},admin.cookie,'POST',201)).v;
 const replacementPath='/api/wishes/'+replacement.id+'/audio';await wishAudioRequest(replacement.id,wave,admin.cookie);
 const remove={expectedVersion:1,expectedAudio:createHash('sha256').update(wave).digest('hex'),operation_id:randomUUID()};
 await request(replacementPath,remove,owner.cookie,'DELETE',403);await request(replacementPath,remove,root.cookie,'DELETE',404);
 await request(replacementPath,{...remove,expectedAudio:'0'.repeat(64)},admin.cookie,'DELETE',409);
 await request(replacementPath,{...remove,expectedVersion:2},admin.cookie,'DELETE',409);
 await request(replacementPath,remove,admin.cookie,'DELETE');await request(replacementPath,remove,admin.cookie,'DELETE');
 await request(replacementPath,undefined,admin.cookie,'GET',404);await wishAudioRequest(replacement.id,changedWave,admin.cookie);
 await request(replacementPath,remove,admin.cookie,'DELETE');
 const replaced=await fetch(origin+replacementPath,{headers:{Cookie:admin.cookie}});assert.deepEqual(Buffer.from(await replaced.arrayBuffer()),changedWave);checks++;
 await request('/api/wishes/'+replacement.id+'/submit',{display_name:'替换音频',text:'新年快乐！',expectedVersion:1,operation_id:randomUUID()},admin.cookie);
 await request(replacementPath,{...remove,operation_id:randomUUID(),expectedAudio:createHash('sha256').update(changedWave).digest('hex')},admin.cookie,'DELETE',409);
 assert.equal((await request('/api/admin/wishes/export-check?'+new URLSearchParams({event_id:event.id,kind:'text',search:'心想'}),undefined,admin.cookie)).v.count,1);
 await request('/api/admin/wishes/export-check?'+new URLSearchParams({event_id:event.id,kind:'text',search:'绝对没有的文本'}),undefined,admin.cookie,'GET',422);
 const filteredZip=await fetch(origin+'/api/admin/wishes/export?'+new URLSearchParams({event_id:event.id,kind:'text',search:'心想'}),{headers:{Cookie:admin.cookie}});assert.equal(filteredZip.status,200);assert.equal(Object.keys(unzipSync(new Uint8Array(await filteredZip.arrayBuffer()))).length,1);checks++;
 const closed=(await request('/api/admin/events',{name:'祝福关闭测试 '+suffix,year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:false,active:true,wishes_open:false},admin.cookie)).v;
 await request('/api/wishes',{event_id:closed.id,operation_id:randomUUID()},owner.cookie,'POST',409);
 const override=(await request('/api/wishes',{event_id:closed.id,operation_id:randomUUID()},admin.cookie,'POST',201)).v;await request('/api/wishes/'+override.id+'/submit',{display_name:'管理员收集',text:'开关关闭时管理员仍可录入',expectedVersion:1,operation_id:randomUUID()},admin.cookie);
 }
 const createOp={event_id:event.id,operation_id:randomUUID()};const {v:created}=await request('/api/submissions',createOp,owner.cookie,'POST',201);const again=await request('/api/submissions',createOp,owner.cookie,'POST',201);assert.equal(created.id,again.v.id);
 let d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;await request('/api/submissions/'+created.id,undefined,other.cookie,'GET',404);
 const form={title:'=测试曲 '+suffix,type:'翻唱',description:'集成测试作品简介',duration_seconds:125,category_id:category.id,delivery_url:'https://example.test/movie',access_notes:'仅管理员可见提取码',notes:'备注',contact:{name:'负责人',uid:'123456789012345678901234567890'},uploader:{name:'主投稿',uid:'987654321'},contributors:[{name:'负责人',uid:'123456789012345678901234567890',role_option_id:role.id,work_detail:'演唱与混音'}]};
 await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form},owner.cookie,'PATCH');d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;assert.equal(d.form.contact.uid,form.contact.uid);
 // Clearing identity flags is a valid draft state and must survive a D1 round trip without assigning a member.
 const unassigned={...form,contact:{name:'',uid:''},uploader:{name:'',uid:''}};
 await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form:unassigned},owner.cookie,'PATCH');d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;
 assert.deepEqual(d.form.contact,unassigned.contact);assert.deepEqual(d.form.uploader,unassigned.uploader);assert.equal(d.form.contributors[0].uid,form.contributors[0].uid);
 await request('/api/submissions/'+created.id+'/submit',{expectedVersion:d.submission.version,operation_id:randomUUID(),confirmed:true},owner.cookie,'POST',422);
 await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form},owner.cookie,'PATCH');d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;assert.equal(d.form.contact.uid,form.contact.uid);assert.equal(d.form.uploader.uid,form.uploader.uid);
 await request('/api/submissions/'+created.id,{expectedVersion:1,form},owner.cookie,'PATCH',409);
 const submitOp={expectedVersion:d.submission.version,operation_id:randomUUID(),confirmed:true};await request('/api/submissions/'+created.id+'/submit',submitOp,owner.cookie);await request('/api/submissions/'+created.id+'/submit',submitOp,owner.cookie);d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;
 assert.ok((await request('/api/submissions?status=pending',undefined,owner.cookie)).v.items.some(x=>x.id===created.id));
 assert.ok(!(await request('/api/submissions',undefined,other.cookie)).v.items.some(x=>x.id===created.id));
 await request('/api/submissions?page=1.5',undefined,owner.cookie,'GET',422);
 await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form},owner.cookie,'PATCH',409);
 await request('/api/admin/submissions/'+created.id+'/reviews',{expectedVersion:d.submission.version,expectedRevision:d.revision.id,operation_id:randomUUID(),decision:'rejected',reason:'请调整音量',internal_note:'内部信息'},admin.cookie);
 d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;assert.ok(!('internal_note'in d.reviews[0]));const frozenId=d.revision.id;
 form.title='测试曲修订 '+suffix;await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form},owner.cookie,'PATCH');d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;assert.equal(d.revision.revision_no,2);assert.notEqual(d.revision.id,frozenId);assert.equal(d.revisions[1].title,'=测试曲 '+suffix);
 await request('/api/submissions/'+created.id+'/submit',{expectedVersion:d.submission.version,operation_id:randomUUID(),confirmed:true},owner.cookie);d=(await request('/api/submissions/'+created.id,undefined,owner.cookie)).v;
 const approve={expectedVersion:d.submission.version,expectedRevision:d.revision.id,operation_id:randomUUID(),decision:'approved',reason:'',internal_note:''};await request('/api/admin/submissions/'+created.id+'/reviews',approve,admin.cookie);await request('/api/admin/submissions/'+created.id+'/reviews',approve,admin.cookie);d=(await request('/api/submissions/'+created.id,undefined,admin.cookie)).v;
 assert.ok((await request('/api/submissions?status=approved',undefined,owner.cookie)).v.items.some(x=>x.id===created.id));
 const base='/api/admin/events/'+event.id;let s=(await request(base+'/script',undefined,admin.cookie)).v;const item={id:randomUUID(),revision_id:d.revision.id,custom_name:null,custom_type:null,custom_duration:null,notes:'舞台备注'},custom={id:randomUUID(),revision_id:null,custom_name:'=危险公式',custom_type:'其他：互动环节',custom_duration:60,notes:''};
 await request(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[{id:randomUUID(),revision_id:null,custom_name:null,custom_type:null,custom_duration:null,notes:''}]},admin.cookie,'PUT',409);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.items.length,0);assert.equal(s.seq,0);
 const program={operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[item,custom]};await request(base+'/program',program,admin.cookie,'PUT');await request(base+'/program',program,admin.cookie,'PUT');s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.items.length,2);await automaticScriptChecks(async(path,data,method=data===undefined?'GET':'POST',status=200)=>(await request(path,data,admin.cookie,method,status)).v,base);await dialogueChecks(async(path,data,method=data===undefined?'GET':'POST',status=200)=>(await request(path,data,admin.cookie,method,status)).v,base);s=(await request(base+'/script',undefined,admin.cookie)).v;
 await request('/api/admin/submissions/'+created.id+'/reopen',{expectedVersion:d.submission.version,expectedRevision:d.revision.id,operation_id:randomUUID(),reason:'退回'},admin.cookie,'POST',409);
 const csv=(await request(base+'/program/export',undefined,admin.cookie)).v;assert.ok(csv.includes("'=危险公式"));assert.ok(!csv.includes(form.contact.uid));assert.ok(!csv.includes('提取码'));
 const socket=new WebSocket('ws://localhost:8787'+base+'/realtime',{headers:{Cookie:admin.cookie,Origin:origin}});await once(socket,'open');const messages=[];socket.on('message',x=>messages.push(JSON.parse(x.toString())));
 const bid=randomUUID();await request(base+'/script/operations',{type:'block.add',operation_id:randomUUID(),id:bid,expectedVersion:s.document.structure_version,title:'开场',before_program_item_id:item.id,at_end:false,opening:true},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;let b=s.blocks.find(x=>x.id===bid);const speaker='builtin-cocoa',lid=randomUUID(),lid2=randomUUID();
 await request(base+'/script/operations',{type:'line.add',operation_id:randomUUID(),block_id:bid,id:lid,expectedVersion:b.version,speaker_id:speaker,text:'你好，晚会！',direction:''},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;b=s.blocks.find(x=>x.id===bid);
 await request(base+'/script/operations',{type:'line.add',operation_id:randomUUID(),block_id:bid,id:lid2,expectedVersion:b.version,speaker_id:speaker,text:'欢迎大家',direction:''},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;
 // Keyboard insertion is scoped to the same block, keeps ordering, and remains idempotent.
 b=s.blocks.find(x=>x.id===bid);const insertedId=randomUUID(),insert={type:'line.add',operation_id:randomUUID(),block_id:bid,id:insertedId,after_id:lid,expectedVersion:b.version,speaker_id:speaker,text:'中间新台词',direction:''};
 await request(base+'/script/operations',insert,admin.cookie);const insertedSnapshot=(await request(base+'/script',undefined,admin.cookie)).v;
 assert.deepEqual(insertedSnapshot.lines.filter(l=>l.block_id===bid).sort((a,b)=>a.position-b.position).map(l=>l.id),[lid,insertedId,lid2]);
 await request(base+'/script/operations',insert,admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.seq,insertedSnapshot.seq);assert.equal(s.lines.filter(l=>l.id===insertedId).length,1);
 await request(base+'/script/operations',{...insert,operation_id:randomUUID(),id:randomUUID()},admin.cookie,'POST',409);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.seq,insertedSnapshot.seq);assert.equal(s.lines.length,3);
 b=s.blocks.find(x=>x.id===bid);await request(base+'/script/operations',{...insert,operation_id:randomUUID(),id:randomUUID(),expectedVersion:b.version,after_id:randomUUID()},admin.cookie,'POST',409);
 await request(base+'/script/operations',{type:'line.delete',operation_id:randomUUID(),id:insertedId,expectedVersion:1,blockVersion:b.version},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.length,2);
 await request(base+'/script/operations',{...insert,operation_id:randomUUID(),id:randomUUID(),expectedVersion:s.blocks.find(x=>x.id===bid).version,after_id:insertedId},admin.cookie,'POST',409);
 const update={type:'line.update',operation_id:randomUUID(),id:lid,expectedVersion:1,speaker_id:speaker,text:'修改后的台词',direction:'笑'};await request(base+'/script/operations',update,admin.cookie);await request(base+'/script/operations',update,admin.cookie);await request(base+'/script/operations',{...update,operation_id:randomUUID(),text:'过期修改'},admin.cookie,'POST',409);
 await Promise.all([request(base+'/script/operations',{...update,operation_id:randomUUID(),expectedVersion:2,text:'并发 A'},admin.cookie),request(base+'/script/operations',{...update,operation_id:randomUUID(),id:lid2,expectedVersion:1,text:'并发 B'},admin.cookie)]);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.find(l=>l.id===lid).text,'并发 A');assert.equal(s.lines.find(l=>l.id===lid2).text,'并发 B');
 b=s.blocks.find(x=>x.id===bid);const splitId=randomUUID();const line=s.lines.find(x=>x.id===lid);await request(base+'/script/operations',{type:'line.split',operation_id:randomUUID(),id:lid,expectedVersion:line.version,blockVersion:b.version,new_id:splitId,offset:2},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;b=s.blocks.find(x=>x.id===bid);await request(base+'/script/operations',{type:'line.merge',operation_id:randomUUID(),id:lid,expectedVersion:s.lines.find(x=>x.id===lid).version,blockVersion:b.version,next_id:splitId,nextVersion:1},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;
 await pause(100);assert.ok(messages.some(m=>m.type==='change'),'Durable Object broadcasts committed changes');socket.close();
 await request(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[custom]},admin.cookie,'PUT');s=(await request(base+'/script',undefined,admin.cookie)).v;b=s.blocks.find(x=>x.id===bid);assert.equal(b.before_program_item_id,null);assert.equal(s.lines.length,2);
 await request(base+'/script/operations',{type:'block.update',operation_id:randomUUID(),id:bid,expectedVersion:b.version,title:b.title,before_program_item_id:custom.id,at_end:false,opening:true,position:b.position,estimated_seconds:20},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;
 // Typed script entries: annotations/headings do not require a speaker; type survives edits and split/merge.
 assert.equal(s.characters.find(c=>c.id==='aux-narrator').archived,1);
 const noteId=randomUUID(),headingId=randomUUID();
 for(const [id,kind,text] of [[noteId,'comment','仅供后台看的舞台注释'],[headingId,'heading','第二幕 · 欢迎']]){b=s.blocks.find(x=>x.id===bid);await request(base+'/script/operations',{type:'line.add',operation_id:randomUUID(),block_id:bid,id,expectedVersion:b.version,kind,speaker_id:null,text,direction:''},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.find(l=>l.id===id).kind,kind);}
 const invalidEntry={type:'line.add',operation_id:randomUUID(),block_id:bid,id:randomUUID(),expectedVersion:s.blocks.find(x=>x.id===bid).version,kind:'comment',speaker_id:speaker,text:'不合法类型角色组合',direction:''};
 await request(base+'/script/operations',invalidEntry,admin.cookie,'POST',422);await request(base+'/script/operations',{...invalidEntry,kind:'unknown',speaker_id:null},admin.cookie,'POST',422);await request(base+'/script/operations',{...invalidEntry,kind:'dialogue',speaker_id:'aux-narrator'},admin.cookie,'POST',422);
 await request(base+'/script/operations',{type:'line.update',operation_id:randomUUID(),id:noteId,expectedVersion:1,speaker_id:null,text:'更新后的舞台注释',direction:''},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.find(l=>l.id===noteId).kind,'comment');
 const hSplit=randomUUID();await request(base+'/script/operations',{type:'line.split',operation_id:randomUUID(),id:headingId,expectedVersion:1,blockVersion:s.blocks.find(x=>x.id===bid).version,new_id:hSplit,offset:3},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.find(l=>l.id===hSplit).kind,'heading');
 await request(base+'/script/operations',{type:'line.merge',operation_id:randomUUID(),id:headingId,expectedVersion:s.lines.find(l=>l.id===headingId).version,blockVersion:s.blocks.find(x=>x.id===bid).version,next_id:hSplit,nextVersion:1},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;assert.equal(s.lines.find(l=>l.id===headingId).kind,'heading');
 const onlySpeaker=(await request(base+'/script/export?speaker='+speaker,undefined,admin.cookie)).v;assert.ok(onlySpeaker.includes('〔注释〕更新后的舞台注释'));assert.ok(onlySpeaker.includes('【小标题】'));assert.ok(!onlySpeaker.includes('未指定角色：更新后的舞台注释'));
 await request(base+'/script/export?formal=1',undefined,admin.cookie,'GET',409);await request(base+'/program/lock',{operation_id:randomUUID(),expectedVersion:s.program.version,locked:true,reason:''},admin.cookie);s=(await request(base+'/script',undefined,admin.cookie)).v;
 await request(base+'/script/lock',{operation_id:randomUUID(),expectedVersion:s.document.structure_version,expectedSeq:s.seq,programVersion:s.program.version,locked:true,reason:''},admin.cookie);const txt=(await request(base+'/script/export?formal=1',undefined,admin.cookie)).v;assert.ok(txt.includes('并发\n A'));assert.ok(txt.includes('〔注释〕更新后的舞台注释'));assert.ok(txt.includes('【小标题】'));s=(await request(base+'/script',undefined,admin.cookie)).v;
 await request(base+'/script/operations',{...update,operation_id:randomUUID(),expectedVersion:3},admin.cookie,'POST',409);
 await request(base+'/program/lock',{operation_id:randomUUID(),expectedVersion:s.program.version,locked:false,reason:'调整编排'},admin.cookie);await request(base+'/script/export?formal=1',undefined,admin.cookie,'GET',409);
 await request('/api/admin/notifications/process',{},admin.cookie);const notices=(await request('/api/submissions/'+created.id,undefined,admin.cookie)).v.notifications;assert.equal(notices.length,4);assert.ok(notices.every(n=>n.status==='sent'));

 // Real R2 multipart path: uploads, ownership, range downloads, frozen revisions and Other fields.
 const fileOther=other;
 const preset=config.categories.find(c=>c.id==='preset-other');assert.ok(preset);assert.ok(config.roles.some(r=>r.category_id===preset.id));checks++;
 const upDraft=(await request('/api/submissions',{event_id:event.id,operation_id:randomUUID()},owner.cookie,'POST',201)).v;
 const upBase='/api/submissions/'+upDraft.id;const createFile=(size=10*1024*1024+27)=>request(upBase+'/uploads',{filename:'作品测试.mp4',size,content_type:'video/mp4'},owner.cookie,'POST',201);
 await request(upBase+'/uploads',{filename:'过大.mp4',size:1000000001,content_type:'video/mp4'},owner.cookie,'POST',422);
 await request(upBase+'/uploads',{filename:'空.mp4',size:0,content_type:'video/mp4'},owner.cookie,'POST',422);
 await request(upBase+'/uploads',{filename:'越权.mp4',size:12,content_type:'video/mp4'},admin.cookie,'POST',404);
 const maxFile=(await createFile(1000000000)).v;await request('/api/uploads/'+maxFile.id,{},owner.cookie,'DELETE');
 const file=(await createFile()).v;const data=Buffer.alloc(file.part_size+27,65);data.fill(66,file.part_size);
 async function part(number,body,cookie=owner.cookie,status=200){const res=await fetch(origin+'/api/uploads/'+file.id+'/parts/'+number,{method:'PUT',headers:{Cookie:cookie,Origin:origin,'X-Requested-With':'usagi','Content-Type':'application/octet-stream'},body});assert.equal(res.status,status,await res.text());checks++;}
 await part(1,Buffer.alloc(file.part_size+1),owner.cookie,413);await part(1,Buffer.alloc(5),owner.cookie,422);await part(1,data.subarray(0,file.part_size),fileOther.cookie,404);
 await part(3,Buffer.alloc(27),owner.cookie,422);await request('/api/uploads/'+file.id+'/complete',{},owner.cookie,'POST',422);
 await part(1,data.subarray(0,file.part_size));await part(1,data.subarray(0,file.part_size));
 await part(1,Buffer.alloc(file.part_size,67),owner.cookie,409);await part(2,data.subarray(file.part_size));
 await request('/api/uploads/'+file.id+'/complete',{},fileOther.cookie,'POST',404);await request('/api/uploads/'+file.id+'/complete',{},owner.cookie);await request('/api/uploads/'+file.id+'/complete',{},owner.cookie);
 await request('/api/uploads/'+file.id+'/download',undefined,fileOther.cookie,'GET',404);await request('/api/uploads/'+file.id+'/download',undefined,'','GET',401);
 const downloaded=await fetch(origin+'/api/uploads/'+file.id+'/download',{headers:{Cookie:admin.cookie}});assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),data);checks++;
 const range=await fetch(origin+'/api/uploads/'+file.id+'/download',{headers:{Cookie:owner.cookie,Range:'bytes=-27'}});assert.equal(range.status,206);assert.match(range.headers.get('content-range'),/10485760-10485786/);assert.deepEqual(Buffer.from(await range.arrayBuffer()),Buffer.alloc(27,66));checks++;
 const invalidRange=await fetch(origin+'/api/uploads/'+file.id+'/download',{headers:{Cookie:owner.cookie,Range:'bytes=999999999-'}});assert.equal(invalidRange.status,416);checks++;
 let upDetail=(await request(upBase,undefined,owner.cookie)).v;
 const upForm={...form,type:'其他',type_other:'舞台互动',category_id:preset.id,category_other:'企划综合',delivery_url:'',upload_id:file.id,contributors:[{...form.contributors[0],role_option_id:config.roles.find(r=>r.category_id===preset.id&&r.label==='其他').id,role_other:'道具设计'}]};
 const foreignDraft=(await request('/api/submissions',{event_id:event.id,operation_id:randomUUID()},owner.cookie,'POST',201)).v;
 await request('/api/submissions/'+foreignDraft.id,{expectedVersion:1,form:upForm},owner.cookie,'PATCH',422);
 await request(upBase,{expectedVersion:upDetail.submission.version,form:{...upForm,upload_id:maxFile.id}},owner.cookie,'PATCH',422);
 await request('/api/submissions/'+created.id,{expectedVersion:d.submission.version,form:upForm},owner.cookie,'PATCH',409);
 await request(upBase,{expectedVersion:upDetail.submission.version,form:{...upForm,type_other:''}},owner.cookie,'PATCH');upDetail=(await request(upBase,undefined,owner.cookie)).v;
 const submitFile=()=>request(upBase+'/submit',{expectedVersion:upDetail.submission.version,operation_id:randomUUID(),confirmed:true},owner.cookie);
 await request(upBase+'/submit',{expectedVersion:upDetail.submission.version,operation_id:randomUUID(),confirmed:true},owner.cookie,'POST',422);
 for(const missing of ['category_other','role_other']){const partial=structuredClone(upForm);if(missing==='role_other')partial.contributors[0].role_other='';else partial.category_other='';await request(upBase,{expectedVersion:upDetail.submission.version,form:partial},owner.cookie,'PATCH');upDetail=(await request(upBase,undefined,owner.cookie)).v;await request(upBase+'/submit',{expectedVersion:upDetail.submission.version,operation_id:randomUUID(),confirmed:true},owner.cookie,'POST',422);}
 await request(upBase,{expectedVersion:upDetail.submission.version,form:upForm},owner.cookie,'PATCH');upDetail=(await request(upBase,undefined,owner.cookie)).v;assert.equal(upDetail.uploaded_file.id,file.id);assert.equal(upDetail.form.contributors[0].role_other,'道具设计');await submitFile();upDetail=(await request(upBase,undefined,owner.cookie)).v;
 await request(upBase,{expectedVersion:upDetail.submission.version,form:{...upForm,upload_id:null}},owner.cookie,'PATCH',409);
 await request('/api/uploads/'+file.id,{},owner.cookie,'DELETE',409);
 const characterSnapshot=(await request(base+'/characters',undefined,admin.cookie)).v;assert.equal(characterSnapshot.characters.filter(c=>c.kind==='builtin'&&!c.archived).length,11);assert.ok(characterSnapshot.characters.some(c=>c.id==='builtin-tippy'&&!c.archived));checks++;
 const cocoa=characterSnapshot.characters.find(c=>c.id==='builtin-cocoa');assert.equal(cocoa.color,'#FDD5D5');
 await request(base+'/characters/operations',{operation_id:randomUUID(),type:'character.override',id:cocoa.id,expectedVersion:cocoa.override_version,display_name:null,color:'#FF1122',hidden:false,favorite:true},admin.cookie);
 assert.equal((await request(base+'/characters',undefined,admin.cookie)).v.characters.find(c=>c.id===cocoa.id).color,'#FF1122');
 await request(base+'/characters/operations',{operation_id:randomUUID(),type:'character.override',id:cocoa.id,expectedVersion:cocoa.override_version,display_name:null,color:'#FF1122',hidden:false,favorite:true},admin.cookie,'POST',409);

 // Super administrator management: actual OTP accounts, authority, session
 // revocation, immutable owner capability, atomic concurrency and idempotency.
 await request('/api/admin/users',undefined,admin.cookie,'GET',403);
 await request('/admin/users',undefined,admin.cookie,'GET',403);
 await request('/%61dmin/users',undefined,admin.cookie,'GET',403);
 await request('/api/admin/users/role',{email:owner.user.email,role:'admin',expected_version:1,operation_id:randomUUID()},owner.cookie,'PUT',403);
 await request('/api/admin/users/role',{email:owner.user.email,role:'admin',expected_version:1,operation_id:randomUUID()},admin.cookie,'PUT',403);
 await request('/api/admin/users/role',{email:owner.user.email,role:'admin',expected_version:1,operation_id:randomUUID(),is_super_admin:true},root.cookie,'PUT',422);
 await request('/api/admin/users?page=0',undefined,root.cookie,'GET',422);
 let accounts=(await request('/api/admin/users?search='+encodeURIComponent(rootEmail),undefined,root.cookie)).v;
 const rootAccount=accounts.users.find(u=>u.email===rootEmail);assert.equal(rootAccount.is_super_admin,true);
 await request('/api/admin/users/role',{email:rootEmail,role:'submitter',expected_version:rootAccount.version,operation_id:randomUUID()},root.cookie,'PUT',409);
 accounts=(await request('/api/admin/users?search='+encodeURIComponent(other.user.email),undefined,root.cookie)).v;
 let managed=accounts.users.find(u=>u.email===other.user.email);assert.equal(managed.role,'submitter');
 const grant={email:other.user.email,role:'admin',expected_version:managed.version,operation_id:randomUUID()};
 await request('/api/admin/users/role',grant,root.cookie,'PUT');
 await request('/api/admin/users/role',grant,root.cookie,'PUT');
 await request('/api/admin/users/role',{...grant,role:'submitter'},root.cookie,'PUT',409);
 await request('/api/me',undefined,other.cookie,'GET',401);
 managed=(await request('/api/admin/users?search='+encodeURIComponent(other.user.email),undefined,root.cookie)).v.users[0];assert.equal(managed.role,'admin');assert.equal(managed.version,grant.expected_version+1);
 await request('/api/admin/users/role',{email:other.user.email,role:'submitter',expected_version:grant.expected_version,operation_id:randomUUID()},root.cookie,'PUT',409);
 await request('/api/admin/users/role',{email:other.user.email,role:'submitter',expected_version:managed.version,operation_id:randomUUID()},root.cookie,'PUT');
 const invited='invited-'+suffix+'@example.test';
 await request('/api/admin/users/role',{email:invited,role:'admin',expected_version:null,operation_id:randomUUID()},root.cookie,'PUT');
 let invitedAccount=(await request('/api/admin/users?search='+encodeURIComponent(invited),undefined,root.cookie)).v.users[0];assert.equal(invitedAccount.verified_at,null);
 const invite=await login(invited);assert.equal(invite.user.role,'admin');assert.equal(invite.user.is_super_admin,false);
 await request('/api/admin/settings',undefined,invite.cookie);
 await request('/api/admin/users',undefined,invite.cookie,'GET',403);
 await request('/api/admin/users/role',{email:invited,role:'submitter',expected_version:invitedAccount.version,operation_id:randomUUID()},root.cookie,'PUT');
 await request('/api/me',undefined,invite.cookie,'GET',401);
 managed=(await request('/api/admin/users?search='+encodeURIComponent(other.user.email),undefined,root.cookie)).v.users[0];
 const race=await Promise.all([1,2].map(()=>fetch(origin+'/api/admin/users/role',{method:'PUT',headers:{Cookie:root.cookie,'Content-Type':'application/json',Origin:origin,'X-Requested-With':'usagi'},body:JSON.stringify({email:other.user.email,role:'admin',expected_version:managed.version,operation_id:randomUUID()})})));
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);checks+=2;
 managed=(await request('/api/admin/users?search='+encodeURIComponent(other.user.email),undefined,root.cookie)).v.users[0];
 await request('/api/admin/users/role',{email:other.user.email,role:'submitter',expected_version:managed.version,operation_id:randomUUID()},root.cookie,'PUT');
 assert.throws(()=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--command',"UPDATE users SET role='submitter' WHERE email='"+rootEmail+"'"],{env,stdio:'pipe'}),'database blocks direct demotion of a super administrator');
 assert.equal((await request('/api/me',undefined,root.cookie)).v.user.is_super_admin,true);
 // Verified platform limit is advisory: preserve the complete submitted member list.
 await request('/api/admin/bili-role-config',{category_id:null,name:'人数上限 '+suffix,platform_id:null,staff_limit:1,verified:true,evidence_url:'https://example.test/verified',labels:['演唱']},admin.cookie,'PUT');
 const limits=(await request('/api/form-config',undefined,owner.cookie)).v,limited=limits.categories.find(c=>c.name==='人数上限 '+suffix),limitedRole=limits.roles.find(r=>r.category_id===limited.id);
 const limitDraft=(await request('/api/submissions',{event_id:event.id,operation_id:randomUUID()},owner.cookie,'POST',201)).v;
 const limitForm={...form,category_id:limited.id,contributors:[{name:'甲',uid:'10001',role_option_id:limitedRole.id,work_detail:''},{name:'乙',uid:'10002',role_option_id:limitedRole.id,work_detail:''}]};
 const limitSaved=(await request('/api/submissions/'+limitDraft.id,{expectedVersion:1,form:limitForm},owner.cookie,'PATCH')).v;
 await request('/api/submissions/'+limitDraft.id+'/submit',{expectedVersion:limitSaved.version,operation_id:randomUUID(),confirmed:true},owner.cookie);
 const limitDetail=(await request('/api/submissions/'+limitDraft.id,undefined,admin.cookie)).v;assert.equal(limitDetail.staff_limit,1);assert.equal(limitDetail.form.contributors.length,2);assert.ok(limitDetail.warnings.length);
 await accountFeatureChecks({request,owner,other:await login('features-other-'+suffix+'@example.test'),admin,root,localSql,form,origin});
 await privateKeyChecks({request,mail,owner,other:await login('key-other-'+suffix+'@example.test'),localSql,login,origin});
 await request('/api/auth/logout',{},owner.cookie);await request('/api/me',undefined,owner.cookie,'GET',401);
 console.log(`PASS: ${checks} HTTP checks; real local D1, OTP mail adapter, immutable revisions, permissions, idempotency, review/program race protection, concurrent line writes, WebSocket, orphan retention, final export, outbox, super administrator authority, R2 multipart uploads and size limits, file ownership/ranges, Other validation, character colors, wishes text/audio/ZIP permissions and session invalidation.`);
}catch(e){console.error(e.message);console.error(output.slice(-3000));process.exitCode=1;}finally{worker.kill('SIGTERM');server.close();}
