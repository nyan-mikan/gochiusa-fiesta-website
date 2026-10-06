import {ref,watch,onBeforeUnmount} from 'vue';
import {api,ApiError} from './api';
import {notify} from './messages';
import {sameFields} from './script-reconcile';
import {paragraphKey,paragraphLines,type ParagraphReview} from '../../shared/script-paragraph';
import type {LanguageReview} from '../../shared/script-language';
import type {Block,Line} from '../../shared/models';
import type {scriptEditor} from './script-editor';

export function scriptParagraph(editor:ReturnType<typeof scriptEditor>){
 const reviews=ref<Record<string,ParagraphReview>>({}),ignoring=ref<Record<string,boolean>>({});let stopped=false,epoch=0,reading=false;
 const requests=new Set<string>(),waiting=new Set<string>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const path=()=>'/api/admin/events/'+editor.s.value?.program.event_id+'/script/paragraph-reviews';
 const keyFor=(block:Block)=>{const s=editor.s.value!;return paragraphKey(block,s.lines,s.items.find(i=>i.id===block.before_program_item_id));};
 const stable=(block:Block)=>!!editor.s.value&&!Object.values(editor.creating.value).some(c=>c.line.block_id===block.id)&&paragraphLines(block,editor.s.value.lines).every(l=>!editor.pending.value[l.id]&&sameFields(editor.view(l),l));
 function forBlock(block:Block){const review=reviews.value[block.id];return stable(block)&&review?.context_key===keyFor(block)?review:undefined;}
 function forLine(line:Line):LanguageReview|undefined{const block=editor.s.value?.blocks.find(b=>b.id===line.block_id),r=block&&forBlock(block);if(!r)return;return {id:r.id,line_id:line.id,line_version:line.version,state:r.state,issues:r.issues.flatMap(issue=>{const target=issue.targets.find(t=>t.line_id===line.id);return target?[{issue_no:issue.issue_no,category:issue.category,excerpt:target.excerpt,problem:issue.problem,suggestion:issue.suggestion,ignored:issue.ignored}]:[]})};}
 async function refresh(){if(stopped||!editor.s.value||reading||Object.values(ignoring.value).some(Boolean))return;const current=epoch,event=editor.s.value.program.event_id;reading=true;try{const result=await api<{reviews:ParagraphReview[]}>(path());if(!stopped&&epoch===current&&editor.s.value?.program.event_id===event)reviews.value=Object.fromEntries(result.reviews.map(r=>[r.block_id,r]));}catch{/* Review polling does not interrupt editing. */}finally{reading=false;}}
 async function send(blockId:string){
  if(stopped||!editor.s.value)return;const block=editor.s.value.blocks.find(b=>b.id===blockId);if(!block){waiting.delete(blockId);return;}if(!stable(block))return;
  waiting.delete(blockId);const context=keyFor(block),key=editor.s.value.program.event_id+':'+context;if(requests.has(key)||forBlock(block))return;requests.add(key);const current=epoch,event=editor.s.value.program.event_id;
  try{const review=await api<ParagraphReview|null>(path(),{block_id:blockId,context_key:context});if(review&&!stopped&&epoch===current&&editor.s.value?.program.event_id===event)reviews.value={...reviews.value,[review.block_id]:review};}catch(e){requests.delete(key);if(e instanceof ApiError&&e.status===422)notify('W',e.message);}
 }
 function schedule(blockId:string){if(stopped)return;waiting.add(blockId);clearTimeout(timers.get(blockId));timers.set(blockId,setTimeout(()=>{timers.delete(blockId);void send(blockId);},1500));}
 async function requestBlock(blockId:string){if(stopped||!editor.s.value)return;schedule(blockId);try{await editor.flush();}catch{return;}}
 const request=(line:Line)=>requestBlock(line.block_id);
 watch(()=>[editor.s.value?.seq,Object.keys(editor.pending.value).join(','),Object.keys(editor.creating.value).join(',')],()=>{
  for(const block of editor.s.value?.blocks??[])if(reviews.value[block.id]&&reviews.value[block.id].context_key!==keyFor(block))schedule(block.id);
  for(const blockId of waiting)if(!timers.has(blockId))schedule(blockId);
 },{flush:'post'});
 async function ignore(review:LanguageReview,issueNo:number){const r=Object.values(reviews.value).find(r=>r.id===review.id),issue=r?.issues.find(i=>i.issue_no===issueNo),key=review.id+':'+issueNo;if(!issue||ignoring.value[key])return;ignoring.value[key]=true;epoch++;issue.ignored=true;
  try{await api(path()+'/'+encodeURIComponent(review.id)+'/ignore',{issue_no:issueNo},'PUT');}catch{issue.ignored=false;notify('W','暂时无法忽略这则提示，请稍后重试。');}finally{ignoring.value[key]=false;void refresh();}
 }
 watch(()=>editor.s.value?.document.id,()=>{epoch++;for(const t of timers.values())clearTimeout(t);timers.clear();waiting.clear();requests.clear();reviews.value={};void refresh();});
 const timer=setInterval(()=>void refresh(),5000);onBeforeUnmount(()=>{stopped=true;epoch++;clearInterval(timer);for(const t of timers.values())clearTimeout(t);});
 return {reviews,forBlock,forLine,request,requestBlock,ignore,refresh};
}
