export function localTime(iso:string,timeZone:string){
 if(!iso)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const get=(type:string)=>parts.find(p=>p.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
export function utcTime(local:string,timeZone:string){
 if(!local)return '';const wall=Date.parse(local+'Z');let candidate=wall;
 for(let i=0;i<4;i++){const at=localTime(new Date(candidate).toISOString(),timeZone);const delta=wall-Date.parse(at+'Z');if(delta===0)return new Date(candidate).toISOString();candidate+=delta;}
 throw new Error('此时间在活动时区内无效，请重新选择');
}
