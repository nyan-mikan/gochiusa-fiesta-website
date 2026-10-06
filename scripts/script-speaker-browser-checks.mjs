import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

export async function speakerBrowserChecks({evaluate,cmd,fill,wait,click,origin}){
 const api=(path,data)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(data===undefined?'GET':'POST')},headers:{'Content-Type':'application/json','X-Requested-With':'usagi'},${data===undefined?'':'body:JSON.stringify('+JSON.stringify(data)+'),'}});const v=await r.json();if(!r.ok)throw Error(v.error);return v;})()`);
 const event=await api('/api/admin/events',{name:'角色必填浏览器 '+randomUUID().slice(0,8),year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,active:true,submissions_open:true,wishes_open:true}),base='/api/admin/events/'+event.id;
 let snap=await api(base+'/script');const blockId=snap.blocks.find(b=>b.at_start).id,ids=[];
 for(const fields of [
  {kind:'dialogue',text:'早上好。'},
  {kind:'dialogue',text:'大家好。请欣赏节目。   ',segments:[{text:'大家好。',speaker_ids:['builtin-cocoa','builtin-chino']},{text:'请欣赏节目。',speaker_ids:[]},{text:'   ',speaker_ids:[]}]},
  {kind:'comment',text:'走上舞台。'},{kind:'heading',text:'开场'},{kind:'dialogue',text:'   '}
 ]){snap=await api(base+'/script');const id=randomUUID();ids.push(id);await api(base+'/script/operations',{operation_id:randomUUID(),type:'line.add',id,block_id:blockId,expectedVersion:snap.blocks.find(b=>b.id===blockId).version,speaker_id:null,direction:'',...fields});}
 const navigate=async()=>{await cmd('Page.navigate',{url:origin+'/admin/script'});await wait(()=>evaluate(`!!document.querySelector('.event-picker option[value="${event.id}"]')`),'required speaker event');await evaluate(`(()=>{const n=document.querySelector('.event-picker select');if(n.value!==${JSON.stringify(event.id)}){n.value=${JSON.stringify(event.id)};n.dispatchEvent(new Event('change',{bubbles:true}));}})()`);await wait(()=>evaluate(`!!document.getElementById(${JSON.stringify(ids[0])})`),'required speaker editor');};
 await navigate();
 const errors=()=>evaluate(`document.querySelectorAll('.speaker-required').length`);
 await wait(async()=>await errors()===2,'unassigned single and fragment errors without a review');
 assert.equal((await api(base+'/script/language-reviews')).reviews.length,0,'required errors do not need any review request');
 assert.equal(await evaluate(`document.querySelectorAll('.speaker-required button').length`),0,'required errors cannot be ignored');
 assert.equal(await evaluate(`document.getElementById('speaker-'+${JSON.stringify(ids[0])}).required&&document.getElementById('speaker-'+${JSON.stringify(ids[0])}).getAttribute('aria-invalid')==='true'`),true);
 for(const width of [1440,390]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760});
  await wait(()=>evaluate(`!!document.querySelector('.message-summary.message-E')`),'red system error');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await evaluate(`document.querySelector('.message-summary').click()`);await wait(()=>evaluate(`!!document.querySelector('.message-popover')`),'required error popup');assert.equal(await evaluate(`document.querySelector('.message-popover').querySelectorAll('.message-code .icon-E circle').length`),2);
  const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/tmp/gochiusa-script-required-'+width+'.png',Buffer.from(shot.data,'base64'));
  await evaluate(`[...document.querySelectorAll('.message-row')].find(n=>n.textContent.includes('片段 2')).click()`);await wait(()=>evaluate(`document.activeElement?.id===${JSON.stringify(ids[1]+'-speaker-1')}&&document.activeElement.parentElement.open`),'system error focuses and opens the missing fragment actor picker');
 }
 await navigate();await wait(async()=>await errors()===2,'required errors restored from saved draft on refresh');
 await click('检查并定稿');await wait(()=>evaluate(`document.activeElement?.id===${JSON.stringify('speaker-'+ids[0])}`),'finalize focuses first required actor after refreshing and saving');assert.equal((await api(base+'/script')).document.locked,0);
 await evaluate(`(()=>{const n=document.getElementById('speaker-'+${JSON.stringify(ids[0])});n.value='builtin-chino';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(async()=>await errors()===1,'single speaker clears immediately without Enter');
 const segmentInput=ids[1]+'-segment-1';await fill('#'+CSSescape(segmentInput),'');await wait(async()=>await errors()===0,'empty fragment has no premature error');await fill('#'+CSSescape(segmentInput),'请欣赏节目。');await wait(async()=>await errors()===1,'typing missing fragment body raises error without Enter');
 await click('检查并定稿');await wait(()=>evaluate(`document.activeElement?.id===${JSON.stringify(ids[1]+'-speaker-1')}`),'finalize focuses the remaining required fragment after saving');assert.equal((await api(base+'/script')).document.locked,0);
 await evaluate(`(()=>{const summary=document.getElementById(${JSON.stringify(ids[1]+'-speaker-1')});summary.parentElement.open=true;const n=summary.parentElement.querySelector('input[type=checkbox]');n.click();})()`);await wait(async()=>await errors()===0,'touch selection resolves the fragment');
 await click('立即保存');await wait(async()=>{const s=await api(base+'/script');return s.lines.find(l=>l.id===ids[0]).speaker_id==='builtin-chino'&&s.lines.find(l=>l.id===ids[1]).segments[1].speaker_ids.length===1;},'speaker changes and drafts persist');
 snap=await api(base+'/script');await api(base+'/program/lock',{operation_id:randomUUID(),expectedVersion:snap.program.version,locked:true,reason:''});await navigate();await wait(async()=>await errors()===0,'resolved errors remain gone on reload');await click('检查并定稿');await wait(async()=>(await api(base+'/script')).document.locked===1,'complete dialogue plus blank/comment/heading finalize');
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 console.log('PASS: required actor errors without AI/Enter, red circular system messages and target focus at desktop/mobile widths, refresh, non-ignorable errors, draft retention, single/mixed chorus fragment checks, blank/comment/heading exemptions, and finalize blocking then success.');
}
function CSSescape(id){return id.replace(/^[0-9]/,n=>'\\3'+n+' ');}
