import { z } from 'zod';
import {requireModule,moduleGuard} from './module-access';
import type {ModuleId} from '../../shared/modules';
import { lineKind, characterOperation, scriptOperation, programInput, type Snapshot, type Program, type ScriptDocument, type Line, type Block, type Character, type CharacterList, type ProgramItem, type User, type ScriptOperation, type CharacterOperation, type ProgramInput } from '../../shared/models';
import { actor, all, AppError, atomic, audit, cleanup, first, guard, id, now, operationResult, parse, previous, sql } from './core';
import {dialogueSegments,missingDialogueSpeakers,splitSegments} from '../../shared/dialogue';
import {hydrateLine,lineProjection,replaceSegments,validateDialogue} from './dialogue';
import {automaticBlocks} from './script-blocks';

export async function context(env:Env,eventId:string){
 const p=await first<Program>(env.DB,'SELECT * FROM programs WHERE event_id=?',eventId);if(!p)throw new AppError(404,'活动节目单不存在');
 const d=await first<ScriptDocument>(env.DB,'SELECT * FROM script_documents WHERE program_id=?',p.id);if(!d)throw new AppError(404,'主持稿不存在');return {p,d};
}
export async function snapshot(env:Env,eventId:string):Promise<Snapshot>{
 const {p}=await context(env,eventId);const r=await env.DB.batch<unknown>([
  sql(env.DB,'SELECT * FROM programs WHERE id=?',p.id),
  sql(env.DB,"SELECT pi.*,COALESCE(r.title,pi.custom_name) AS title,COALESCE(CASE WHEN r.type='其他' AND r.type_other<>'' THEN '其他：'||r.type_other ELSE r.type END,pi.custom_type) AS type,COALESCE(r.duration_seconds,pi.custom_duration) AS duration_seconds FROM program_items pi LEFT JOIN submission_revisions r ON r.id=pi.revision_id WHERE pi.program_id=? ORDER BY pi.position",p.id),
  sql(env.DB,'SELECT * FROM script_documents WHERE program_id=?',p.id),
  sql(env.DB,"SELECT b.id,b.document_id,CASE WHEN b.auto_generated=1 AND b.before_program_item_id IS NOT NULL THEN COALESCE(r.title,pi.custom_name,b.title) ELSE b.title END AS title,b.scene,b.before_program_item_id,b.at_end,b.at_start,b.auto_generated,b.opening,b.anchor_label,b.position,b.estimated_seconds,b.version,b.deleted_at FROM script_blocks b JOIN script_documents d ON d.id=b.document_id LEFT JOIN program_items pi ON pi.id=b.before_program_item_id LEFT JOIN submission_revisions r ON r.id=pi.revision_id WHERE d.program_id=? AND b.deleted_at IS NULL ORDER BY b.position",p.id),
  sql(env.DB,'SELECT '+lineProjection+' FROM script_lines l JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE d.program_id=? AND l.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY l.position',p.id),
  sql(env.DB,"SELECT c.id,c.stable_key,c.event_id,c.kind,c.name,c.japanese_name,COALESCE(o.color,c.color) AS color,c.archived,c.version,COALESCE(o.display_name,c.name) AS display_name,COALESCE(o.hidden,0) AS hidden,COALESCE(o.favorite,0) AS favorite,COALESCE(o.version,0) AS override_version,(SELECT json_group_array(alias) FROM character_aliases WHERE character_id=c.id) AS aliases_json,(SELECT json_group_array(json_object('url',url,'verification',verification)) FROM character_sources WHERE character_id=c.id) AS sources_json FROM characters c LEFT JOIN event_character_overrides o ON o.character_id=c.id AND o.event_id=? WHERE c.event_id IS NULL OR c.event_id=? ORDER BY c.kind,c.name",eventId,eventId),
  sql(env.DB,'SELECT * FROM character_lists WHERE event_id=? ORDER BY position',eventId),
  sql(env.DB,'SELECT m.* FROM character_list_members m JOIN character_lists l ON l.id=m.list_id WHERE l.event_id=? ORDER BY m.position',eventId)
 ]);
 const program=r[0].results[0] as Program;
 const chars=r[5].results as (Character & {aliases_json:string;sources_json:string})[];
 const lists=r[6].results as CharacterList[];const members=r[7].results as {list_id:string;character_id:string}[];
 return {program,items:r[1].results as ProgramItem[],document:r[2].results[0] as ScriptDocument,blocks:r[3].results as Block[],lines:(r[4].results as Line[]).map(hydrateLine),characters:chars.map(({aliases_json,sources_json,...c})=>({...c,aliases:JSON.parse(aliases_json),sources:JSON.parse(sources_json)})),lists:lists.map(l=>({...l,members:members.filter(m=>m.list_id===l.id).map(m=>m.character_id)})),seq:program.change_seq};
}
interface Result {type:string;seq:number;ids?:string[];count?:number;version?:number;id?:string;line?:Line;structure_version?:number;locked?:number}
function common(env:Env,user:User,sessionHash:string,p:Program,key:string,module:ModuleId){return [
 guard(env.DB,key,'EXISTS(SELECT 1 FROM programs WHERE id=? AND change_seq=?)',p.id,p.change_seq),
 moduleGuard(env.DB,key+'-auth',user,sessionHash,module),
 ];}
function end(env:Env,user:User,p:Program,key:string,operationId:string,hash:string,result:Result,before:unknown=null,documentId?:string){
 return [sql(env.DB,'UPDATE programs SET change_seq=change_seq+1 WHERE id=?',p.id),
 sql(env.DB,'INSERT INTO program_changes VALUES(?,?,?,?,?,?,?)',p.id,result.seq,user.id,operationId,result.type,JSON.stringify(result),now()),
 ...(documentId?[sql(env.DB,'INSERT INTO script_history VALUES(?,?,?,?,?,?,?,?)',id(),documentId,result.id??documentId,result.type,user.id,JSON.stringify(before),JSON.stringify(result),now())]:[]),
 audit(env.DB,user,'program',p.id,result.type,{seq:result.seq}),operationResult(env.DB,user,'room:'+p.event_id,operationId,hash,result),cleanup(env.DB,key),cleanup(env.DB,key+'-auth')];
}
export async function scriptMutation(env:Env,sessionHash:string,eventId:string,input:unknown){
 const user=await actor(env,sessionHash,true);requireModule(user,'script');const op=parse(scriptOperation,input),{p,d}=await context(env,eventId);
 const old=await previous<Result>(env.DB,user,'room:'+eventId,op.operation_id,op);if(old.result)return old.result;
 const key=id(),statements=common(env,user,sessionHash,p,key,'script');const result:Result={type:op.type,seq:p.change_seq+1};let before:unknown=null;
 if(d.locked && op.type!=='script.lock')throw new AppError(409,'主持稿已定稿，请先显式解锁');
 if(op.type.startsWith('line.')){
  if(op.type==='line.add'){
   const kind=op.kind??'dialogue';await validateDialogue(env.DB,eventId,kind,op.speaker_id,op.text,op.segments);
   const b=await first<Block>(env.DB,'SELECT * FROM script_blocks WHERE id=? AND document_id=? AND deleted_at IS NULL',op.block_id,d.id);if(!b)throw new AppError(404,'段落不存在');
   statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_blocks WHERE id=? AND version=? AND deleted_at IS NULL)',b.id,op.expectedVersion));
   const after=op.after_id?await first<Line>(env.DB,'SELECT * FROM script_lines WHERE id=? AND block_id=? AND deleted_at IS NULL',op.after_id,b.id):null;
   if(op.after_id&&!after)throw new AppError(409,'上一句已移除，请核对台词位置');
   const pos=after?after.position+1:(await first<{n:number}>(env.DB,'SELECT COALESCE(MAX(position),-1)+1 AS n FROM script_lines WHERE block_id=? AND deleted_at IS NULL',b.id))?.n??0;
   if(after)statements.push(sql(env.DB,'UPDATE script_lines SET position=position+1 WHERE block_id=? AND deleted_at IS NULL AND position>=?',b.id,pos));
   const l:Line={id:op.id,block_id:b.id,kind,...(op.segments?{segments:op.segments}:{}),speaker_id:op.speaker_id,text:op.text,direction:op.direction,position:pos,version:1,updated_by:user.id,updated_at:now(),deleted_at:null};
   statements.push(sql(env.DB,'INSERT INTO script_lines(id,block_id,speaker_id,text,direction,position,version,updated_by,updated_at,deleted_at,kind,delivery_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',l.id,l.block_id,l.speaker_id,op.segments?'':l.text,l.direction,l.position,l.version,l.updated_by,l.updated_at,null,kind,op.segments?'segments':'single'),...replaceSegments(env.DB,l.id,op.segments),sql(env.DB,'UPDATE script_blocks SET version=version+1 WHERE id=?',b.id));result.line=l;result.version=b.version+1;result.id=l.id;
  }else if(op.type==='line.delete-many'){
   const rows=(await all<Line>(env.DB,'SELECT '+lineProjection+' FROM script_lines l JOIN script_blocks b ON b.id=l.block_id WHERE b.document_id=? AND b.deleted_at IS NULL AND l.deleted_at IS NULL',d.id)).map(hydrateLine);
   const selected=op.items.map(item=>{const line=rows.find(l=>l.id===item.id);if(!line)throw new AppError(404,'部分台词不存在，请刷新后重新选择');if(line.version!==item.expectedVersion)throw new AppError(409,'选中的台词已被修改，请刷新后重新确认');return line;});
   if(new TextEncoder().encode(JSON.stringify(selected)).byteLength>1_000_000)throw new AppError(422,'选中条目的内容较多，请减少选择并分批删除');
   const payload=JSON.stringify(op.items),time=now();
   statements.push(guard(env.DB,key+'-entity',"(SELECT COUNT(*) FROM json_each(?) j JOIN script_lines l ON l.id=json_extract(j.value,'$.id') JOIN script_blocks b ON b.id=l.block_id WHERE b.document_id=? AND b.deleted_at IS NULL AND l.deleted_at IS NULL AND l.version=json_extract(j.value,'$.expectedVersion') AND b.version=json_extract(j.value,'$.blockVersion'))=?",payload,d.id,op.items.length),
    sql(env.DB,"UPDATE script_lines SET deleted_at=?,version=version+1,updated_by=?,updated_at=? WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?))",time,user.id,time,payload),
    sql(env.DB,"UPDATE script_blocks SET version=version+1 WHERE id IN(SELECT DISTINCT block_id FROM script_lines WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?)))",payload));
   before=selected;result.ids=selected.map(l=>l.id);result.count=selected.length;
  }else if(op.type==='line.update' || op.type==='line.delete'){
   const rawLine=await first<Line>(env.DB,'SELECT '+lineProjection+' FROM script_lines l JOIN script_blocks b ON b.id=l.block_id WHERE l.id=? AND b.document_id=? AND l.deleted_at IS NULL AND b.deleted_at IS NULL',op.id,d.id);if(!rawLine)throw new AppError(404,'台词不存在');const l=hydrateLine(rawLine);
   if(l.version!==op.expectedVersion)throw new AppError(409,'这句台词已在另一个窗口修改，请合并', {line:l});before=l;
   statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_lines WHERE id=? AND version=? AND deleted_at IS NULL)',l.id,op.expectedVersion));
   if(op.type==='line.update'){
    if(l.segments&&op.segments===undefined)throw new AppError(422,'请刷新编辑器后编辑多人台词');
    const kind=op.kind??lineKind(l);await validateDialogue(env.DB,eventId,kind,op.speaker_id,op.text,op.segments,l);
    const changed={...l,kind,segments:op.segments??undefined,speaker_id:op.speaker_id,text:op.text,direction:op.direction,version:l.version+1,updated_by:user.id,updated_at:now()};
    statements.push(sql(env.DB,'UPDATE script_lines SET speaker_id=?,text=?,direction=?,kind=?,delivery_mode=?,version=version+1,updated_by=?,updated_at=? WHERE id=?',op.speaker_id,op.segments?'':op.text,op.direction,kind,op.segments?'segments':'single',user.id,changed.updated_at,l.id),...replaceSegments(env.DB,l.id,op.segments));result.line=changed;result.version=changed.version;
   }else{
    statements.push(guard(env.DB,key+'-block','EXISTS(SELECT 1 FROM script_blocks WHERE id=? AND version=?)',l.block_id,op.blockVersion),sql(env.DB,'UPDATE script_lines SET deleted_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=?',now(),user.id,now(),l.id),sql(env.DB,'UPDATE script_blocks SET version=version+1 WHERE id=?',l.block_id),cleanup(env.DB,key+'-block'));result.version=l.version+1;
   }result.id=l.id;
  }else if(op.type==='line.split'||op.type==='line.merge'){
   const lines=(await all<Line>(env.DB,'SELECT '+lineProjection+' FROM script_lines l JOIN script_blocks b ON b.id=l.block_id WHERE b.document_id=? AND b.deleted_at IS NULL AND l.deleted_at IS NULL ORDER BY l.position',d.id)).map(hydrateLine);
   const l=lines.find(x=>x.id===op.id);if(!l)throw new AppError(404,'台词不存在');
   const siblings=lines.filter(x=>x.block_id===l.block_id),index=siblings.findIndex(x=>x.id===l.id);
   if(l.version!==op.expectedVersion)throw new AppError(409,'台词已改变，请重新检查',{line:l});
   statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_lines WHERE id=? AND version=? AND deleted_at IS NULL)',l.id,op.expectedVersion),guard(env.DB,key+'-block','EXISTS(SELECT 1 FROM script_blocks WHERE id=? AND version=?)',l.block_id,op.blockVersion));
   if(op.type==='line.split'){
    if(op.offset>=l.text.length||(l.text.charCodeAt(op.offset-1)>=0xD800&&l.text.charCodeAt(op.offset-1)<=0xDBFF&&l.text.charCodeAt(op.offset)>=0xDC00&&l.text.charCodeAt(op.offset)<=0xDFFF))throw new AppError(422,'请选择台词中间的拆分位置');
    const [left,right]=splitSegments(dialogueSegments(l),op.offset);
    statements.push(sql(env.DB,'UPDATE script_lines SET text=?,version=version+1,updated_by=?,updated_at=? WHERE id=?',l.segments?'':l.text.slice(0,op.offset),user.id,now(),l.id),...replaceSegments(env.DB,l.id,l.segments?left:undefined));
    siblings.slice(index+1).forEach(x=>statements.push(sql(env.DB,'UPDATE script_lines SET position=position+1 WHERE id=?',x.id)));
    statements.push(sql(env.DB,'INSERT INTO script_lines(id,block_id,speaker_id,text,direction,position,version,updated_by,updated_at,deleted_at,kind,delivery_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',op.new_id,l.block_id,l.speaker_id,l.segments?'':l.text.slice(op.offset),l.direction,l.position+1,1,user.id,now(),null,lineKind(l),l.segments?'segments':'single'),...replaceSegments(env.DB,op.new_id,l.segments?right:undefined));
   }else{
    const next=siblings[index+1];if(!next||next.id!==op.next_id||next.version!==op.nextVersion||lineKind(next)!==lineKind(l))throw new AppError(409,'只能合并相邻且类型相同的条目');
    if(l.text.length+next.text.length+1>5000)throw new AppError(422,'合并后的台词超过 5000 字');
    const segmented=lineKind(l)==='dialogue'&&(!!l.segments||!!next.segments||l.speaker_id!==next.speaker_id);
    const parts=segmented?[...dialogueSegments(l).map((part,i,all)=>i===all.length-1?{...part,text:part.text+'\n'}:part),...dialogueSegments(next)]:undefined;
    if(parts&&parts.length>50)throw new AppError(422,'合并后的台词超过 50 个片段');
    statements.push(guard(env.DB,key+'-next','EXISTS(SELECT 1 FROM script_lines WHERE id=? AND version=? AND deleted_at IS NULL)',next.id,next.version),sql(env.DB,'UPDATE script_lines SET speaker_id=?,text=?,delivery_mode=?,direction=?,version=version+1,updated_by=?,updated_at=? WHERE id=?',segmented?null:l.speaker_id,segmented?'':l.text+'\n'+next.text,segmented?'segments':'single',[l.direction,next.direction].filter(Boolean).join('；').slice(0,500),user.id,now(),l.id),...replaceSegments(env.DB,l.id,parts),sql(env.DB,'UPDATE script_lines SET deleted_at=?,version=version+1 WHERE id=?',now(),next.id),cleanup(env.DB,key+'-next'));
   }
   statements.push(sql(env.DB,'UPDATE script_blocks SET version=version+1 WHERE id=?',l.block_id),cleanup(env.DB,key+'-block'));before=l;result.id=l.id;result.version=l.version+1;
  }else if(op.type==='line.reorder'){
   const lines=await all<Line>(env.DB,'SELECT '+lineProjection+' FROM script_lines l JOIN script_blocks b ON b.id=l.block_id WHERE b.id=? AND b.document_id=? AND b.deleted_at IS NULL AND l.deleted_at IS NULL',op.block_id,d.id);
   if(op.ids.length!==lines.length || new Set(op.ids).size!==lines.length || op.ids.some(x=>!lines.some(l=>l.id===x)))throw new AppError(409,'台词结构已改变');
   statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_blocks WHERE id=? AND document_id=? AND version=?)',op.block_id,d.id,op.expectedVersion));op.ids.forEach((lid,i)=>statements.push(sql(env.DB,'UPDATE script_lines SET position=? WHERE id=?',i,lid)));
   statements.push(sql(env.DB,'UPDATE script_blocks SET version=version+1 WHERE id=?',op.block_id));result.id=op.block_id;result.version=op.expectedVersion+1;before=lines;
  }
 }else if(op.type==='block.add'){
  statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_documents WHERE id=? AND structure_version=?)',d.id,op.expectedVersion));
  if(op.at_start&&(op.at_end||op.before_program_item_id))throw new AppError(422,'开场段落必须位于节目之前');
  if(!op.at_end && !op.at_start && !op.before_program_item_id)throw new AppError(422,'请指定段落位置');
  const item=op.before_program_item_id?await first<{title:string}>(env.DB,'SELECT COALESCE(r.title,pi.custom_name) AS title FROM program_items pi LEFT JOIN submission_revisions r ON r.id=pi.revision_id WHERE pi.id=? AND pi.program_id=?',op.before_program_item_id,p.id):null;
  if(op.before_program_item_id && !item)throw new AppError(422,'位置不属于本节目单');
  const pos=(await first<{n:number}>(env.DB,'SELECT COALESCE(MAX(position),-1)+1 AS n FROM script_blocks WHERE document_id=?',d.id))?.n??0;
  statements.push(sql(env.DB,'INSERT INTO script_blocks(id,document_id,title,before_program_item_id,at_end,at_start,opening,anchor_label,position) VALUES(?,?,?,?,?,?,?,?,?)',op.id,d.id,op.title,op.before_program_item_id,Number(op.at_end),Number(!!op.at_start),Number(op.opening),item?.title??(op.at_start?'贺年祭开始':'节目之后'),pos),sql(env.DB,'UPDATE script_documents SET structure_version=structure_version+1 WHERE id=?',d.id));result.id=op.id;result.structure_version=d.structure_version+1;
 }else if(op.type==='block.update' || op.type==='block.delete'){
  const b=await first<Block>(env.DB,'SELECT * FROM script_blocks WHERE id=? AND document_id=? AND deleted_at IS NULL',op.id,d.id);if(!b)throw new AppError(404,'段落不存在');before=b;
  statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_blocks WHERE id=? AND version=? AND deleted_at IS NULL)',b.id,op.expectedVersion));
  if(op.type==='block.update'){
   if(op.at_start&&(op.at_end||op.before_program_item_id))throw new AppError(422,'开场段落必须位于节目之前');
   if(!op.at_end && !op.at_start && !op.before_program_item_id)throw new AppError(422,'请重新定位段落');
   if(b.auto_generated&&(op.before_program_item_id!==b.before_program_item_id||op.at_end!==!!b.at_end||!!op.at_start!==!!b.at_start||op.opening!==!!b.opening))throw new AppError(422,'自动段落的位置由节目编排管理');
   const target=op.before_program_item_id?await first<{title:string}>(env.DB,'SELECT COALESCE(r.title,pi.custom_name) AS title FROM program_items pi LEFT JOIN submission_revisions r ON r.id=pi.revision_id WHERE pi.id=? AND pi.program_id=?',op.before_program_item_id,p.id):null;
   if(op.before_program_item_id&&!target)throw new AppError(422,'位置不属于本节目单');
   statements.push(sql(env.DB,'UPDATE script_blocks SET title=?,before_program_item_id=?,at_end=?,at_start=?,position=?,estimated_seconds=?,opening=?,anchor_label=?,scene=?,version=version+1 WHERE id=?',b.auto_generated?b.title:op.title,op.before_program_item_id,Number(op.at_end),Number(!!op.at_start),b.auto_generated?b.position:op.position,op.estimated_seconds,Number(op.opening),target?.title??(op.at_start?'贺年祭开始':'节目之后'),op.scene??b.scene??'',b.id));
  }else{
   if(b.auto_generated)throw new AppError(422,b.at_start?'开场段落不可删除':'请在节目编排中移除节目，自动段落会随之更新');
   statements.push(guard(env.DB,key+'-doc','EXISTS(SELECT 1 FROM script_documents WHERE id=? AND structure_version=?)',d.id,op.documentVersion),sql(env.DB,'UPDATE script_blocks SET deleted_at=?,version=version+1 WHERE id=?',now(),b.id),cleanup(env.DB,key+'-doc'));
  }statements.push(sql(env.DB,'UPDATE script_documents SET structure_version=structure_version+1 WHERE id=?',d.id));result.id=b.id;result.version=b.version+1;result.structure_version=d.structure_version+1;
 }else if(op.type==='script.lock'){
  if(!op.locked && !op.reason.trim())throw new AppError(422,'解锁需要填写原因');
  statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM script_documents WHERE id=? AND structure_version=? AND locked=?)',d.id,op.expectedVersion,op.locked?0:1));
  if(op.expectedSeq!==p.change_seq || op.programVersion!==p.version)throw new AppError(409,'节目单或主持稿已更新，请重新核对');
  if(op.locked){
   if(!p.locked)throw new AppError(422,'请先锁定节目编排');
   const snap=await snapshot(env,eventId);if(snap.blocks.some(b=>!b.at_end && !b.at_start && !b.before_program_item_id))throw new AppError(422,'存在待重新定位的段落');
   if(snap.lines.some(l=>missingDialogueSpeakers(l).length))throw new AppError(422,'角色为必填项，请为每个非空台词片段指定发言角色');
   const frozen={...snap,seq:result.seq,document:{...d,locked:1,finalized_program_version:p.version,finalized_seq:result.seq}};
   statements.push(sql(env.DB,'INSERT INTO export_snapshots VALUES(?,?,?,?,?,?,?)',id(),p.id,p.version,result.seq,user.id,JSON.stringify(frozen),now()));
  }
  statements.push(sql(env.DB,'UPDATE script_documents SET locked=?,structure_version=structure_version+1,finalized_program_version=?,finalized_seq=? WHERE id=?',Number(op.locked),op.locked?p.version:null,op.locked?result.seq:null,d.id));result.locked=Number(op.locked);result.structure_version=d.structure_version+1;
  if(!op.locked)statements.push(...automaticBlocks(env.DB,d.id));
 }
 statements.push(cleanup(env.DB,key+'-entity'),...end(env,user,p,key,op.operation_id,old.hash,result,before,d.id));await atomic(env.DB,statements);return result;
}
export async function programMutation(env:Env,sessionHash:string,eventId:string,input:unknown,lock=false){
 const user=await actor(env,sessionHash,true);requireModule(user,'program');const op=lock?parse(z.object({operation_id:z.string(),expectedVersion:z.number().int(),locked:z.boolean(),reason:z.string().max(1000)}).strict(),input):parse(programInput,input);
 const {p,d}=await context(env,eventId),old=await previous<Result>(env.DB,user,'room:'+eventId,op.operation_id,op);if(old.result)return old.result;
 const key=id(),statements=common(env,user,sessionHash,p,key,'program'),result:Result={type:lock?'program.lock':'program.save',seq:p.change_seq+1,version:p.version+1};
 statements.push(guard(env.DB,key+'-program','EXISTS(SELECT 1 FROM programs WHERE id=? AND version=?)',p.id,op.expectedVersion));
 const snap=await snapshot(env,eventId);
 if('locked' in op){
  if(!op.locked && !op.reason.trim())throw new AppError(422,'解锁需要填写原因');
  statements.push(sql(env.DB,'UPDATE programs SET locked=?,version=version+1 WHERE id=?',Number(op.locked),p.id));result.locked=Number(op.locked);
  if(!op.locked)statements.push(sql(env.DB,'UPDATE script_documents SET finalized_program_version=NULL,finalized_seq=NULL WHERE id=?',d.id));
 }else{
  if(op.items.some(x=>!x.revision_id&&/^其他[：:]?$/.test(x.custom_type??'')))throw new AppError(422,'请说明临时节目的具体类型');
  if(p.locked || d.locked)throw new AppError(409,'编排或主持稿已锁定，请先显式解锁');
  if(new Set(op.items.map(x=>x.id)).size!==op.items.length || new Set(op.items.filter(x=>x.revision_id).map(x=>x.revision_id)).size!==op.items.filter(x=>x.revision_id).length)throw new AppError(422,'节目不能重复');
  for(const oldItem of snap.items)if(!op.items.some(x=>x.id===oldItem.id)){
   const label=oldItem.title??oldItem.custom_name??'';
   statements.push(sql(env.DB,"UPDATE script_blocks SET deleted_at=? WHERE document_id=? AND before_program_item_id=? AND auto_generated=1 AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM script_lines l WHERE l.block_id=script_blocks.id AND l.deleted_at IS NULL)",now(),d.id,oldItem.id),sql(env.DB,'UPDATE script_blocks SET before_program_item_id=NULL,title=CASE WHEN auto_generated=1 THEN ? ELSE title END,anchor_label=?,auto_generated=0,version=version+1 WHERE document_id=? AND before_program_item_id=?',label,label,d.id,oldItem.id),sql(env.DB,'DELETE FROM program_items WHERE id=?',oldItem.id));
  }
  op.items.forEach((item,i)=>{
   const existing=snap.items.find(x=>x.id===item.id);if(existing && existing.revision_id!==item.revision_id)throw new AppError(422,'节目引用不能被替换，请移除后重新添加');
   if(existing)statements.push(sql(env.DB,'UPDATE program_items SET position=?,notes=?,custom_name=?,custom_type=?,custom_duration=? WHERE id=?',i,item.notes,item.custom_name,item.custom_type,item.custom_duration,item.id));
   else statements.push(sql(env.DB,'INSERT INTO program_items VALUES(?,?,?,?,?,?,?,?)',item.id,p.id,i,item.revision_id,item.custom_name,item.custom_type,item.custom_duration,item.notes));
  });
  statements.push(...automaticBlocks(env.DB,d.id),sql(env.DB,'UPDATE programs SET version=version+1,starts_at=? WHERE id=?',op.starts_at,p.id),sql(env.DB,'UPDATE script_documents SET structure_version=structure_version+1 WHERE id=?',d.id));
 }
 const after='locked'in op?op:op.items;
 statements.push(sql(env.DB,'INSERT INTO program_history VALUES(?,?,?,?,?,?,?,?)',id(),p.id,p.version+1,user.id,result.type,'reason'in op?op.reason:'',JSON.stringify({before:snap.items,after}),now()),cleanup(env.DB,key+'-program'),...end(env,user,p,key,op.operation_id,old.hash,result));await atomic(env.DB,statements);return result;
}
export async function characterMutation(env:Env,sessionHash:string,eventId:string,input:unknown){
 const user=await actor(env,sessionHash,true);requireModule(user,'characters');const op=parse(characterOperation,input),{p}=await context(env,eventId),old=await previous<Result>(env.DB,user,'room:'+eventId,op.operation_id,op);if(old.result)return old.result;
 const key=id(),statements=common(env,user,sessionHash,p,key,'characters'),result:Result={type:op.type,seq:p.change_seq+1,id:op.id};
 if(op.type==='character.add'){
  statements.push(sql(env.DB,"INSERT INTO characters(id,stable_key,event_id,kind,name,color) VALUES(?,?,?,'custom',?,?)",op.id,'custom:'+op.id,eventId,op.name,op.color));
  if(op.list_id){statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM character_lists WHERE id=? AND event_id=? AND archived=0)',op.list_id,eventId),sql(env.DB,'INSERT INTO character_list_members SELECT ?,?,COALESCE(MAX(position),-1)+1 FROM character_list_members WHERE list_id=?',op.list_id,op.id,op.list_id),sql(env.DB,'UPDATE character_lists SET version=version+1 WHERE id=?',op.list_id));}
  result.version=1;
 }else if(op.type==='character.update'){
  if(op.id==='aux-narrator'&&!op.archived)throw new AppError(422,'旁白角色已取消，请使用注释条目');
  statements.push(guard(env.DB,key+'-entity',"EXISTS(SELECT 1 FROM characters WHERE id=? AND event_id=? AND kind='custom' AND version=?)",op.id,eventId,op.expectedVersion),sql(env.DB,'UPDATE characters SET name=?,color=?,archived=?,version=version+1 WHERE id=?',op.name,op.color,Number(op.archived),op.id));result.version=op.expectedVersion+1;
 }else if(op.type==='character.override'){
  statements.push(guard(env.DB,key+'-entity','EXISTS(SELECT 1 FROM characters WHERE id=? AND (event_id IS NULL OR event_id=?)) AND COALESCE((SELECT version FROM event_character_overrides WHERE event_id=? AND character_id=?),0)=?',op.id,eventId,eventId,op.id,op.expectedVersion),sql(env.DB,'INSERT INTO event_character_overrides(event_id,character_id,display_name,hidden,favorite,color,version) VALUES(?,?,?,?,?,?,1) ON CONFLICT(event_id,character_id) DO UPDATE SET display_name=excluded.display_name,hidden=excluded.hidden,favorite=excluded.favorite,color=COALESCE(excluded.color,event_character_overrides.color),version=event_character_overrides.version+1',eventId,op.id,op.display_name,Number(op.hidden),Number(op.favorite),op.color??null));result.version=op.expectedVersion+1;
 }else if(op.type==='list.add'){
  statements.push(sql(env.DB,'INSERT INTO character_lists(id,event_id,name,position) SELECT ?,?,?,COALESCE(MAX(position),-1)+1 FROM character_lists WHERE event_id=?',op.id,eventId,op.name,eventId));result.version=1;
 }else{
  if(new Set(op.members).size!==op.members.length)throw new AppError(422,'角色不能重复');
  statements.push(guard(env.DB,key+'-entity',`EXISTS(SELECT 1 FROM character_lists WHERE id=? AND event_id=? AND version=?) AND NOT EXISTS(
   SELECT 1 FROM json_each(?) chosen WHERE NOT EXISTS(
    SELECT 1 FROM characters c WHERE c.id=chosen.value AND (c.event_id IS NULL OR c.event_id=?) AND
    ((c.archived=0 AND c.id<>'aux-narrator') OR EXISTS(SELECT 1 FROM character_list_members m WHERE m.list_id=? AND m.character_id=c.id))
   ))`,op.id,eventId,op.expectedVersion,JSON.stringify(op.members),eventId,op.id),sql(env.DB,'UPDATE character_lists SET name=?,archived=?,position=?,version=version+1 WHERE id=?',op.name,Number(op.archived),op.position,op.id),sql(env.DB,'DELETE FROM character_list_members WHERE list_id=?',op.id));
  op.members.forEach((char,i)=>statements.push(sql(env.DB,'INSERT INTO character_list_members VALUES(?,?,?)',op.id,char,i)));result.version=op.expectedVersion+1;
 }
 statements.push(cleanup(env.DB,key+'-entity'),...end(env,user,p,key,op.operation_id,old.hash,result));await atomic(env.DB,statements);return result;
}
