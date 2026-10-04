import type {Line} from '../../shared/models';
const lineKind=(line:Pick<Line,'kind'|'speaker_id'>)=>line.speaker_id==='aux-narrator'?'comment':line.kind??'dialogue';

export type LineFields=Pick<Line,'speaker_id'|'text'|'direction'> & {kind?:Line['kind'];segments?:Line['segments']};
export const lineFields=(line:LineFields):LineFields=>({kind:lineKind(line),speaker_id:lineKind(line)==='dialogue'&&!line.segments?line.speaker_id:null,text:lineKind(line)==='dialogue'&&line.segments?line.segments.map(part=>part.text).join(''):line.text,direction:line.direction,...(lineKind(line)==='dialogue'&&line.segments?{segments:line.segments}:{} )});
export const sameFields=(a:LineFields,b:LineFields)=>JSON.stringify(lineFields(a))===JSON.stringify(lineFields(b));

// A conservative three-way merge: only combine independent changes, never choose a winner for overlap.
function mergeText(base:string,local:string,remote:string):string|null{
 const original=Array.from(base);
 const change=(value:string)=>{const chars=Array.from(value);let start=0,end=original.length,last=chars.length;while(start<end&&start<last&&original[start]===chars[start])start++;while(end>start&&last>start&&original[end-1]===chars[last-1]){end--;last--;}return {start,end,insert:chars.slice(start,last)};};
 const a=change(local),b=change(remote);
 const before=(x:typeof a,y:typeof a)=>x.end<y.start||(x.end===y.start&&x.start!==x.end&&y.start!==y.end);
 if(!before(a,b)&&!before(b,a))return null;
 for(const c of [a,b].sort((x,y)=>y.start-x.start))original.splice(c.start,c.end-c.start,...c.insert);
 return original.join('');
}
export function reconcileLine(base:LineFields|undefined,local:LineFields,remote:LineFields){
 base=base?lineFields(base):undefined;local=lineFields(local);remote=lineFields(remote);
 const value=lineFields(local),conflicts:(keyof LineFields)[]=[];
 if(base?.segments||local.segments||remote.segments){
  const body=(fields:LineFields)=>JSON.stringify({...lineFields(fields),direction:''});
  const ours=body(local),theirs=body(remote),was=base&&body(base);
  let chosen=local;
  if(ours!==theirs&&(!base||theirs!==was)){if(base&&ours===was)chosen=remote;else conflicts.push('segments');}
  const result=lineFields(chosen);
  if(local.direction!==remote.direction){if(base&&local.direction===base.direction)result.direction=remote.direction;else if(!base||remote.direction!==base.direction)conflicts.push('direction');}
  result.direction=conflicts.includes('direction')?local.direction:result.direction;
  if(chosen===remote&&base&&remote.direction===base.direction)result.direction=local.direction;
  return {value:result,conflicts};
 }
 for(const field of ['text','direction','speaker_id','kind'] as const){
  const ours=local[field],theirs=remote[field],was=base?.[field];
  if(ours===theirs||base&&theirs===was)continue;
  if(base&&ours===was){if(field==='speaker_id')value.speaker_id=remote.speaker_id;else if(field==='kind')value.kind=remote.kind;else value[field]=remote[field];continue;}
  if(base&&field==='text'){const merged=mergeText(base.text,local.text,remote.text);if(merged!==null){value.text=merged;continue;}}
  conflicts.push(field);
 }
 if(value.kind!=='dialogue'&&value.speaker_id){if(!conflicts.includes('kind'))conflicts.push('kind');if(!conflicts.includes('speaker_id'))conflicts.push('speaker_id');}
 return {value,conflicts};
}
