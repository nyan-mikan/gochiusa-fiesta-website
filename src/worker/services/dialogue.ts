import {lineKind,type DialogueSegment,type Line,type LineKind} from '../../shared/models';
import {dialogueSegments} from '../../shared/dialogue';
import {all,AppError,id,sql} from './core';

export const lineProjection="l.*,(SELECT json_group_array(json_object('text',s.text,'speaker_ids',json((SELECT json_group_array(character_id) FROM (SELECT character_id FROM script_segment_speakers WHERE segment_id=s.id ORDER BY position))))) FROM (SELECT * FROM script_line_segments WHERE line_id=l.id ORDER BY position) s) AS segments_json";
export function hydrateLine(raw:Line & {delivery_mode?:string;segments_json?:string}):Line{
 const {delivery_mode,segments_json,...line}=raw;
 const kind=lineKind(line);
 if(delivery_mode==='segments'){
  const segments=JSON.parse(segments_json??'[]') as DialogueSegment[];
  return {...line,kind,speaker_id:null,text:segments.map(s=>s.text).join(''),segments};
 }
 return {...line,kind,speaker_id:kind==='dialogue'?line.speaker_id:null};
}
export async function validateDialogue(db:D1Database,eventId:string,kind:LineKind,speaker:string|null,text:string,segments:DialogueSegment[]|null|undefined,previous?:Line){
 if(speaker==='aux-narrator'||kind!=='dialogue'&&(speaker||segments))throw new AppError(422,'注释和小标题无需角色，旁白角色已取消');
 if(!segments)return;
 if(speaker||text!==segments.map(s=>s.text).join(''))throw new AppError(422,'分段台词的正文与角色格式不一致');
 const allowed=await all<{id:string;archived:number}>(db,'SELECT id,archived FROM characters WHERE id<>? AND (event_id IS NULL OR event_id=?)','aux-narrator',eventId);
 const previousIds=new Set(previous?dialogueSegments(previous).flatMap(s=>s.speaker_ids):[]);
 for(const part of segments)for(const characterId of part.speaker_ids){const c=allowed.find(c=>c.id===characterId);if(!c||c.archived&&!previousIds.has(c.id))throw new AppError(422,'发言角色不存在、已归档或不属于此活动');}
}
export function replaceSegments(db:D1Database,lineId:string,segments:DialogueSegment[]|null|undefined){
 const statements=[sql(db,'DELETE FROM script_line_segments WHERE line_id=?',lineId)];
 for(const [position,part] of (segments??[]).entries()){
  const segmentId=id();statements.push(sql(db,'INSERT INTO script_line_segments(id,line_id,position,text) VALUES(?,?,?,?)',segmentId,lineId,position,part.text));
  if(part.speaker_ids.length)statements.push(sql(db,'INSERT INTO script_segment_speakers(segment_id,character_id,position) VALUES '+part.speaker_ids.map(()=>'(?,?,?)').join(','),...part.speaker_ids.flatMap((speaker,index)=>[segmentId,speaker,index])));
 }
 return statements;
}
