import type {Block,ScriptOperation} from '../../shared/models';
export interface BlockCreation {
 key:string;eventId:string;block:Block;flight:Extract<ScriptOperation,{type:'block.add'}>|null;
 state:'queued'|'creating'|'confirming'|'failed';error:string;ackSeq:number|null;
}
const database=new Promise<IDBDatabase>((resolve,reject)=>{
 const r=indexedDB.open('usagi-script-block-creations',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('creations',{keyPath:'key'});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
export async function blockDrafts(action:'read'|'put'|'delete',value?:BlockCreation|string):Promise<BlockCreation[]>{
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('creations',action==='read'?'readonly':'readwrite'),store=tx.objectStore('creations');
  const r=action==='read'?store.getAll():action==='put'?store.put(JSON.parse(JSON.stringify(value))):store.delete(value as string);
  tx.oncomplete=()=>resolve(action==='read'?r.result as BlockCreation[]:[]);tx.onerror=()=>reject(tx.error);
 });
}
