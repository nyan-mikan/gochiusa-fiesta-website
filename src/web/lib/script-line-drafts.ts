import type {Line,ScriptOperation} from '../../shared/models';
export interface LineCreation {
 client_id:string;key:string;eventId:string;line:Line;afterId:string|null;order:number;
 flight:Extract<ScriptOperation,{type:'line.add'}>|null;
 state:'queued'|'creating'|'failed';error:string;
}
const database=new Promise<IDBDatabase>((resolve,reject)=>{
 const r=indexedDB.open('usagi-script-line-creations',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('creations',{keyPath:'key'});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
export async function lineDrafts(action:'read'|'put'|'delete',value?:LineCreation|string):Promise<LineCreation[]>{
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('creations',action==='read'?'readonly':'readwrite'),store=tx.objectStore('creations');
  const r=action==='read'?store.getAll():action==='put'?store.put(JSON.parse(JSON.stringify(value))):store.delete(value as string);
  tx.oncomplete=()=>resolve(action==='read'?r.result as LineCreation[]:[]);tx.onerror=()=>reject(tx.error);
 });
}
