import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function characterListChecks(request,base){
 const id=randomUUID(),operations=base+'/characters/operations';
 const read=async()=>(await request(base+'/characters')).lists.find(l=>l.id===id);
 const addList={operation_id:randomUUID(),type:'list.add',id,name:'直接添加角色验证'};
 assert.deepEqual(await request(operations,addList),await request(operations,addList));
 let list=await read();
 const payload=(members,l=list)=>({operation_id:randomUUID(),type:'list.update',id,expectedVersion:l.version,name:l.name,archived:!!l.archived,position:l.position,members});
 const batch=payload(['builtin-chino','builtin-cocoa','builtin-rize']);
 const ack=await request(operations,batch);assert.deepEqual(await request(operations,batch),ack);list=await read();assert.deepEqual(list.members,batch.members);assert.equal(list.version,2);
 await request(operations,{...batch,operation_id:randomUUID(),members:['builtin-maya']},'POST',409);assert.deepEqual((await read()).members,batch.members);
 await request(operations,payload(['builtin-chino','builtin-chino']),'POST',422);
 const foreignEvent=await request('/api/admin/events',{name:'列表隔离 '+randomUUID().slice(0,8),year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,active:false,submissions_open:false,wishes_open:false});
 const foreign=randomUUID(),archived=randomUUID(),retained=randomUUID();
 await request('/api/admin/events/'+foreignEvent.id+'/characters/operations',{operation_id:randomUUID(),type:'character.add',id:foreign,name:'其他活动角色',color:'#80636f',list_id:null});
 for(const char of [archived,retained])await request(operations,{operation_id:randomUUID(),type:'character.add',id:char,name:'归档验证 '+char.slice(0,8),color:'#80636f',list_id:null});
 await request(operations,payload([...list.members,retained]));list=await read();
 for(const char of [archived,retained])await request(operations,{operation_id:randomUUID(),type:'character.update',id:char,expectedVersion:1,name:'归档验证 '+char.slice(0,8),color:'#80636f',archived:true});
 for(const invalid of [foreign,archived,'aux-narrator','unknown-character']){await request(operations,payload([...list.members,invalid]),'POST',409);assert.deepEqual(await read(),list,'invalid batch leaves membership and version intact');}
 await request(operations,payload([...list.members,'builtin-maya']));list=await read();assert.ok(list.members.includes(retained),'existing archived member is preserved');
 const results=await Promise.all(['builtin-syaro','builtin-chiya'].map(char=>request(operations,payload([...list.members,char]),'POST',[200,409])));
 assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.filter(r=>r.error).length,1);const raced=await read();assert.equal(raced.members.length,list.members.length+1);assert.deepEqual(raced.members.slice(0,-1),list.members);
 list=raced;await request(operations,payload(Array.from({length:301},()=>randomUUID())),'POST',422);
 await request(operations,{...payload(list.members),archived:true});const archivedList=await read();assert.equal(archivedList.archived,1);
 await request(operations,payload([...list.members,'builtin-megu']),'POST',409);assert.deepEqual(await read(),archivedList);
 console.log('PASS: batch character membership, order, idempotent retry, stale/concurrent edits, duplicate/cap limits, event isolation, unavailable actors and atomic rejection, existing archived membership retained and archived-list conflict.');
}
