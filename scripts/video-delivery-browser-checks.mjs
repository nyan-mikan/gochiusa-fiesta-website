import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {videoFixture} from './video-fixture.mjs';

export async function videoDeliveryBrowserChecks({evaluate,cmd,click,wait,visible,origin}){
 const api=async(path,data,method=data===undefined?'GET':'POST')=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'usagi'},${data===undefined?'':'body:JSON.stringify('+JSON.stringify(data)+'),'}});const v=await r.json();if(!r.ok)throw Error(v.error||'API failed');return v;})()`);
 const navigate=async apiPath=>{const path='/submit/'+apiPath.split('/').at(-1);const old=(await cmd('Page.getFrameTree')).frameTree.frame.loaderId;await cmd('Page.navigate',{url:origin+path});await wait(async()=>(await cmd('Page.getFrameTree')).frameTree.frame.loaderId!==old,'new delivery document');await wait(()=>evaluate(`location.pathname===${JSON.stringify(path)}&&!!document.querySelector('#field-title')`),'delivery form loaded');};
 const event=await api('/api/admin/events',{name:'视频交付浏览器测试',year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,active:true});
 const config=await api('/api/form-config'),category=config.categories.find(c=>c.id==='preset-music'),role=config.roles.find(r=>r.category_id===category.id),person={name:'视频测试',uid:'86'+Date.now()};
 const create=async()=>{const draft=await api('/api/submissions',{event_id:event.id,operation_id:randomUUID()});await api('/api/submissions/'+draft.id,{expectedVersion:1,form:{title:'先提交后交付',type:'翻唱',description:'黑色测试视频',duration_seconds:60,category_id:category.id,delivery_url:'',access_notes:'',notes:'保留备注',contact:person,uploader:person,contributors:[{...person,role_option_id:role.id,work_detail:'',role_other:''}]}},'PATCH');await api('/api/submissions/'+draft.id+'/submit',{expectedVersion:2,confirmed:true,operation_id:randomUUID()});return '/api/submissions/'+draft.id;};
 const drop=async(data,name,type)=>evaluate(`(()=>{const b=Uint8Array.from(atob(${JSON.stringify(data.toString('base64'))}),c=>c.charCodeAt(0));const t=new DataTransfer();t.items.add(new File([b],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));document.querySelector('.upload-panel .file-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:t}));return true;})()`);
 const ready=()=>wait(()=>evaluate(`!![...document.querySelectorAll('#page-actions button')].find(b=>b.textContent.trim()==='提交视频'&&!b.disabled)`),'video ready to submit');
 const fresh=async()=>{const old=(await cmd('Page.getFrameTree')).frameTree.frame.loaderId;await cmd('Page.reload');await wait(async()=>(await cmd('Page.getFrameTree')).frameTree.frame.loaderId!==old,'delivery reloaded document');await wait(()=>evaluate(`!!document.querySelector('.upload-file a')`),'delivery survives refresh');};
 const dir=await mkdtemp(join(tmpdir(),'gochiusa-video-browser-'));
 try{
  await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});const path=await create(),before=await api(path);await navigate(path);
  await wait(()=>evaluate(`document.querySelector('.upload-panel input[type=file]')&&!document.querySelector('.upload-panel input[type=file]').matches(':disabled')`),'pending submission allows upload');
  assert.equal(await evaluate(`document.querySelector('#field-title').matches(':disabled')`),true,'metadata remains frozen');assert.equal(await evaluate(`document.querySelector('#field-delivery_url')`),null);
  await drop(Buffer.from('not video'),'附件.txt','text/plain');await wait(()=>visible('文件格式不支持'),'drop rejects nonvideo');assert.equal((await api(path)).uploaded_file,null);
  const file=join(dir,'黑色视频.mp4');await writeFile(file,videoFixture('black.mp4'));
  const root=await cmd('DOM.getDocument'),input=await cmd('DOM.querySelector',{nodeId:root.root.nodeId,selector:'.upload-panel input[type=file]'});await cmd('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});await ready();
  await evaluate(`document.querySelector('.upload-panel').scrollIntoView({block:'center'})`);const desktop=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/tmp/gochiusa-video-delivery-desktop.png',Buffer.from(desktop.data,'base64'));
  assert.equal((await api(path)).uploaded_file,null,'upload is not submitted until confirmed');assert.equal((await api(path)).revision.duration_seconds,60,'supplement metadata does not change the original duration');
  await click('提交视频');await wait(()=>visible('提交这个视频？'),'delivery confirmation');await click('取消');await ready();assert.equal((await api(path)).uploaded_file,null);
  await click('提交视频');await wait(()=>visible('提交这个视频？'),'confirm again');await click('确认');await wait(()=>visible('视频已补交。'),'video submitted');await fresh();
  const after=await api(path);assert.deepEqual(after.revision,before.revision);assert.equal(after.submission.status,'pending');assert.ok(after.delivery_at);assert.equal(await evaluate(`document.querySelector('.upload-panel input[type=file]')`),null,'submitted delivery cannot be replaced');
  const mobile=await create();await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await cmd('Emulation.setTouchEmulationEnabled',{enabled:true});await navigate(mobile);await wait(()=>evaluate(`!!document.querySelector('.upload-panel input[type=file]')&&!document.querySelector('.upload-panel input[type=file]').matches(':disabled')`),'mobile supplement input');
  await evaluate(`window.videoEnterCount=0;document.addEventListener('keydown',e=>{if(e.key==='Enter')window.videoEnterCount++})`);
  await drop(videoFixture('black.webm'),'移动端.webm','video/webm');await ready();
  await evaluate(`document.querySelector('.upload-panel').scrollIntoView({block:'center'})`);const mobileShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/tmp/gochiusa-video-delivery-mobile.png',Buffer.from(mobileShot.data,'base64'));
  const pending=await api(mobile);await api('/api/admin/submissions/'+pending.submission.id+'/reviews',{expectedVersion:pending.submission.version,expectedRevision:pending.revision.id,decision:'approved',operation_id:randomUUID()});
  await click('提交视频');await wait(()=>visible('提交这个视频？'),'mobile confirmation');await click('确认');await wait(()=>visible('数据状态已改变'),'review conflict shown');await ready();assert.equal((await api(mobile)).uploaded_file,null,'conflict does not submit the upload');
  const tap=async label=>{const box=await evaluate(`(()=>{const n=[...document.querySelectorAll('#page-actions button,dialog[open] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[box]});await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await tap('提交视频');await wait(()=>visible('提交这个视频？'),'touch confirmation');await tap('确认');await wait(()=>visible('视频已补交。'),'touch submits video');assert.equal(await evaluate('window.videoEnterCount'),0);
  const delivered=await api(mobile);assert.equal(delivered.submission.status,'approved');assert.deepEqual(delivered.revision,pending.revision);await fresh();
  for(const width of [320,390,1440]){await cmd('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<761});assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,'delivery layout fits '+width);}
  await cmd('Emulation.setTouchEmulationEnabled',{enabled:false});
  console.log('PASS: native video selection, file drop/type rejection, frozen metadata with enabled supplementary upload, explicit submission/cancel, refresh, concurrent-review recovery preserving uploaded video, actual touch submission with zero Enter, 320/390/1440px.');
 }finally{await rm(dir,{recursive:true,force:true});}
}
