import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function dialogueChecks(request,base){
 let s=await request(base+'/script');const bid=randomUUID(),lid=randomUUID();
 const op=(data,status=200)=>request(base+'/script/operations',{operation_id:randomUUID(),...data},'POST',status);
 const read=async()=>{s=await request(base+'/script');return s.lines.find(l=>l.id===lid);};
 await op({type:'block.add',id:bid,expectedVersion:s.document.structure_version,title:'多角色台词验证',before_program_item_id:null,at_end:false,at_start:true,opening:false});await read();
 const initial=[{text:'新年快乐！',speaker_ids:['builtin-chino','builtin-cocoa']},{text:'请欣赏节目。',speaker_ids:['builtin-rize']}];
 const payload={type:'line.add',id:lid,block_id:bid,expectedVersion:s.blocks.find(b=>b.id===bid).version,kind:'dialogue',speaker_id:null,text:initial.map(p=>p.text).join(''),segments:initial,direction:'看向镜头'};
 const stable={...payload,operation_id:randomUUID()};const ack=await request(base+'/script/operations',stable);assert.deepEqual(await request(base+'/script/operations',stable),ack);assert.deepEqual(ack.line.segments,initial);assert.deepEqual((await read()).segments,initial);
 const line=()=>s.lines.find(l=>l.id===lid);
 const update=(segments,extra={},status=200)=>op({type:'line.update',id:lid,expectedVersion:line().version,kind:'dialogue',speaker_id:null,text:segments.map(p=>p.text).join(''),direction:'看向镜头',segments,...extra},status);
 await update([{text:'重复',speaker_ids:['builtin-chino','builtin-chino']}],{},422);
 await update([{text:'旁白',speaker_ids:['aux-narrator']}],{},422);
 await update([{text:'未知',speaker_ids:['missing-character']}],{},422);
 await update(initial,{speaker_id:'builtin-chino'},422);await update(initial,{text:'不一致正文'},422);
 await update([{text:'a'.repeat(3000),speaker_ids:['builtin-chino']},{text:'b'.repeat(3000),speaker_ids:['builtin-cocoa']}],{},422);
 await update(initial,{kind:'comment'},422);
 const scoped=(await request('/api/admin/events',{name:'角色作用域验证 '+randomUUID().slice(0,8),year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,active:false,submissions_open:false,wishes_open:false})).id;
 const foreignId=randomUUID();await request('/api/admin/events/'+scoped+'/characters/operations',{type:'character.add',operation_id:randomUUID(),id:foreignId,name:'其他活动角色',color:'#80636f',list_id:null});
 await update([{text:'跨活动角色不可引用',speaker_ids:[foreignId]}],{},422);
 const customId=randomUUID();await request(base+'/characters/operations',{type:'character.add',operation_id:randomUUID(),id:customId,name:'合说历史角色',color:'#80636f',list_id:null});await read();
 await update([{text:'保留归档角色引用',speaker_ids:['builtin-chino',customId]}]);await read();
 await request(base+'/characters/operations',{type:'character.update',operation_id:randomUUID(),id:customId,expectedVersion:1,name:'合说历史角色',color:'#80636f',archived:true});await read();
 await update([{text:'归档后仍能编辑原句',speaker_ids:['builtin-chino',customId]}]);await read();
 await op({...payload,id:randomUUID(),expectedVersion:s.blocks.find(b=>b.id===bid).version,text:'新句不能引用归档角色',segments:[{text:'新句不能引用归档角色',speaker_ids:[customId]}]},422);
 await op({type:'line.update',id:lid,expectedVersion:line().version,kind:'dialogue',speaker_id:'builtin-chino',text:'旧编辑器不可覆盖分段',direction:''},422);
 const updated=[initial[0],{...initial[1],speaker_ids:['builtin-rize','builtin-syaro']}];await update(updated);await read();const version=line().version;
 await update(initial,{expectedVersion:version-1},409);assert.deepEqual((await read()).segments,updated);
 const preview=await request(base+'/script/export');assert.ok(preview.includes('香风智乃、保登心爱（合说）：新年快乐！'));assert.ok(preview.includes('天天座理世、桐间纱路（合说）：请欣赏节目。'));
 const chino=await request(base+'/script/export?speaker=builtin-chino');assert.ok(chino.includes('新年快乐！'));assert.ok(!chino.includes('请欣赏节目。'));
 const rize=await request(base+'/script/export?speaker=builtin-rize');assert.ok(!rize.includes('新年快乐！'));assert.ok(rize.includes('请欣赏节目。'));
 const second=randomUUID(),offset=initial[0].text.length+2;
 await op({type:'line.split',id:lid,expectedVersion:line().version,blockVersion:s.blocks.find(b=>b.id===bid).version,new_id:second,offset});await read();
 const right=s.lines.find(l=>l.id===second);assert.equal(line().text+right.text,updated.map(p=>p.text).join(''));assert.deepEqual(right.segments[0].speaker_ids,updated[1].speaker_ids);
 await op({type:'line.merge',id:lid,expectedVersion:line().version,blockVersion:s.blocks.find(b=>b.id===bid).version,next_id:second,nextVersion:right.version});await read();assert.ok(line().segments.length>=2);assert.equal(s.lines.filter(l=>l.block_id===bid).length,1);
 // A text-bearing fragment must have speakers before finalization.
 await update([{text:'还未选择角色',speaker_ids:[]}]);await read();
 await request(base+'/program/lock',{operation_id:randomUUID(),expectedVersion:s.program.version,locked:true,reason:''});await read();
 await op({type:'script.lock',expectedVersion:s.document.structure_version,expectedSeq:s.seq,programVersion:s.program.version,locked:true,reason:''},422);
 await update(updated);await read();await op({type:'script.lock',expectedVersion:s.document.structure_version,expectedSeq:s.seq,programVersion:s.program.version,locked:true,reason:''});await read();
 assert.ok((await request(base+'/script/export?formal=1')).includes('香风智乃、保登心爱（合说）'));
 await update(initial,{},409);
 await op({type:'script.lock',expectedVersion:s.document.structure_version,expectedSeq:s.seq,programVersion:s.program.version,locked:false,reason:'验证后解锁'});await read();
 await request(base+'/program/lock',{operation_id:randomUUID(),expectedVersion:s.program.version,locked:false,reason:'验证后解锁'});await read();
 await op({type:'line.update',id:lid,expectedVersion:line().version,kind:'comment',speaker_id:null,segments:null,text:'转成注释仍保留正文',direction:''});await read();assert.equal(line().kind,'comment');assert.equal(line().segments,undefined);
 await op({type:'block.delete',id:bid,expectedVersion:s.blocks.find(b=>b.id===bid).version,documentVersion:s.document.structure_version});await read();assert.ok(!line());
}
