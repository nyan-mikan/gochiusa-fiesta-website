// Real private R2 validation, staging only. Test sessions are revoked in finally.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const origin='https://gochiusa-fiesta-staging.nyan-mikan.workers.dev';
const bucket='gochiusa-fiesta-staging-uploads',dir=mkdtempSync(join(tmpdir(),'usagi-r2-check-'));
const cliEnv={...process.env,WRANGLER_LOG_PATH:'/private/tmp/gochiusa-wrangler-logs',WRANGLER_SEND_METRICS:'false'};
const q=s=>"'"+s.replaceAll("'","''")+"'";
const admin={id:randomUUID(),token:randomBytes(32).toString('hex'),role:'admin'};
const other={id:randomUUID(),token:randomBytes(32).toString('hex'),role:'submitter'};
let eventId='',checks=0;
function cli(args){return execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',stdio:'pipe',env:cliEnv});}
function sql(query,read=false){const file=join(dir,'fixture.sql');writeFileSync(file,query,{mode:0o600});const output=cli(['d1','execute','DB','--env','staging','--remote','--file',file,'--json']);if(!read)return;const start=output.search(/^\s*\[\s*\{/m);assert.ok(start>=0,'D1 JSON result missing');return JSON.parse(output.slice(start));}
function headers(user=admin,write=false){return {...(user?{Cookie:'usagi_session='+user.token}:{}),...(write?{Origin:origin,'X-Requested-With':'usagi'}:{})};}
async function json(path,data,method=data===undefined?'GET':'POST',status=200,user=admin){
 const r=await fetch(origin+path,{method,headers:{...headers(user,data!==undefined),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const text=await r.text();assert.equal(r.status,status,path+': '+text);checks++;return r.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text;
}
async function put(path,data,status=200,user=admin,extra={}){const r=await fetch(origin+path,{method:'PUT',headers:{...headers(user,true),...extra},body:data});assert.equal(r.status,status,path+': '+await r.text());checks++;}
async function bytes(path,status=200,user=admin,extra={}){const r=await fetch(origin+path,{headers:{...headers(user),...extra}});assert.equal(r.status,status,path);checks++;return {r,data:Buffer.from(await r.arrayBuffer())};}
try{
 const now=new Date().toISOString();
 sql([admin,other].map(u=>`INSERT INTO users(id,email,role,verified_at,created_at) VALUES(${q(u.id)},${q('r2-check-'+u.id+'@example.test')},${q(u.role)},${q(now)},${q(now)}); INSERT INTO sessions VALUES(${q(createHash('sha256').update(u.token).digest('hex'))},${q(u.id)},${q(new Date(Date.now()+3600000).toISOString())},NULL,${q(now)});`).join('\n'));
 eventId=(await json('/api/admin/events',{name:'R2 validation '+admin.id.slice(0,8),year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:false,active:true})).id;
 assert.equal((await json('/api/wishes?event_id='+eventId)).audio_ready,true);
 const wish=(await json('/api/wishes',{event_id:eventId,operation_id:randomUUID()},'POST',201));
 const wave=Buffer.alloc(16044);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(16000,40);
 const audio='/api/wishes/'+wish.id+'/audio',audioHeaders={'X-Filename':encodeURIComponent('云端祝福.wav'),'Content-Type':'audio/wav'};
 await put(audio,wave,403,other,audioHeaders);
 await put(audio,Buffer.from('fake audio'),422,admin,audioHeaders);
 await put(audio,Buffer.alloc(20971521),413,admin,audioHeaders);
 await put(audio,wave,200,admin,audioHeaders);await put(audio,wave,200,admin,audioHeaders);
 const changed=Buffer.from(wave);changed[50]=1;await put(audio,changed,409,admin,audioHeaders);
 await bytes(audio,401,null);await bytes(audio,404,other);
 const full=await bytes(audio);assert.equal(full.r.headers.get('content-type'),'audio/wav');assert.deepEqual(full.data,wave);
 const range=await bytes(audio,206,admin,{Range:'bytes=0-43'});assert.deepEqual(range.data,wave.subarray(0,44));assert.equal(range.r.headers.get('content-range'),'bytes 0-43/16044');
 await bytes(audio,416,admin,{Range:'bytes=999999-'});
 const download=await bytes(audio+'?download=1');assert.match(download.r.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(download.data,wave);
 const removal={expectedVersion:1,expectedAudio:createHash('sha256').update(wave).digest('hex'),operation_id:randomUUID()};
 await json(audio,removal,'DELETE',403,other);await json(audio,{...removal,expectedAudio:'0'.repeat(64)},'DELETE',409);
 await json(audio,removal,'DELETE');await json(audio,removal,'DELETE');await bytes(audio,404);
 await put(audio,wave,200,admin,audioHeaders);await json(audio,removal,'DELETE');assert.deepEqual((await bytes(audio)).data,wave);
 for(const text of ['', ' \n\t　'])await json('/api/wishes/'+wish.id+'/submit',{display_name:'云端语音验收',text,expectedVersion:1,operation_id:randomUUID()},'POST',422);
 await json('/api/wishes/'+wish.id+'/submit',{display_name:'云端语音验收',text:'R2 实际语音测试',expectedVersion:1,operation_id:randomUUID()});
 await put(audio,wave,409,admin,audioHeaders);
 await json(audio,{...removal,operation_id:randomUUID()},'DELETE',409);
 assert.equal((await json('/api/admin/wishes/export-check?'+new URLSearchParams({event_id:eventId,kind:'text',search:'实际语音'}))).count,1);
 await json('/api/admin/wishes/export-check?'+new URLSearchParams({event_id:eventId,kind:'text',search:'不存在的祝福'}),undefined,'GET',422);
 assert.equal((await json('/api/admin/wishes?event_id='+eventId)).items[0].filename,'云端祝福.wav');
 assert.equal((await json('/api/admin/wishes/export-check?event_id='+eventId+'&kind=audio')).count,1);
 const archive=await bytes('/api/admin/wishes/export?event_id='+eventId+'&kind=audio');assert.equal(archive.r.headers.get('content-type'),'application/zip');const files=Object.values(unzipSync(archive.data));assert.equal(files.length,1);assert.deepEqual(Buffer.from(files[0]),wave);
 await bytes('/api/admin/wishes/export?event_id='+eventId+'&kind=audio',403,other);
 const draft=await json('/api/submissions',{event_id:eventId,operation_id:randomUUID()},'POST',201);
 const base='/api/submissions/'+draft.id+'/uploads';
 await json(base,{filename:'过大.bin',size:1000000001,content_type:'application/octet-stream'},'POST',422);
 await json(base,{filename:'越权.bin',size:12,content_type:'application/octet-stream'},'POST',404,other);
 const boundary=await json(base,{filename:'最大声明.bin',size:1000000000,content_type:'application/octet-stream'},'POST',201);
 await json('/api/uploads/'+boundary.id,{},'DELETE');
 const upload=await json(base,{filename:'云端分片验收.bin',size:10485787,content_type:'application/octet-stream'},'POST',201);
 assert.equal(upload.part_size,10485760);const data=Buffer.alloc(upload.part_size+27,65);data.fill(66,upload.part_size);const up='/api/uploads/'+upload.id;
 await put(up+'/parts/1',data.subarray(0,upload.part_size),404,other,{'Content-Type':'application/octet-stream'});
 await put(up+'/parts/1',data.subarray(0,upload.part_size),200,admin,{'Content-Type':'application/octet-stream'});
 await put(up+'/parts/1',data.subarray(0,upload.part_size),200,admin,{'Content-Type':'application/octet-stream'});
 await json(up+'/complete',{},'POST',422);
 await put(up+'/parts/2',data.subarray(upload.part_size),200,admin,{'Content-Type':'application/octet-stream'});
 await json(up+'/complete',{});await json(up+'/complete',{});
 const work=await bytes(up+'/download');assert.deepEqual(work.data,data);assert.match(work.r.headers.get('content-disposition'),/^attachment;/);
 const tail=await bytes(up+'/download',206,admin,{Range:'bytes=-27'});assert.deepEqual(tail.data,Buffer.alloc(27,66));
 await bytes(up+'/download',401,null);await bytes(up+'/download',404,other);
 console.log(`PASS: ${checks} real staging private R2 voice/ZIP/ranges/multipart/1GB boundary/permissions checks.`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{
 try{
  const stamp=new Date().toISOString();sql(`UPDATE sessions SET revoked_at=${q(stamp)} WHERE user_id IN(${q(admin.id)},${q(other.id)}); UPDATE users SET disabled_at=${q(stamp)} WHERE id IN(${q(admin.id)},${q(other.id)}); ${eventId?`UPDATE events SET active=0,submissions_open=0,wishes_open=0 WHERE id=${q(eventId)};`:''}`);
  if(eventId){const result=sql(`SELECT object_key FROM wish_audio a JOIN wishes w ON w.id=a.wish_id WHERE w.event_id=${q(eventId)} UNION SELECT object_key FROM uploads u JOIN submissions s ON s.id=u.submission_id WHERE s.event_id=${q(eventId)} AND u.state='complete';`,true);
   for(const row of result[0].results)cli(['r2','object','delete',bucket+'/'+row.object_key,'--remote']);
  }
  console.log('Test accounts disabled, sessions revoked, event closed, and completed test objects removed.');
 }catch(e){console.error('R2 staging cleanup failed: '+e.message);process.exitCode=1;}
 rmSync(dir,{recursive:true,force:true});
}
