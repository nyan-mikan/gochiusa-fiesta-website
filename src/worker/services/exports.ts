import {lineKind,type Snapshot} from '../../shared/models';
import {dialogueSegments,dialogueSpeakers} from '../../shared/dialogue';
import { AppError, first } from './core';
import { snapshot } from './room';
export async function scriptExport(env:Env,eventId:string,formal:boolean,speaker:string|null){
 let snap=await snapshot(env,eventId);
 if(formal){
  if(!snap.program.locked || !snap.document.locked || snap.document.finalized_program_version!==snap.program.version || !snap.document.finalized_seq)throw new AppError(409,'正式导出需要编排和主持稿均已锁定且版本匹配');
  const saved=await first<{content_json:string}>(env.DB,'SELECT content_json FROM export_snapshots WHERE program_id=? AND program_version=? AND script_seq=? ORDER BY created_at DESC LIMIT 1',snap.program.id,snap.program.version,snap.document.finalized_seq);
  if(!saved)throw new AppError(409,'定稿快照不存在');snap=JSON.parse(saved.content_json) as Snapshot;
 }
 const output=[formal?'点兔贺年祭 · 正式主持稿':'点兔贺年祭 · 草稿预览（未定稿）',`编排版本 ${snap.program.version} · 主持稿序号 ${snap.seq}`,''];
 const block=(anchor:string|null,placement:'program'|'start'|'end'|'orphan'='program')=>{
  for(const b of snap.blocks.filter(b=>placement==='orphan'?(!b.at_start&&!b.at_end&&!snap.items.some(i=>i.id===b.before_program_item_id)):placement==='end'?!!b.at_end:placement==='start'?!!b.at_start:b.before_program_item_id===anchor && !b.at_end&&!b.at_start).sort((a,b)=>a.position-b.position)){
   const lines=snap.lines.filter(l=>l.block_id===b.id && l.text.trim() && (!speaker || lineKind(l)!=='dialogue' || dialogueSpeakers(l).includes(speaker))).sort((a,b)=>a.position-b.position);if(speaker && !lines.some(l=>lineKind(l)==='dialogue'&&dialogueSpeakers(l).includes(speaker)))continue;
   output.push('【'+b.title+'】');for(const l of lines){const kind=lineKind(l);if(kind!=='dialogue'){output.push((kind==='heading'?'【小标题】':'〔注释〕')+l.text+(l.direction?'\n  （补充：'+l.direction+'）':''));continue;}const parts=dialogueSegments(l).filter(part=>!speaker||part.speaker_ids.includes(speaker));for(const part of parts){if(!part.text.trim())continue;const names=part.speaker_ids.map(id=>{const c=snap.characters.find(c=>c.id===id);return c?.display_name??c?.name??'未指定角色';});output.push((names.join('、')||'未指定角色')+(names.length>1?'（合说）':'')+'：'+part.text);}if(l.direction)output.push('  （演绎：'+l.direction+'）');}output.push('');
  }
 };
 block(null,'start');let elapsed=0;for(const item of snap.items){block(item.id);output.push(`—— ${item.position+1}. ${item.title} / ${item.type} / ${item.duration_seconds} 秒 / 累计 ${elapsed} 秒 ——`,'');elapsed+=item.duration_seconds??0;}block(null,'end');if(!formal&&snap.blocks.some(b=>!b.at_start&&!b.at_end&&!snap.items.some(i=>i.id===b.before_program_item_id))){output.push('—— 待重新定位的段落 ——','');block(null,'orphan');}return output.join('\n');
}
const csvCell=(value:unknown)=>{let s=String(value??'');if(/^(?:\s*[=+\-@]|[\t\r\n])/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export async function programExport(env:Env,eventId:string){const snap=await snapshot(env,eventId);let elapsed=0;return '\uFEFF'+[['顺序','节目名','类型','时长（秒）','累计开始（秒）','累计结束（秒）','编排备注'].map(csvCell).join(','),...snap.items.map((p,i)=>{const start=elapsed;elapsed+=p.duration_seconds??0;return [i+1,p.title,p.type,p.duration_seconds,start,elapsed,p.notes].map(csvCell).join(',');})].join('\r\n');}
