import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Reuse the caller's real HTTP session and isolated test event; never mock D1.
export async function automaticScriptChecks(request,base){
 let s=await request(base+'/script');
 const original=s.items.map(({id,revision_id,custom_name,custom_type,custom_duration,notes})=>({id,revision_id,custom_name,custom_type,custom_duration,notes}));
 const start=s.blocks.find(b=>b.at_start&&b.auto_generated);
 assert.equal(s.blocks.filter(b=>b.at_start&&b.auto_generated).length,1);
 assert.equal(start.title,'贺年祭开始');
 for(const item of original)assert.equal(s.blocks.filter(b=>b.auto_generated&&b.before_program_item_id===item.id).length,1);
 const reread=await request(base+'/script');assert.equal(reread.seq,s.seq);assert.deepEqual(reread.blocks.map(b=>b.id),s.blocks.map(b=>b.id));
 await request(base+'/script/operations',{type:'block.delete',operation_id:randomUUID(),id:start.id,expectedVersion:start.version,documentVersion:s.document.structure_version},'POST',422);
 const a={id:randomUUID(),revision_id:null,custom_name:'自动段落 A',custom_type:'互动',custom_duration:30,notes:''},b={...a,id:randomUUID(),custom_name:'自动段落 B'};
 const save=async(items,expectedVersion)=>{s=await request(base+'/script');const op={operation_id:randomUUID(),expectedVersion:expectedVersion??s.program.version,starts_at:s.program.starts_at,items};const ack=await request(base+'/program',op,'PUT');assert.deepEqual(await request(base+'/program',op,'PUT'),ack);s=await request(base+'/script');};
 await save([...original,a,b]);let block=s.blocks.find(x=>x.auto_generated&&x.before_program_item_id===a.id);const aBlockId=block.id,bBlockId=s.blocks.find(x=>x.auto_generated&&x.before_program_item_id===b.id).id;
 const lineId=randomUUID();await request(base+'/script/operations',{type:'line.add',operation_id:randomUUID(),block_id:block.id,id:lineId,expectedVersion:block.version,kind:'comment',speaker_id:null,text:'自动段落中保留的内容',direction:''});
 b.custom_name='节目改名 B';await save([b,a,...original]);
 assert.equal(s.items[0].id,b.id);assert.equal(s.blocks.find(x=>x.id===bBlockId).title,b.custom_name);assert.equal(s.blocks.find(x=>x.id===aBlockId).before_program_item_id,a.id);assert.equal(s.lines.find(x=>x.id===lineId).text,'自动段落中保留的内容');assert.equal(s.lines.find(x=>x.id===lineId).version,1);
 block=s.blocks.find(x=>x.id===aBlockId);
 await request(base+'/script/operations',{type:'block.update',operation_id:randomUUID(),id:block.id,expectedVersion:block.version,title:block.title,before_program_item_id:null,at_end:false,at_start:true,opening:true,position:block.position,estimated_seconds:0},'POST',422);
 await request(base+'/script/operations',{type:'block.delete',operation_id:randomUUID(),id:block.id,expectedVersion:block.version,documentVersion:s.document.structure_version},'POST',422);
 const invalid={type:'block.add',operation_id:randomUUID(),id:randomUUID(),expectedVersion:s.document.structure_version,title:'无效开场位置',before_program_item_id:a.id,at_start:true,at_end:false,opening:true};await request(base+'/script/operations',invalid,'POST',422);
 const text=await request(base+'/script/export');assert.ok(text.indexOf('【贺年祭开始】')<text.indexOf('【节目改名 B】'));assert.ok(text.indexOf('【节目改名 B】')<text.indexOf('【自动段落 A】'));
 // A stale program change must not leave an extra automatically created block.
 const staleId=randomUUID();await request(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version-1,starts_at:null,items:[...s.items.map(({id,revision_id,custom_name,custom_type,custom_duration,notes})=>({id,revision_id,custom_name,custom_type,custom_duration,notes})),{...a,id:staleId}]},'PUT',409);
 assert.ok(!(await request(base+'/script')).blocks.some(x=>x.before_program_item_id===staleId));
 await save(original);
 assert.ok(!s.blocks.some(x=>x.id===bBlockId),'empty automatic chapter archived');block=s.blocks.find(x=>x.id===aBlockId);assert.equal(block.before_program_item_id,null);assert.equal(block.at_start,0);assert.equal(block.auto_generated,0);assert.equal(block.title,a.custom_name);assert.ok(s.lines.some(x=>x.id===lineId),'removed program keeps written content');
 const orphanText=await request(base+'/script/export');assert.ok(orphanText.includes('待重新定位的段落'));assert.ok(orphanText.includes('自动段落中保留的内容'),'draft export must retain orphan dialogue');
 await request(base+'/script/operations',{type:'block.delete',operation_id:randomUUID(),id:block.id,expectedVersion:block.version,documentVersion:s.document.structure_version});
 s=await request(base+'/script');assert.ok(!s.lines.some(x=>x.id===lineId));assert.equal(s.blocks.filter(x=>x.at_start&&x.auto_generated).length,1);
}
