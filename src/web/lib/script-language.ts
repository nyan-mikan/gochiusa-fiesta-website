import {ref,watch,onBeforeUnmount} from 'vue';
import {api} from './api';
import {sameFields,lineFields,type LineFields} from './script-reconcile';
import {notify} from './messages';
import type {scriptEditor} from './script-editor';
import type {Line} from '../../shared/models';
import type {LanguageReview} from '../../shared/script-language';

export function scriptLanguage(editor:ReturnType<typeof scriptEditor>){
 const reviews=ref<Record<string,LanguageReview>>({}),ignoring=ref<Record<string,boolean>>({});let epoch=0,stopped=false,reading=false;const requested=new Set<string>();
 const path=()=>'/api/admin/events/'+editor.s.value?.program.event_id+'/script/language-reviews';
 async function refresh(){if(stopped||!editor.s.value||reading||Object.values(ignoring.value).some(Boolean))return;const current=epoch,event=editor.s.value.program.event_id;reading=true;try{const result=await api<{reviews:LanguageReview[]}>(path());if(!stopped&&epoch===current&&editor.s.value?.program.event_id===event)reviews.value=Object.fromEntries(result.reviews.map(r=>[r.line_id,r]));}catch{/* Feedback polling never interrupts editing or saving. */}finally{reading=false;}}
 function forLine(line:Line){const r=reviews.value[line.id];return r?.line_version===line.version&&sameFields(editor.view(line),line)?r:undefined;}
 const blurred=new Map<string,{event:string;fields:LineFields}>();
 async function submitBlur(id:string){
  const intent=blurred.get(id);if(!intent||stopped||editor.s.value?.program.event_id!==intent.event)return;
  const saved=editor.s.value.lines.find(l=>l.id===id)??editor.creating.value[id]?.line;
  if(!saved||!sameFields(intent.fields,editor.view(saved))){blurred.delete(id);return;}
  if(editor.pending.value[id]||editor.creating.value[id])return;
  blurred.delete(id);if(!sameFields(intent.fields,saved)||!saved.text.trim())return;
  const key=intent.event+':'+saved.id+':'+saved.version;if(requested.has(key)||forLine(saved))return;requested.add(key);const current=epoch;
  try{const review=await api<LanguageReview|null>(path(),{line_id:saved.id,expectedVersion:saved.version});if(review&&!stopped&&epoch===current&&editor.s.value?.program.event_id===intent.event)reviews.value={...reviews.value,[review.line_id]:review};}catch{requested.delete(key);/* A later blur may retry enqueueing; the backend keeps the same identifier. */}
 }
 async function request(line:Line){
  if(stopped||!editor.s.value)return;blurred.set(line.id,{event:editor.s.value.program.event_id,fields:lineFields(editor.view(line))});
  // Keep the blur intent until autosave acknowledges it; provider latency never blocks editing.
  try{await editor.flush();}catch{return;}await submitBlur(line.id);
 }
 watch(()=>[editor.s.value?.seq,Object.keys(editor.pending.value).join(','),Object.keys(editor.creating.value).join(',')],()=>{for(const id of blurred.keys())void submitBlur(id);},{flush:'post'});
 async function ignore(review:LanguageReview,issueNo:number){
  const issue=review.issues.find(i=>i.issue_no===issueNo),key=review.id+':'+issueNo;if(!issue||ignoring.value[key])return;ignoring.value[key]=true;epoch++;issue.ignored=true;
  try{await api(path()+'/'+encodeURIComponent(review.id)+'/ignore',{issue_no:issueNo},'PUT');}catch{issue.ignored=false;notify('W','暂时无法忽略这则提示，请稍后重试。');}finally{ignoring.value[key]=false;void refresh();}
 }
 watch(()=>editor.s.value?.document.id,()=>{epoch++;reviews.value={};requested.clear();blurred.clear();void refresh();});
 const timer=setInterval(()=>void refresh(),5000);onBeforeUnmount(()=>{stopped=true;epoch++;clearInterval(timer);});
 return {reviews,forLine,request,ignore,ignoring,refresh};
}
