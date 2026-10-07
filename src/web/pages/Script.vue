<script setup lang="ts">
import ModalDialog from '../components/ModalDialog.vue';
import ScriptLineText from '../components/ScriptLineText.vue';
import ScriptLanguageFeedback from '../components/ScriptLanguageFeedback.vue';
import {scriptLanguage} from '../lib/script-language';
import {scriptParagraph} from '../lib/script-paragraph';
import {dialogueSpeakers,missingDialogueSpeakers} from '../../shared/dialogue';
import DurationPicker from '../components/DurationPicker.vue';
import {orderCharacters} from '../lib/character-order';
import {confirmAction,promptAction} from '../lib/dialog';
import { ref,computed,onMounted,onBeforeUnmount,watch,nextTick,reactive } from 'vue';import { onBeforeRouteLeave } from 'vue-router';import EventPicker from '../components/EventPicker.vue';import { catalog,download,duration,session,ApiError } from '../lib/api';import { scriptEditor } from '../lib/script-editor';import {blockDrafts,type BlockCreation} from '../lib/script-block-drafts';
import {lineKind,type DialogueSegment,type LineKind,type Block,type Line,type ScriptOperation} from '../../shared/models';
const editor=scriptEditor(),{s,syncedSeq,creating,pending,error,state,saving,dirty,conflicts}=editor,selectedList=ref(''),search=ref(''),newTitle=ref(''),newAnchor=ref('start'),busy=ref(false),selectedSpeaker=ref(''),exportSpeaker=ref(''),editingBlock=ref<Block|null>(null),blockForm=ref({title:'',scene:'',anchor:'start',opening:false,seconds:0});
const language=scriptLanguage(editor),paragraph=scriptParagraph(editor);
function reviewLine(line:Line){void language.request(line);void paragraph.request(line);}
const characters=computed(()=>orderCharacters(s.value?.characters.filter(c=>c.id!=='aux-narrator'&&!c.archived&&!c.hidden&&(!selectedList.value||s.value?.lists.find(l=>l.id===selectedList.value)?.members.includes(c.id))&&[c.name,c.display_name??'',c.japanese_name,...c.aliases??[]].some(x=>x.includes(search.value)))??[]));
const exportCharacters=computed(()=>orderCharacters(s.value?.characters.filter(c=>c.id!=='aux-narrator'&&!c.archived&&!c.hidden)??[]));
// Keep an export path for speakers already used by historical lines, without listing unused archived entries.
const historicalExportCharacters=computed(()=>orderCharacters(s.value?.characters.filter(c=>c.id!=='aux-narrator'&&(c.archived||c.hidden)&&s.value?.lines.some(l=>dialogueSpeakers(l).includes(c.id)))??[]));
watch([exportCharacters,historicalExportCharacters],()=>{if(exportSpeaker.value&&![...exportCharacters.value,...historicalExportCharacters.value].some(c=>c.id===exportSpeaker.value))exportSpeaker.value='';});
const creations=ref<BlockCreation[]>([]),newTitleInput=ref<HTMLInputElement>(),titleComposing=ref(false);
let creationWorker:Promise<void>|null=null,creationStopped=false;
const displayBlocks=computed(()=>[...s.value?.blocks??[],...creations.value.filter(j=>!s.value?.blocks.some(b=>b.id===j.block.id)).map(j=>j.block)]);
const creationFor=(b:Block)=>s.value?.blocks.some(real=>real.id===b.id)?undefined:creations.value.find(j=>j.block.id===b.id);
async function reconcileCreations(){
 for(const job of [...creations.value])if(s.value?.blocks.some(b=>b.id===job.block.id)||(job.ackSeq!==null&&syncedSeq.value>=job.ackSeq)){
  creations.value=creations.value.filter(j=>j.key!==job.key);try{await blockDrafts('delete',job.key);}catch{error.value='本地创建记录清理失败，刷新后会再次核对。';}
 }
}
watch([()=>s.value?.blocks.map(b=>b.id).join(','),syncedSeq],()=>void reconcileCreations());
watch(()=>s.value?.document.id,async doc=>{
 if(!doc)return;const eventId=s.value!.program.event_id,prefix=session.user!.id+':'+eventId+':';
 try{const jobs=await blockDrafts('read');if(s.value?.document.id!==doc)return;
  for(const job of jobs.filter(j=>j.key.startsWith(prefix)))if(!creations.value.some(j=>j.key===job.key))creations.value.push({...job,state:job.ackSeq!==null?'confirming':job.state==='failed'?'failed':'queued'});
  await reconcileCreations();void drainCreations();
 }catch{error.value='本地段落备份不可用，请保留当前页面。';}
});
function flightFor(job:BlockCreation):Extract<ScriptOperation,{type:'block.add'}>{return {type:'block.add',operation_id:crypto.randomUUID(),id:job.block.id,expectedVersion:s.value!.document.structure_version,title:job.block.title,at_end:!!job.block.at_end,at_start:!!job.block.at_start,before_program_item_id:job.block.before_program_item_id,opening:!!job.block.opening};}
async function drainCreations(){
 if(creationWorker||creationStopped)return creationWorker;
 creationWorker=(async()=>{
  let job:BlockCreation|undefined;
  while(!creationStopped&&(job=creations.value.find(j=>j.state==='queued'&&j.eventId===catalog.eventId&&j.eventId===s.value?.program.event_id))){
   job.state='creating';job.error='';
   try{for(let attempt=0;attempt<2;attempt++){
    if(!job.flight)job.flight=flightFor(job);await blockDrafts('put',job);
    try{const ack=await editor.operation(job.flight);job.ackSeq=ack.seq;job.state='confirming';if(creations.value.some(j=>j.key===job!.key))await blockDrafts('put',job);break;}
    catch(e){
     if(e instanceof ApiError&&e.status===409&&attempt===0){
      if(!await editor.refresh(true))throw new Error('暂时无法确认最新段落位置，请稍后重试');
      if(s.value?.blocks.some(b=>b.id===job!.block.id)){job.ackSeq=syncedSeq.value;job.state='confirming';break;}
      if(!s.value?.document.locked&&(job.block.at_end||s.value?.items.some(i=>i.id===job!.block.before_program_item_id))){job.flight=flightFor(job);continue;}
     }
     throw e;
    }
   }}catch(e){job.state='failed';job.error=e instanceof ApiError?e.message:(e as Error).name==='TimeoutError'?'网络响应超时，标题已保留，请重试创建。':(e as Error).message;try{await blockDrafts('put',job);}catch{job.error+='；本地备份失败，请保留本页';}}
   await reconcileCreations();
  }
 })().finally(()=>{creationWorker=null;if(!creationStopped&&creations.value.some(j=>j.state==='queued'&&j.eventId===catalog.eventId&&j.eventId===s.value?.program.event_id))void drainCreations();});
 return creationWorker;
}
async function retryCreation(job:BlockCreation){
 if(job.state==='confirming'){await editor.refresh(true);await reconcileCreations();return;}
 job.state='queued';job.error='';void drainCreations();
}
const slots=computed(()=>s.value?[{id:'start',title:'贺年祭开始',type:'',seconds:0},...s.value.items.map(i=>({id:i.id,title:i.title??i.custom_name??'',type:i.type??i.custom_type??'',seconds:i.duration_seconds??i.custom_duration??0})),...(displayBlocks.value.some(b=>b.at_end)?[{id:'end',title:'节目之后',type:'',seconds:0}]:[])]:[]);
const orphan=computed(()=>s.value?.blocks.filter(b=>!b.at_end&&!b.at_start&&!b.before_program_item_id)??[]);
const kindName=(kind:LineKind)=>({dialogue:'台词',comment:'注释',heading:'小标题'})[kind];
const entryKind=(l:Line)=>lineKind(editor.view(l));
function markEntry(l:Line,kind:LineKind){void editor.edit(l,{kind,segments:undefined,text:editor.view(l).text,speaker_id:kind==='dialogue'?editor.view(l).speaker_id??(selectedSpeaker.value||null):null});}
const outlineMedia=window.matchMedia('(min-width:1280px)'),outlineOpen=ref(outlineMedia.matches),activeAnchor=ref('');
function resizeOutline(e:MediaQueryListEvent){outlineOpen.value=e.matches;}
const outline=computed(()=>[...slots.value.flatMap(slot=>blocks(slot.id)),...orphan.value].map(b=>({id:'chapter-'+b.id,title:b.title,headings:(orphan.value.some(o=>o.id===b.id)?[]:lines(b)).filter(l=>entryKind(l)==='heading').map(l=>({id:'entry-'+l.id,title:editor.view(l).text.trim().split('\n')[0]||'未命名小标题'}))})));
function jump(id:string){const target=document.getElementById(id);if(!target)return;activeAnchor.value=id;if(!outlineMedia.matches)outlineOpen.value=false;void nextTick(()=>{target.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});});}
watch(outline,items=>{if(!items.some(item=>item.id===activeAnchor.value||item.headings.some(h=>h.id===activeAnchor.value)))activeAnchor.value='';});
let reverting=false;watch(()=>catalog.eventId,async(id,old)=>{if(reverting){reverting=false;return;}if(creationWorker)await creationWorker;await editor.flush();if(!dirty.value||await confirmAction('未确认的台词已保存在本机。切换活动？')){creations.value=[];await editor.open(id);}else{reverting=true;catalog.eventId=old;}});onMounted(()=>{if(catalog.eventId)editor.open(catalog.eventId);window.addEventListener('beforeunload',unload);outlineMedia.addEventListener('change',resizeOutline);});onBeforeUnmount(()=>{creationStopped=true;editor.stop();window.removeEventListener('beforeunload',unload);outlineMedia.removeEventListener('change',resizeOutline);});function unload(e:BeforeUnloadEvent){if(dirty.value||creations.value.length){e.preventDefault();e.returnValue='';}}onBeforeRouteLeave(async()=>{await editor.flush();return !dirty.value||await confirmAction('仍有未确认台词（已保存在本机），确定离开？');});
async function act(op:ScriptOperation){busy.value=true;error.value='';try{await editor.operation(op);if(op.type==='block.update'||op.type==='line.reorder')void paragraph.requestBlock(op.type==='block.update'?op.id:op.block_id);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
function lines(b:Block){return editor.lines(b.id);}
function blocks(slot:string){return displayBlocks.value.filter(b=>slot==='start'?!!b.at_start:slot==='end'?!!b.at_end:b.before_program_item_id===slot).sort((a,b)=>a.position-b.position)??[];}
const preferencesOpen=ref(false);
const selecting=ref(false),selectedLines=ref<string[]>([]);
const selectableLines=computed(()=>slots.value.flatMap(slot=>blocks(slot.id).flatMap(b=>lines(b))).filter(l=>!creating.value[l.id]));
watch(()=>s.value?.document.id,()=>{selectedLines.value=[];selecting.value=false;});
watch(()=>s.value?.lines,()=>{selectedLines.value=selectedLines.value.filter(id=>s.value?.lines.some(l=>l.id===id));});
function chooseAll(){selectedLines.value=selectableLines.value.slice(0,100).map(l=>l.id);}
function chooseBlock(b:Block){const ids=lines(b).filter(l=>!creating.value[l.id]).map(l=>l.id);if(ids.every(id=>selectedLines.value.includes(id)))selectedLines.value=selectedLines.value.filter(id=>!ids.includes(id));else selectedLines.value=[...new Set([...selectedLines.value,...ids])].slice(0,100);}
async function deleteSelected(){
 if(busy.value||!selectedLines.value.length||!s.value)return;
 await editor.flush();if(dirty.value){error.value='请先处理未保存或冲突的台词';return;}
 if(!await editor.refresh(true)){error.value='暂时无法读取最新台词，请稍后重试';return;}
 const eventId=catalog.eventId,items=selectedLines.value.map(id=>{const l=s.value!.lines.find(l=>l.id===id),b=l?s.value!.blocks.find(b=>b.id===l.block_id):null;return l&&b?{id:l.id,expectedVersion:l.version,blockVersion:b.version}:null;}).filter((item):item is NonNullable<typeof item>=>!!item);
 if(!items.length)return;
 if(!await confirmAction(`删除选中的 ${items.length} 条台词或条目？历史记录会保留，当前主持稿将不再显示这些内容。`))return;
 if(catalog.eventId!==eventId){error.value='活动已切换，请重新选择';return;}
 await act({type:'line.delete-many',operation_id:crypto.randomUUID(),items});if(!error.value){selectedLines.value=[];selecting.value=false;}
}
async function addBlock(){
 if(!s.value||s.value.document.locked||titleComposing.value||catalog.eventId!==s.value.program.event_id)return;
 const id=crypto.randomUUID(),anchor=slots.value.find(slot=>slot.id===newAnchor.value);if(!anchor){error.value='请选择有效的段落位置';return;}
 const block:Block={id,document_id:s.value.document.id,title:newTitle.value.trim()||'主持段落',before_program_item_id:['start','end'].includes(anchor.id)?null:anchor.id,at_end:Number(anchor.id==='end'),at_start:Number(anchor.id==='start'),opening:Number(anchor.id==='start'),anchor_label:anchor.title,position:Math.max(-1,...displayBlocks.value.map(b=>b.position))+1,estimated_seconds:0,version:1,deleted_at:null};
 const job:BlockCreation=reactive({key:session.user!.id+':'+s.value.program.event_id+':'+id,eventId:s.value.program.event_id,block,flight:null,state:'queued',error:'',ackSeq:null});
 creations.value.push(job);newTitle.value='';await nextTick();newTitleInput.value?.focus();
 try{await blockDrafts('put',job);void drainCreations();}catch{job.state='failed';job.error='本地备份失败，请保留本页并重试';}
}

const fragmentCursors:Record<string,{index:number;offset:number}>={};
async function addLine(b:Block,source?:Line,copy=true,partIndex?:number){
 const current=source?editor.view(source):null;
 const inherited=(partIndex===undefined?current?.segments?.at(-1):current?.segments?.[partIndex])?.speaker_ids;
 const parts=copy?current?.segments?.map(part=>({...part,speaker_ids:[...part.speaker_ids]})):inherited?[{text:'',speaker_ids:[...inherited]}]:undefined;
 const id=editor.createLine(b,source?.id??null,{kind:copy&&current?lineKind(current):'dialogue',speaker_id:parts?null:copy&&current?current.speaker_id:current&&lineKind(current)==='dialogue'?current.speaker_id:(selectedSpeaker.value||null),...(parts?{segments:parts}:{}),text:copy?current?.text??'':'',direction:copy?current?.direction??'':''});
 if(id){await nextTick();document.getElementById(id)?.focus();}
}
async function lineKey(e:KeyboardEvent,b:Block,l:Line,partIndex?:number){
 if(e.key!=='Enter'||e.isComposing||e.keyCode===229)return;
 e.preventDefault();if(e.repeat)return;
 if(e.ctrlKey||e.metaKey){
  const area=e.currentTarget as HTMLTextAreaElement,start=area.selectionStart,end=area.selectionEnd;
  if(area.value.length-(end-start)>=5000)return;
  const text=area.value.slice(0,start)+'\n'+area.value.slice(end);const current=editor.view(l);if(partIndex!==undefined&&current.segments){if(current.text.length-(end-start)>=5000)return;const segments=current.segments.map((part,i)=>i===partIndex?{...part,text}:part);void editor.edit(l,{segments,text:segments.map(part=>part.text).join(''),speaker_id:null});}else void editor.edit(l,{text});await nextTick();area.setSelectionRange(start+1,start+1);
 }else await addLine(b,l,false,partIndex);
}
async function removeLine(b:Block,l:Line){if(!await confirmAction('删除这句台词？'))return;act({type:'line.delete',operation_id:crypto.randomUUID(),id:l.id,expectedVersion:l.version,blockVersion:b.version});}
function move(b:Block,l:Line,offset:number){const ids=lines(b).map(l=>l.id),i=ids.indexOf(l.id),j=i+offset;if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j]!,ids[i]!];act({type:'line.reorder',operation_id:crypto.randomUUID(),block_id:b.id,expectedVersion:b.version,ids});}
function split(b:Block,l:Line){const area=document.getElementById(l.id) as HTMLTextAreaElement|null;const cursor=fragmentCursors[l.id];const offset=l.segments&&cursor?l.segments.slice(0,cursor.index).reduce((sum,p)=>sum+p.text.length,0)+cursor.offset:area?.selectionStart??0;if(offset<1||offset>=l.text.length){error.value='请先把光标放到台词中间的拆分位置';return;}act({type:'line.split',operation_id:crypto.randomUUID(),id:l.id,expectedVersion:l.version,blockVersion:b.version,new_id:crypto.randomUUID(),offset});}
function merge(b:Block,l:Line){const siblings=lines(b),next=siblings[siblings.findIndex(x=>x.id===l.id)+1];if(!next)return;act({type:'line.merge',operation_id:crypto.randomUUID(),id:l.id,expectedVersion:l.version,blockVersion:b.version,next_id:next.id,nextVersion:next.version});}
function editBlock(b:Block){editingBlock.value=b;blockForm.value={title:b.title,scene:b.scene??'',anchor:b.at_start?'start':b.at_end?'end':b.before_program_item_id??'',opening:!!b.opening,seconds:b.estimated_seconds};}
async function saveBlock(){const b=editingBlock.value;if(!b)return;await act({type:'block.update',operation_id:crypto.randomUUID(),id:b.id,expectedVersion:b.version,title:blockForm.value.title,scene:blockForm.value.scene,at_end:blockForm.value.anchor==='end',at_start:blockForm.value.anchor==='start',before_program_item_id:['start','end'].includes(blockForm.value.anchor)?null:blockForm.value.anchor||null,opening:blockForm.value.opening,estimated_seconds:blockForm.value.seconds,position:b.position});if(!error.value)editingBlock.value=null;}
async function deleteBlock(){const b=editingBlock.value;if(!b||!s.value||!await confirmAction('归档整个段落？历史记录仍会保留。'))return;act({type:'block.delete',operation_id:crypto.randomUUID(),id:b.id,expectedVersion:b.version,documentVersion:s.value.document.structure_version});editingBlock.value=null;}
async function lock(){
 if(!s.value)return;
 if(creationWorker)await creationWorker;
 await editor.refresh(true);
 if(creations.value.length){error.value='请先完成或重试所有待创建段落后再定稿';return;}
 await editor.flush();
 if(dirty.value){error.value='请先处理所有未确认台词';return;}
 if(!s.value.document.locked){
  const missing=s.value.lines.find(l=>missingDialogueSpeakers(editor.view(l)).length);
  if(missing){
   const part=missingDialogueSpeakers(editor.view(missing))[0]!,target=document.getElementById(editor.view(missing).segments?missing.id+'-speaker-'+part:'speaker-'+missing.id);
   if(target){target.scrollIntoView({block:'center'});target.focus();if(target.tagName==='SUMMARY')(target.parentElement as HTMLDetailsElement).open=true;}
   else error.value='存在未指定角色的台词，请先定位段落并选择发言角色。';
   return;
  }
 }
 const reason=s.value.document.locked?await promptAction('填写解锁原因'):'';
 if(reason===null)return;
 await act({type:'script.lock',operation_id:crypto.randomUUID(),expectedVersion:s.value.document.structure_version,expectedSeq:s.value.seq,programVersion:s.value.program.version,locked:!s.value.document.locked,reason});
}
async function exportText(formal:boolean){if(creations.value.length){error.value='请先确认待创建段落后再导出';return;}await editor.flush();if(dirty.value){error.value='存在未确认台词，暂不能导出';return;}try{await download('/api/admin/events/'+catalog.eventId+'/script/export?formal='+(formal?'1':'0')+(exportSpeaker.value?'&speaker='+exportSpeaker.value:''),formal?'主持稿_定稿.txt':'主持稿_预览.txt');}catch(e){error.value=(e as Error).message;}}
function copy(text:string){navigator.clipboard.writeText(text);}
function speakerName(id:string|null){return s.value?.characters.find(c=>c.id===id)?.display_name??'未指定角色';}
</script>
<template><div class="page script-page"><header class="page-head"><div><h1>主持稿</h1></div><EventPicker/></header><details class="paper script-tools"><summary>导出与批量操作 <small>{{ state }}</small></summary><div class="inline"><FieldLabel class="compact-label">导出范围<select v-model="exportSpeaker"><option value="">完整主持稿</option><option v-for="c in exportCharacters" :key="c.id" :value="c.id">仅 {{ c.display_name??c.name }}</option><optgroup v-if="historicalExportCharacters.length" label="稿内历史角色"><option v-for="c in historicalExportCharacters" :key="c.id" :value="c.id">仅 {{ c.display_name??c.name }}（历史角色）</option></optgroup></select></FieldLabel><button v-if="s&&!s.document.locked" type="button" :disabled="busy" @click="selecting=!selecting;selectedLines=[]">{{ selecting?'取消选择':'批量删除台词' }}</button><button v-if="s&&!s.document.locked&&selecting" type="button" class="danger" :disabled="busy||!!dirty||!selectedLines.length" @click="deleteSelected">{{ busy?'正在处理…':'删除已选（'+selectedLines.length+'）' }}</button><button type="button" :disabled="!s||busy" @click="exportText(false)">预览 TXT</button><button type="button" :disabled="!!creations.length||!s?.document.locked||!s?.program.locked||s.document.finalized_program_version!==s.program.version" @click="exportText(true)">定稿 TXT</button></div></details><PageActions :status="creations.length?`${creations.length} 个段落待确认`:saving?'正在保存…':dirty?`${dirty} 句等待确认`:'全部已保存'"><button type="button" :disabled="busy||!s" @click="lock">{{ s?.document.locked?'解锁主持稿':'检查并定稿' }}</button><button type="button" class="primary" :disabled="!s||busy" @click="editor.flush()">立即保存</button></PageActions><p v-if="error" class="alert error" role="alert">{{ error }}</p><section v-if="conflicts.length" class="paper conflict-panel"><h2>需要处理的本地台词</h2><article v-for="p in conflicts" :key="p.key"><p>{{ p.error }}</p><div class="grid two"><div><strong>本地版本（可继续编辑）</strong><FieldLabel>条目类型<select :value="lineKind(p)" @change="editor.editConflict(p.key,{kind:($event.target as HTMLSelectElement).value as LineKind,segments:undefined,text:p.text,speaker_id:($event.target as HTMLSelectElement).value==='dialogue'?p.speaker_id:null})"><option value="dialogue">台词</option><option value="comment">注释</option><option value="heading">小标题</option></select></FieldLabel><FieldLabel v-if="lineKind(p)==='dialogue'&&!p.segments">角色 *<select :id="'speaker-conflict-'+p.key" required :aria-invalid="missingDialogueSpeakers(p).length>0||undefined" :aria-describedby="missingDialogueSpeakers(p).length?'conflict-'+p.key+'-speaker-error-0':undefined" :value="p.speaker_id??''" @change="editor.editConflict(p.key,{speaker_id:($event.target as HTMLSelectElement).value||null})"><option value="">未指定</option><option v-for="c in exportCharacters" :value="c.id">{{ c.display_name??c.name }}</option></select></FieldLabel><ScriptLineText :line="p" :id="'conflict-'+p.key" label="本地台词" :characters="orderCharacters(s?.characters.filter(c=>c.id!=='aux-narrator')??[])" @update="editor.editConflict(p.key,$event)"/><small>{{ kindName(lineKind(p)) }}{{ lineKind(p)==='dialogue'?' · '+(dialogueSpeakers(p).map(speakerName).join('、')||'未指定角色'):'' }}</small></div><div><strong>服务器版本</strong><template v-if="p.conflict?.segments"><p v-for="(part,partIndex) in p.conflict.segments" :key="partIndex" class="prewrap"><strong>{{ part.speaker_ids.map(speakerName).join('、')||'未指定角色' }}：</strong>{{ part.text }}</p></template><p v-else class="prewrap">{{ p.conflict?.text??'请刷新后检查该台词是否已删除。' }}</p><small>{{ p.conflict?kindName(lineKind(p.conflict)):kindName(lineKind(p)) }}{{ p.conflict&&lineKind(p.conflict)==='dialogue'?' · '+(dialogueSpeakers(p.conflict).map(speakerName).join('、')||'未指定角色'):'' }}</small></div></div><div class="inline"><button @click="copy(p.text)">复制本地文本</button><button @click="editor.resolve(p.key,false)">采用服务器版本</button><button class="primary" @click="editor.resolve(p.key,true)">以本地合并结果重试</button></div></article></section><div v-if="s&&!s.document.locked&&selecting" class="paper bulk-lines"><template v-if="selecting"><button :disabled="busy||!selectableLines.length" @click="chooseAll">全选（最多 100 条）</button><button :disabled="busy||!selectedLines.length" @click="selectedLines=[]">清空选择</button><span class="hint">每批最多 100 条，请先等待编辑内容保存。</span></template></div><div v-if="s" class="script-workspace"><nav id="script-directory" class="script-outline paper" aria-label="主持稿目录"><button type="button" class="outline-toggle" :aria-expanded="outlineOpen" aria-controls="script-outline-links" @click="outlineOpen=!outlineOpen">主持稿目录<span aria-hidden="true">{{ outlineOpen?'−':'＋' }}</span></button><div v-show="outlineOpen" id="script-outline-links"><p v-if="!outline.length" class="hint">新建段落后会显示目录。</p><ol><li v-for="chapter in outline" :key="chapter.id"><a :href="'#'+chapter.id" :title="chapter.title" :aria-current="activeAnchor===chapter.id?'location':undefined" @click.prevent="jump(chapter.id)">{{ chapter.title }}</a><ol v-if="chapter.headings.length"><li v-for="heading in chapter.headings" :key="heading.id"><a :href="'#'+heading.id" :title="heading.title" :aria-current="activeAnchor===heading.id?'location':undefined" @click.prevent="jump(heading.id)">{{ heading.title }}</a></li></ol></li></ol></div></nav><div class="script-content"><template v-if="s"><div v-if="s.document.locked" class="alert" :class="s.document.finalized_program_version===s.program.version?'success':'warning'">{{ s.document.finalized_program_version===s.program.version?'主持稿已定稿 · 对应节目单版本 '+s.document.finalized_program_version:'编排已解锁，旧定稿失效。主持稿内容仍锁定，修改前请显式解锁。' }}</div><div class="script-preferences" :class="{'is-open':preferencesOpen}"><button class="preferences-toggle" type="button" :aria-expanded="preferencesOpen" aria-controls="script-preferences-content" @click="preferencesOpen=!preferencesOpen">角色与段落设置 <span aria-hidden="true">{{ preferencesOpen?'−':'＋' }}</span></button><div id="script-preferences-content"><details class="paper cast-picker"><summary>默认角色与筛选 · {{ selectedSpeaker?speakerName(selectedSpeaker):'未指定默认角色' }}</summary><div class="grid three"><FieldLabel>默认发言角色<select v-model="selectedSpeaker"><option value="">未指定</option><option v-for="c in characters" :value="c.id">{{ c.display_name??c.name }}</option></select></FieldLabel><FieldLabel>筛选角色列表<select v-model="selectedList"><option value="">全部角色</option><option v-for="l in s.lists.filter(l=>!l.archived)" :value="l.id">{{ l.name }}</option></select></FieldLabel><FieldLabel>搜索角色<input v-model="search" placeholder="名称或别名"></FieldLabel></div><p class="hint">条目可标记为台词、注释或小标题。有正文的台词必须选择角色；草稿会保留，补齐角色后才能定稿。注释和小标题不需要角色。</p></details><details v-if="!s.document.locked" class="paper new-block-form"><summary>新建主持段落</summary><div class="inline"><FieldLabel>新段落标题<input ref="newTitleInput" v-model="newTitle" maxlength="100" placeholder="新主持段落标题" aria-label="新段落标题" @compositionstart="titleComposing=true" @compositionend="titleComposing=false"></FieldLabel><FieldLabel>新段落位置<select v-model="newAnchor" aria-label="新段落位置"><option v-for="slot in slots" :value="slot.id">{{ slot.id==='start'?'贺年祭开始':slot.id==='end'?'节目之后':'在 '+slot.title+' 前' }}</option></select></FieldLabel><button class="primary" type="button" @click="addBlock">＋ 新建段落</button></div><p class="hint">台词中按 Enter 新建下一句，Ctrl / ⌘ + Enter 在当前句内换行。</p></details></div></div><section v-if="orphan.length" class="alert warning"><h2>待重新定位的段落</h2><p>原节目已被移除，以下段落完整保留。请设置新的位置后定稿。</p><button v-for="b in orphan" :id="'chapter-'+b.id" @click="editBlock(b)">{{ b.title }} · 原位置：{{ b.anchor_label }}</button></section><template v-for="slot in slots" :key="slot.id"><div class="script-anchor"><h2>{{ slot.title }}</h2><small>{{ slot.type }}{{ slot.seconds?' · '+duration(slot.seconds):'' }}</small></div><article v-for="b in blocks(slot.id)" :key="b.id" :id="'chapter-'+b.id" tabindex="-1" class="script-block paper" :class="{'is-creating':creationFor(b)}" :aria-busy="creationFor(b)?creationFor(b)?.state!=='failed':false"><header class="inline"><button v-if="selecting&&!creationFor(b)" type="button" :disabled="busy" @click="chooseBlock(b)">选择本段</button><h3 v-if="!b.auto_generated">{{ b.opening&&!b.at_start?'开场 · ':'' }}{{ b.title }}</h3><small v-if="!creationFor(b)">预计 {{ duration(b.estimated_seconds) }}</small><button v-if="!s.document.locked&&!creationFor(b)" @click="editBlock(b)">段落设置</button><button v-if="!creationFor(b)" type="button" @click="paragraph.requestBlock(b.id)">检查段落</button><small v-if="paragraph.forBlock(b)" role="status">{{ paragraph.forBlock(b)?.state==='complete'?'段落已审阅':paragraph.forBlock(b)?.state==='pending'?'段落审阅中…':'段落审阅未完成' }}</small></header><div v-if="creationFor(b)" class="block-creation-state" role="status"><template v-if="creationFor(b)?.state==='failed'"><p class="text-danger">创建未完成：{{ creationFor(b)?.error }}</p><button type="button" @click="retryCreation(creationFor(b)!)">重试创建</button><span class="hint">标题和位置保留在本页及本地备份中。</span></template><template v-else><p>{{ creationFor(b)?.state==='queued'?'已排入队列，准备创建…':creationFor(b)?.state==='confirming'?'服务器已保存，正在同步段落…':'正在创建段落…' }}</p><span class="hint">可以继续用上方输入框创建下一段。</span><button v-if="creationFor(b)?.state==='confirming'" type="button" @click="retryCreation(creationFor(b)!)">重新同步</button></template></div><template v-else><div v-for="(l,index) in lines(b)" :key="l.id" :id="'entry-'+l.id" tabindex="-1" class="script-line" :class="'entry-'+entryKind(l)"><FieldLabel v-if="selecting&&!creating[l.id]" class="line-selection"><input v-model="selectedLines" type="checkbox" :value="l.id" :disabled="busy||(!selectedLines.includes(l.id)&&selectedLines.length>=100)" :aria-label="'选择第 '+(index+1)+' 条'+kindName(entryKind(l))"></FieldLabel><span class="line-number">{{ index+1 }}</span><div class="entry-meta"><span v-if="entryKind(l)!=='dialogue'" class="hint">{{ kindName(entryKind(l)) }}</span><FieldLabel v-if="entryKind(l)==='dialogue'&&!editor.view(l).segments" class="speaker-label">角色 *<select :id="'speaker-'+l.id" required :aria-invalid="missingDialogueSpeakers(editor.view(l)).length>0||undefined" :aria-describedby="missingDialogueSpeakers(editor.view(l)).length?l.id+'-speaker-error-0':undefined" :value="editor.view(l).speaker_id??''" :disabled="!!s.document.locked" @blur="reviewLine(l)" @change="editor.edit(l,{speaker_id:($event.target as HTMLSelectElement).value||null})"><option value="">未指定</option><option v-if="l.speaker_id&&!characters.some(c=>c.id===l.speaker_id)" :value="l.speaker_id">{{ speakerName(l.speaker_id) }}（历史角色）</option><option v-for="c in characters" :value="c.id">{{ c.display_name??c.name }}</option></select></FieldLabel></div><div class="grow"><ScriptLineText :line="editor.view(l)" :id="l.id" :label="'第 '+(index+1)+' 条'+kindName(entryKind(l))" :characters="orderCharacters(s.characters.filter(c=>c.id!=='aux-narrator'))" :disabled="!!s.document.locked" @blur="reviewLine(l)" @update="editor.edit(l,$event)" @keydown="(event,partIndex)=>lineKey(event,b,l,partIndex)" @composition="editor.composing(l.id,$event)" @cursor="(index,offset)=>fragmentCursors[l.id]={index,offset}"><template #actions><details v-if="!s.document.locked" class="line-menu"><summary :aria-label="'第 '+(index+1)+' 条'+kindName(entryKind(l))+'操作'" title="台词操作"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></summary><div class="line-menu-content"><FieldLabel>条目类型<select :aria-label="'第 '+(index+1)+' 条类型'" :value="entryKind(l)" :disabled="!!s.document.locked" @change="markEntry(l,($event.target as HTMLSelectElement).value as LineKind)"><option value="dialogue">台词</option><option value="comment">注释</option><option value="heading">小标题</option></select></FieldLabel><div v-if="!creating[l.id]" class="row-actions"><button :disabled="index===0||!!dirty" aria-label="上移台词" @click="move(b,l,-1)">↑</button><button :disabled="index===lines(b).length-1||!!dirty" aria-label="下移台词" @click="move(b,l,1)">↓</button><button :disabled="!!dirty" @click="addLine(b,l)">复制</button><button :disabled="!!dirty" @click="split(b,l)">拆分</button><button :disabled="!!dirty||index===lines(b).length-1" @click="merge(b,l)">并下句</button><button class="text-button danger" :disabled="!!dirty" @click="removeLine(b,l)">删除</button></div></div></details></template></ScriptLineText><ScriptLanguageFeedback :review="language.forLine(l)" :line-id="l.id" :number="index+1" @ignore="language.ignore"/><ScriptLanguageFeedback :review="paragraph.forLine(l)" scope="paragraph" :line-id="l.id" :number="index+1" @ignore="paragraph.ignore"/><details class="line-direction" :open="!!editor.view(l).direction"><summary>舞台提示{{ editor.view(l).direction?' · 已填写':'（可选）' }}</summary><FieldLabel>舞台提示<input :value="editor.view(l).direction" :disabled="!!s.document.locked" maxlength="500" placeholder="舞台提示 / 语气（可选）" aria-label="舞台提示" @blur="reviewLine(l)" @input="editor.edit(l,{direction:($event.target as HTMLInputElement).value})"></FieldLabel></details><small :class="{'text-danger':pending[l.id]?.error||creating[l.id]?.error}" role="status">{{ creating[l.id]?creating[l.id]?.state==='failed'?'创建未完成：'+creating[l.id]?.error:creating[l.id]?.state==='creating'?'正在创建 · 可以继续输入':'已排入创建队列 · 可以继续输入':pending[l.id]?.error?'存在冲突':pending[l.id]?'待确认':language.forLine(l)?.state==='complete'?'已审阅':'已保存' }}</small><button v-if="creating[l.id]?.state==='failed'" type="button" @click="editor.retryLine(l.id)">重试创建台词</button></div></div><button v-if="!s.document.locked" @click="addLine(b)">＋ 添加台词</button><p v-if="!lines(b).length" class="hint">空段落可保留，添加台词开始编辑。</p></template></article></template><p v-if="!displayBlocks.length" class="empty paper">节目编排保存后会自动生成主持段落。</p></template></div></div><ModalDialog v-if="editingBlock" title="段落设置" @close="editingBlock=null"><p v-if="editingBlock.auto_generated" class="hint">标题和位置随节目编排自动更新，台词内容保留。</p><form @submit.prevent="saveBlock"><FieldLabel>标题<input v-model="blockForm.title" :readonly="!!editingBlock.auto_generated" required></FieldLabel><FieldLabel>位置<select v-model="blockForm.anchor" :disabled="!!editingBlock.auto_generated" required><option value="" disabled>请选择新位置</option><option v-for="slot in slots" :value="slot.id">{{ slot.id==='start'?'贺年祭开始':slot.id==='end'?'节目之后':'在 '+slot.title+' 前' }}</option></select></FieldLabel><FieldLabel>场景与地点（可选）<input v-model="blockForm.scene" maxlength="500" placeholder="例如：Rabbit House 室内，开场后仍在店内" aria-label="场景与地点"></FieldLabel><DurationPicker v-model="blockForm.seconds" label="预计主持时长"/><FieldLabel class="check"><input v-model="blockForm.opening" :disabled="!!editingBlock.auto_generated" type="checkbox">标记为开场段落</FieldLabel><div class="dialog-actions"><button v-if="!editingBlock.auto_generated" type="button" class="danger" @click="deleteBlock">删除段落</button><button type="button" @click="editingBlock=null">取消</button><button class="primary" :disabled="busy">保存段落</button></div></form></ModalDialog></div></template>

<style scoped>
.bulk-lines{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.line-selection{margin:0;align-self:flex-start}.line-selection input{width:18px;height:18px}.script-line{position:relative}@media(max-width:760px){.line-selection{position:absolute;left:0;top:24px}.script-line:has(.line-selection) .entry-meta{padding-left:28px}}

.script-workspace{display:grid;grid-template-columns:190px minmax(0,1fr);gap:22px;align-items:start}
.script-content{min-width:0}.script-outline{position:sticky;top:150px;padding:16px}
.outline-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;background:none;border:0;padding:8px 0;font-weight:600;min-height:44px}
.script-outline ol{list-style:none;margin:8px 0 0;padding:0}.script-outline ol ol{padding-left:14px;border-left:1px solid var(--line);margin:0 0 12px}
.script-outline a{display:block;padding:10px 8px;line-height:1.5;font-size:13px;overflow-wrap:anywhere;border-radius:6px}
.script-outline a[aria-current]{background:#eee3db;color:var(--ink);font-weight:600}
#script-outline-links{max-height:calc(100vh - 240px);overflow:auto}
.script-block,.script-line{scroll-margin-top:170px}.script-block:focus,.script-line:focus{outline:2px solid #cfa788;outline-offset:5px}
.entry-meta{width:130px;flex-shrink:0}.entry-meta label{margin-bottom:12px}.entry-meta .speaker-label{width:100%}
.entry-comment{background:#f7f3ed;border-radius:8px;padding-left:10px;padding-right:10px}.entry-comment textarea{background:#faf7f1}
.entry-heading textarea{font-size:19px;font-weight:600;background:#fcf4ee;border-color:#d9c2b3}
@media(max-width:1279px){.script-workspace{grid-template-columns:minmax(0,1fr)}.script-outline{position:static}.script-outline ol ol{margin-bottom:8px}#script-outline-links{max-height:300px}}
@media(max-width:760px){.entry-meta{width:100%;grid-column:2}.script-block,.script-line{scroll-margin-top:18px}}
@media print{.script-workspace{display:block}.script-outline,.entry-meta{display:none}}

.new-block-form .inline>input,.new-block-form .inline>select{flex:1;min-width:160px}
.is-creating{border-style:dashed;border-color:#b9a393}
.block-creation-state{padding-top:18px;font-size:13px;color:var(--muted)}
.block-creation-state p{margin-bottom:8px}
.block-creation-state button{margin:8px 12px 0 0}
</style>

<style scoped>


.script-line{padding:14px 0;gap:12px;align-items:start}.entry-meta{width:115px}.entry-meta label{margin:0}.script-line:focus-within{background:#faf6f1;border-radius:8px}.line-menu{position:relative;flex-shrink:0}.line-menu>summary{display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border:1px solid var(--line);border-radius:7px;list-style:none;color:var(--ink)}.line-menu>summary::-webkit-details-marker{display:none}.line-menu>summary svg{fill:currentColor}.line-menu>summary:hover,.line-menu[open]>summary{background:#ede2d9}.line-menu-content{position:absolute;right:0;top:48px;width:190px;padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 28px #493e4030;z-index:10}.line-menu-content .row-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.line-menu-content button{min-height:44px}.line-direction{margin-top:4px}.line-direction summary{padding:5px 0;color:#72605c}
@media(max-width:760px){.script-line{grid-template-columns:minmax(0,1fr);gap:8px}.script-line .line-number{display:none}.script-line .entry-meta{grid-column:1;width:100%}.script-line>.grow{grid-column:1/-1}.entry-meta .speaker-label{display:flex;align-items:center;gap:10px}.entry-meta select{margin:0;flex:1}.script-page{padding-bottom:90px}.cast-picker{padding:16px}.new-block-form{padding:16px}.line-menu-content{width:200px}.script-outline{scroll-margin-top:16px}}
</style>

<style scoped>
.script-tools>summary{cursor:pointer}.script-tools>summary small{display:inline;margin-left:12px}.script-tools>.inline{margin-top:12px}
@media(max-width:760px){.script-page{padding-top:16px}.script-page .page-head{margin-bottom:12px}.script-page .paper{margin-bottom:10px}.script-tools,.cast-picker,.new-block-form{padding:8px 12px}.script-tools>summary,.cast-picker>summary,.new-block-form>summary{display:flex;align-items:center;min-height:44px;flex-wrap:wrap}.script-workspace{gap:0}.script-outline{padding:4px 12px}.script-anchor{margin:12px 0}.script-anchor h2{margin-bottom:4px}}
</style>

<style scoped>
.preferences-toggle{display:none}
@media(max-width:760px){.script-page .page-head{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:16px}.script-page .page-head :deep(label){min-width:0;margin:0}.script-page .page-head h1{margin:0}.preferences-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:52px;padding:8px 12px;text-align:left;background:var(--paper);margin-bottom:10px}.script-preferences:not(.is-open)>#script-preferences-content{display:none}.script-anchor{padding-top:12px}.script-tools{margin-top:0}}
</style>
