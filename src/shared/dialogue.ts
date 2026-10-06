import {lineKind,type DialogueSegment,type Line} from './models';

export function dialogueSegments(line:Pick<Line,'text'|'speaker_id'|'segments'>):DialogueSegment[]{
 return line.segments??[{text:line.text,speaker_ids:line.speaker_id?[line.speaker_id]:[]}];
}
export function dialogueSpeakers(line:Pick<Line,'text'|'speaker_id'|'segments'>){return [...new Set(dialogueSegments(line).flatMap(part=>part.speaker_ids))];}
export function missingDialogueSpeakers(line:Pick<Line,'kind'|'text'|'speaker_id'|'segments'>):number[]{
 if(lineKind(line)!=='dialogue')return [];
 return dialogueSegments(line).flatMap((part,index)=>part.text.trim()&&!part.speaker_ids.length?[index]:[]);
}
export function splitSegments(parts:DialogueSegment[],offset:number):[DialogueSegment[],DialogueSegment[]]{
 const left:DialogueSegment[]=[],right:DialogueSegment[]=[];let cursor=0;
 for(const part of parts){const boundary=Math.max(0,Math.min(part.text.length,offset-cursor));if(boundary>0)left.push({...part,text:part.text.slice(0,boundary)});if(boundary<part.text.length)right.push({...part,text:part.text.slice(boundary)});cursor+=part.text.length;}
 return [left,right];
}
