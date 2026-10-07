import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export async function accountFeaturesBrowserChecks({evaluate,cmd,click,fill,wait,visible,origin,email,env}){
 const api=async(path,data,method=data===undefined?'GET':'POST')=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'usagi'},${data===undefined?'':'body:JSON.stringify('+JSON.stringify(data)+'),'}});const v=await r.json();if(!r.ok)throw Error(v.error||'API failed');return v;})()`);
 execFileSync(process.execPath,['scripts/bootstrap-admin.mjs',email,'local'],{env,stdio:'pipe'});
 const event=await api('/api/admin/events',{name:'浏览器功能验证 '+randomUUID().slice(0,8),year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,active:true});
 const navigate=async path=>{await cmd('Page.navigate',{url:origin+path});await wait(()=>evaluate(`location.pathname===${JSON.stringify(path)}`),'navigate '+path);};
 await navigate('/wishes');await wait(()=>evaluate(`!!document.querySelector('.event-picker option[value="${event.id}"]')`),'wish event picker');
 await evaluate(`(()=>{const n=document.querySelector('.event-picker select');n.value=${JSON.stringify(event.id)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(()=>evaluate(`!!document.querySelector('.wish-form fieldset')&&!document.querySelector('.wish-form fieldset').disabled`),'wish form');
 assert.equal(await evaluate(`document.querySelector('.wish-form input[autocomplete=nickname]').value`),'浏览器昵称');
 await fill('.wish-form textarea','浏览器一人一则祝福语');await click('提交祝福语');await wait(()=>visible('确认提交祝福语'),'wish confirmation');await click('返回修改');assert.equal(await evaluate(`document.querySelector('.wish-form textarea').value`),'浏览器一人一则祝福语');await click('提交祝福语');await click('确认提交');await wait(()=>visible('本活动的祝福语已提交'),'one wish submitted');assert.equal(await evaluate(`!!document.querySelector('.wish-form form')`),false);
 await cmd('Page.reload');await wait(()=>visible('本活动的祝福语已提交'),'limit survives refresh');assert.equal(await evaluate(`!!document.querySelector('.wish-form form')`),false);
 const create=async()=>api('/api/submissions',{event_id:event.id,operation_id:randomUUID()});
 const first=await create();await navigate('/submit');await wait(()=>evaluate(`!!document.querySelector('.delete-draft')`),'list deletion control');
 await click('删除草稿');await wait(()=>visible('删除「未命名草稿」'),'list deletion confirm');await click('取消');assert.ok((await api('/api/submissions/'+first.id)).submission);
 await click('删除草稿');await wait(()=>visible('删除「未命名草稿」'),'list confirm again');await click('确认');await wait(()=>evaluate(`!document.querySelector('.delete-draft')`),'draft removed from list');
 const second=await create();await navigate('/submit/'+second.id);await wait(()=>evaluate(`!!document.querySelector('#field-title')&&!!document.querySelector('.delete-draft')`),'detail delete');
 await fill('.duration-picker','00:03:20');await click('保存草稿');await wait(async()=>((await api('/api/submissions/'+second.id)).form.duration_seconds===200),'duration saved');
 await fill('.duration-picker','');await click('保存草稿');await wait(async()=>((await api('/api/submissions/'+second.id)).form.duration_seconds===0),'cleared duration saved');await cmd('Page.reload');await wait(()=>evaluate(`document.querySelector('.duration-picker')?.value===''`),'cleared duration survives refresh');await click('检查并提交');await wait(()=>visible('请填写节目时长'),'duration required');
 await fill('#field-title','待删除的本机修改');await click('删除草稿');await wait(()=>visible('删除这份草稿'),'detail deletion confirm');await click('确认');await wait(()=>evaluate(`location.pathname==='/submit'&&!document.querySelector('.delete-draft')`),'detail deletion returns to list');
 let snapshot=await api('/api/admin/events/'+event.id+'/script');const block=snapshot.blocks.find(b=>b.at_start);
 for(const text of ['浏览器批量台词甲','浏览器批量台词乙']){snapshot=await api('/api/admin/events/'+event.id+'/script');await api('/api/admin/events/'+event.id+'/script/operations',{type:'line.add',operation_id:randomUUID(),id:randomUUID(),block_id:block.id,expectedVersion:snapshot.blocks.find(b=>b.id===block.id).version,speaker_id:'builtin-cocoa',text,direction:''});}
 await navigate('/admin/script');await wait(()=>evaluate(`document.querySelectorAll('.script-line').length===2&&document.querySelector('.event-picker select')?.value===${JSON.stringify(event.id)}`),'script lines');
 await evaluate(`document.querySelector('.script-tools summary').click()`);await click('批量删除台词');await wait(()=>evaluate(`document.querySelectorAll('.line-selection input').length===2`),'selection checkboxes');await click('选择本段');await wait(()=>visible('删除已选（2）'),'selected count');
 await click('删除已选（2）');await wait(()=>visible('删除选中的 2 条台词'),'bulk confirmation');await click('取消');assert.equal(await evaluate(`document.querySelectorAll('.script-line').length`),2);
 await click('删除已选（2）');await wait(()=>visible('删除选中的 2 条台词'),'bulk confirmation again');await click('确认');await wait(()=>evaluate(`document.querySelectorAll('.script-line').length===0`),'bulk deletion');assert.equal((await api('/api/admin/events/'+event.id+'/script')).lines.length,0);
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
 console.log('PASS: browser nickname default, one-wish form/refresh, draft list/detail deletion and cancellation, unsaved draft handling, mobile batch selection/delete and cancellation.');
}
