import {ref,computed,reactive} from 'vue';
import {lineDrafts,type LineCreation} from './script-line-drafts';
import {api,ApiError,session} from './api';
import {lineFields,sameFields,reconcileLine,type LineFields} from './script-reconcile';
import type {Snapshot,Line,Block,ScriptOperation} from '../../shared/models';
interface Flight {operation_id:string;type:'line.update';id:string;expectedVersion:number;speaker_id:string|null;segments?:Line['segments']|null;text:string;direction:string;revision:number;kind?:Line['kind']}
interface Pending {kind?:Line['kind'];segments?:Line['segments'];client_id?:string;key:string;id:string;version:number;base?:LineFields;speaker_id:string|null;text:string;direction:string;revision:number;flight:Flight|null;conflict:Line|null;error:string}
interface Ack {type:string;seq:number;line?:Line;structure_version?:number;version?:number}
const database=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('usagi-script-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function storage(action:'put'|'delete'|'read',value?:Pending|string){const db=await database;return new Promise<Pending[]>((resolve,reject)=>{const tx=db.transaction('pending',action==='read'?'readonly':'readwrite'),store=tx.objectStore('pending');const r=action==='read'?store.getAll():action==='put'?store.put(value):store.delete(value as string);tx.oncomplete=()=>resolve(action==='read'?r.result as Pending[]:[]);tx.onerror=()=>reject(tx.error);});}
const persist=(p:Pending)=>storage('put',JSON.parse(JSON.stringify(p)) as Pending);

export function scriptEditor(){
 const creating=ref<Record<string,LineCreation>>({});let creationOrder=0;
 const s=ref<Snapshot|null>(null),syncedSeq=ref(-1),pending=ref<Record<string,Pending>>({}),error=ref(''),state=ref('连接中'),saving=ref(false),composition=new Set<string>();
 const clientId=crypto.randomUUID();let releaseLease:()=>void=()=>{};
 const leaseReady=navigator.locks?new Promise<void>(ready=>{void navigator.locks.request('usagi-script-client:'+clientId,async()=>{ready();await new Promise<void>(resolve=>releaseLease=resolve);});}):Promise.resolve();
 let eventId='',prefix='',socket:WebSocket|null=null,poll:ReturnType<typeof setInterval>|null=null,timer:ReturnType<typeof setTimeout>|null=null,refreshing:Promise<boolean>|null=null,working:Promise<void>|null=null,firstEdit=0,generation=0,disposed=false,syncError='';
 const dirty=computed(()=>Object.keys(pending.value).length+Object.keys(creating.value).length),conflicts=computed(()=>Object.values(pending.value).filter(p=>p.conflict||p.error));
 async function refresh(force=false):Promise<boolean>{
  if(disposed)return false;
  if(refreshing){const fresh=await refreshing;if(force||!s.value||s.value.program.event_id!==eventId)return refresh();return fresh;}
  const current=eventId,gen=generation;
  refreshing=(async()=>{try{
   const next=await api<Snapshot>('/api/admin/events/'+current+'/script');if(gen!==generation)return false;
   // An earlier GET must not undo a newer acknowledged save.
   if(!s.value||next.seq>=s.value.seq){s.value=next;syncedSeq.value=next.seq;}
   for(const p of Object.values(pending.value))if(p.error||p.conflict)p.conflict=s.value?.lines.find(l=>l.id===p.id)??null;
   state.value=navigator.onLine?'已连接':'离线';if(error.value===syncError)error.value='';syncError='';return syncedSeq.value===s.value?.seq;
  }catch(e){state.value='连接中断';syncError=e instanceof ApiError?e.message:'读取服务器暂时失败，已保留本地内容，请重试同步。';error.value=syncError;return false;}})().finally(()=>refreshing=null);
  return refreshing;
 }
 function acknowledge(ack:Ack){
  if(!s.value)return;
  if(ack.line){const i=s.value.lines.findIndex(l=>l.id===ack.line!.id);if(i>=0&&s.value.lines[i]!.version<=ack.line.version)s.value.lines[i]=ack.line;
   else if(i<0&&ack.type==='line.add'){for(const l of s.value.lines)if(l.block_id===ack.line.block_id&&l.position>=ack.line.position)l.position++;s.value.lines.push(ack.line);}
   if(ack.type==='line.add'&&ack.version){const b=s.value.blocks.find(b=>b.id===ack.line!.block_id);if(b)b.version=Math.max(b.version,ack.version);}
  }
  if(ack.structure_version)s.value.document.structure_version=Math.max(s.value.document.structure_version,ack.structure_version);
  s.value.seq=Math.max(s.value.seq,ack.seq);
 }
 function stop(dispose=true){disposed=dispose;if(dispose)releaseLease();generation++;socket?.close();socket=null;if(poll)clearInterval(poll);poll=null;if(timer)clearTimeout(timer);timer=null;firstEdit=0;}
 async function open(id:string){
  if(working)await working;await leaseReady;stop(false);const currentGeneration=generation;eventId=id;prefix=session.user!.id+':'+id+':';s.value=null;syncedSeq.value=-1;pending.value={};creating.value={};error.value='';
  try{const rows=await storage('read');for(const row of rows){if(!row.key.startsWith(prefix))continue;
   const restore=async()=>{if(row.client_id!==clientId){const previousKey=row.key;row.client_id=clientId;row.key=prefix+clientId+':'+crypto.randomUUID();await storage('put',row);await storage('delete',previousKey);}if(pending.value[row.id]){row.error='同一句存在多份本地未确认稿，请手动合并。';pending.value[row.id]!.error=row.error;pending.value[row.key]=row;}else pending.value[row.id]=row;};
   if(row.client_id===clientId||!row.client_id)await restore();else if(navigator.locks)await navigator.locks.request('usagi-script-client:'+row.client_id,{ifAvailable:true},async lock=>{if(lock)await restore();});else error.value='浏览器不支持跨窗口恢复锁，请在支持 Web Locks 的浏览器恢复原有草稿。';
  }}catch{error.value='浏览器本地存储不可用，请勿关闭有未保存台词的页面。';}
  try{for(const job of (await lineDrafts('read')).filter(j=>j.key.startsWith(prefix)).sort((a,b)=>a.order-b.order)){
   const restore=async()=>{const oldKey=job.key;job.client_id=clientId;job.key=prefix+clientId+':'+job.line.id;job.state=job.state==='failed'?'failed':'queued';
    if(pending.value[job.line.id]){await lineDrafts('delete',oldKey);return;}
    await lineDrafts('put',job);if(oldKey!==job.key)await lineDrafts('delete',oldKey);creating.value[job.line.id]=job;
   };
   if(job.client_id===clientId)await restore();else if(navigator.locks)await navigator.locks.request('usagi-script-client:'+job.client_id,{ifAvailable:true},async lock=>{if(lock)await restore();});
  }}catch{error.value='本地新台词恢复失败，请保留原页面中的文本。';}
  if(currentGeneration!==generation)return;await refresh();if(currentGeneration!==generation||!s.value)return;
  const url=new URL('/api/admin/events/'+id+'/realtime',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(url);
  socket.onmessage=(event)=>{try{const message=JSON.parse(event.data);if((message.seq??message.change?.seq)>s.value!.seq)void refresh();}catch{/* Polling reconciles malformed frames. */}};
  socket.onclose=()=>{state.value='轮询同步';};socket.onerror=()=>{state.value='轮询同步';};
  poll=setInterval(async()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping');try{const c=await api<{seq:number}>('/api/admin/events/'+id+'/changes?after='+(s.value?.seq??0));if(c.seq!==syncedSeq.value)await refresh();if(navigator.onLine)await flush();}catch{state.value='离线或会话已失效';}},5000);
  await flush();
 }
 function view(line:Line){if(creating.value[line.id])return creating.value[line.id]!.line;const p=pending.value[line.id];return p?{...line,segments:undefined,...lineFields(p)}:line;}
 async function edit(line:Line,fields:Partial<LineFields>){
  if(s.value?.document.locked)return;
  const job=creating.value[line.id];if(job){Object.assign(job.line,fields);try{await lineDrafts('put',job);}catch{error.value='新台词本地备份失败，请保留本页并复制文本。';}return;}
  const latest=s.value?.lines.find(l=>l.id===line.id)??line;
  const p=pending.value[line.id]??{client_id:clientId,key:prefix+clientId+':'+line.id,id:line.id,version:latest.version,base:lineFields(latest),...lineFields(latest),revision:0,flight:null,conflict:null,error:''};
  Object.assign(p,fields);p.revision++;pending.value[line.id]=p;
  try{await persist(p);}catch{error.value='本地备份失败，文本仍在当前页面，请尽快复制备份。';}
  if(!composition.has(line.id))schedule();
 }
 async function editConflict(key:string,fields:string|Partial<LineFields>){const p=Object.values(pending.value).find(p=>p.key===key);if(!p)return;Object.assign(p,typeof fields==='string'?{text:fields}:fields);p.revision++;try{await persist(p);}catch{error.value='本地备份失败，请复制正在合并的文本。';}}
 function schedule(){if(disposed)return;const stamp=Date.now();if(!firstEdit)firstEdit=stamp;if(timer)clearTimeout(timer);timer=setTimeout(()=>{firstEdit=0;void flush().catch(e=>error.value=(e as Error).message);},Math.min(500,Math.max(0,2000-(stamp-firstEdit))));}
 async function discard(p:Pending){const entry=Object.entries(pending.value).find(([,row])=>row.key===p.key);if(entry)delete pending.value[entry[0]];await storage('delete',p.key);}
 function rebase(p:Pending,server:Line){
  const merged=reconcileLine(p.base,p,server);Object.assign(p,{segments:undefined},merged.value);
  if(merged.conflicts.length){p.conflict=server;p.error='这句台词的'+merged.conflicts.map(f=>({text:'正文',direction:'舞台提示',speaker_id:'角色',kind:'条目类型',segments:'发言片段'})[f]).join('、')+'存在重叠修改，请合并';return false;}
  p.version=server.version;p.base=lineFields(server);p.conflict=null;p.error='';p.revision++;return true;
 }
 function lines(blockId:string){
  const result=s.value?.lines.filter(l=>l.block_id===blockId).sort((a,b)=>a.position-b.position)??[];
  for(const job of Object.values(creating.value).filter(j=>j.line.block_id===blockId).sort((a,b)=>a.order-b.order))if(!result.some(l=>l.id===job.line.id)){
   const index=job.afterId?result.findIndex(l=>l.id===job.afterId):-1;result.splice(index<0?result.length:index+1,0,job.line);
  }
  return result;
 }
 function ready(job:LineCreation){return job.state==='queued'&&!creating.value[job.afterId??'']&&!composition.has(job.line.id);}
 function createLine(block:Block,afterId:string|null,fields:LineFields){
  if(!s.value||s.value.document.locked||!s.value.blocks.some(b=>b.id===block.id))return null;
  const id=crypto.randomUUID(),siblings=lines(block.id),after=siblings.find(l=>l.id===afterId);
  if(afterId&&!after){error.value='上一句不存在，请核对台词位置';return null;}
  creationOrder=Math.max(Date.now(),creationOrder+1);
  const line:Line={id,block_id:block.id,...fields,position:after?after.position+1:siblings.length,version:1,updated_by:session.user!.id,updated_at:new Date().toISOString(),deleted_at:null};
  const job:LineCreation=reactive({client_id:clientId,key:prefix+clientId+':'+id,eventId,line,afterId,order:creationOrder,flight:null,state:'queued',error:''});
  creating.value[id]=job;
  void lineDrafts('put',job).then(()=>{if(!disposed)void flush();}).catch(()=>{job.state='failed';job.error='本地备份失败，请保留本页并重试';});
  return id;
 }
 async function finishCreation(job:LineCreation,line:Line){
  // Hand editable local fields to the normal autosave queue before dropping the placeholder.
  if(!sameFields(job.line,line)){
   const p:Pending={client_id:clientId,key:prefix+clientId+':'+line.id,id:line.id,version:line.version,base:lineFields(line),...lineFields(job.line),revision:1,flight:null,conflict:null,error:''};
   pending.value[line.id]=p;delete creating.value[line.id];await persist(p);
  }else delete creating.value[line.id];
  await lineDrafts('delete',job.key);
 }
 async function sendCreation(job:LineCreation){
  const gen=generation;
  job.state='creating';job.error='';
  try{for(let attempt=0;attempt<2;attempt++){
   const b=s.value?.blocks.find(b=>b.id===job.line.block_id);if(!b)throw new Error('段落已移除，文本已保留，请复制到其他段落');
   if(!job.flight)job.flight={type:'line.add',operation_id:crypto.randomUUID(),id:job.line.id,block_id:b.id,expectedVersion:b.version,...(job.afterId?{after_id:job.afterId}:{}),...lineFields(job.line),segments:job.line.segments??null};
   await lineDrafts('put',job);
   try{const ack=await api<Ack&{line:Line}>('/api/admin/events/'+eventId+'/script/operations',job.flight);if(disposed||gen!==generation)return;acknowledge(ack);await finishCreation(job,ack.line);void refresh(true);return;}
   catch(e){if(e instanceof ApiError&&e.status===409&&attempt===0){
    if(!await refresh(true))throw new Error('暂时无法读取最新台词，请稍后重试');
    const existing=s.value?.lines.find(l=>l.id===job.line.id);if(existing){await finishCreation(job,existing);return;}
    if(s.value?.document.locked||!s.value?.blocks.some(b=>b.id===job.line.block_id)||job.afterId&&!s.value?.lines.some(l=>l.id===job.afterId&&l.block_id===job.line.block_id))throw e;
    job.flight=null;continue;
   }throw e;}
  }}catch(e){
   if(disposed||gen!==generation)return;
   if(!creating.value[job.line.id]){error.value='服务器已创建台词，本地记录清理失败，请保留本页并核对文本。';return;}
   job.state='failed';job.error=e instanceof ApiError?e.message:'创建暂未确认，文本已保留，请重试。';try{await lineDrafts('put',job);}catch{error.value='新台词本地备份失败，请复制文本并保留本页。';}
  }
 }
 function retryLine(id:string){const job=creating.value[id];if(!job)return;job.state='queued';job.error='';void flush();}
 async function run(){
  if(!navigator.onLine){state.value='离线 · 文本保存在本机';return;}
  saving.value=true;
  try{
   while(!disposed){const job=Object.values(creating.value).sort((a,b)=>a.order-b.order).find(ready);if(!job)break;await sendCreation(job);}
   for(const p of Object.values(pending.value)){
   if(disposed)break;if(composition.has(p.id))continue;
   let latest=s.value?.lines.find(l=>l.id===p.id);
   if(!p.flight&&latest&&sameFields(p,latest)){await discard(p);continue;}
   if(p.conflict||p.error)continue;
   if(!p.flight&&latest&&latest.version>p.version&&!rebase(p,latest)){await persist(p);continue;}
   if(!p.flight&&latest&&sameFields(p,latest)){await discard(p);continue;}
   for(let attempt=0;attempt<3;attempt++){
    if(!p.flight)p.flight={operation_id:crypto.randomUUID(),type:'line.update',id:p.id,expectedVersion:p.version,...lineFields(p),segments:p.segments??null,revision:p.revision};
    await persist(p);const f={...p.flight};
    try{
     const {revision,...op}=f;const ack=await api<Ack&{line:Line}>('/api/admin/events/'+eventId+'/script/operations',op);
     // Update the rendered version before clearing pending text or awaiting any storage/network work.
     acknowledge(ack);p.version=ack.line.version;p.base=lineFields(ack.line);p.flight=null;
     if(p.revision===revision)await discard(p);else await persist(p);
     void refresh(true);break;
    }catch(e){
     if(e instanceof ApiError&&e.status===409){
      const server=(e.details as {line?:Line}|null)?.line;p.flight=null;
      if(server&&rebase(p,server)){
       if(sameFields(p,server)){await discard(p);void refresh(true);break;}
       if(attempt<2){await persist(p);continue;}
       p.conflict=server;p.error='这句台词仍在被修改，请核对后重试';
      }else if(!server){p.conflict=s.value?.lines.find(l=>l.id===p.id)??null;p.error=e.message;}
      await persist(p);
     }else if(e instanceof ApiError){p.error=e.message;p.flight=null;await persist(p);}
     else{state.value='网络中断 · 已保存在本机';}
     break;
    }
   }
  }}finally{saving.value=false;}
 }
 async function flush(){if(working)return working;working=run().finally(()=>working=null);await working;if((Object.values(creating.value).some(ready)||Object.values(pending.value).some(p=>!p.conflict&&!p.error&&!composition.has(p.id)))&&navigator.onLine&&!state.value.startsWith('网络'))schedule();}
 async function resolve(key:string,keep:boolean){
  const entry=Object.entries(pending.value).find(([,p])=>p.key===key),p=entry?.[1];if(!p)return;if(!await refresh(true))return;const server=s.value?.lines.find(l=>l.id===p.id);
  if(keep&&!server){p.error='服务器已移除此句，请复制本地文本并在现有段落中新建台词。';return;}
  if(keep&&server){p.version=server.version;p.base=lineFields(server);p.conflict=null;p.error='';p.flight=null;p.revision++;await persist(p);await flush();}else await discard(p);
 }
 async function operation(op:ScriptOperation){
  // Appending a new block does not touch existing lines; do not make it wait for all line autosaves.
  if(op.type!=='block.add'){await flush();if(dirty.value)throw new Error('存在未保存或冲突的台词，请先处理后再修改段落结构。');}
  const ack=await api<Ack>('/api/admin/events/'+eventId+'/script/operations',op);acknowledge(ack);
  if(op.type==='block.add')void refresh(true);else await refresh(true);
  return ack;
 }
 function composing(id:string,active:boolean){if(active)composition.add(id);else{composition.delete(id);schedule();}}
 return {s,syncedSeq,creating,lines,createLine,retryLine,pending,error,state,saving,dirty,conflicts,open,stop,refresh,view,edit,editConflict,flush,resolve,operation,composing};
}
