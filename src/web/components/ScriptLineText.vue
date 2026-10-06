<script setup lang="ts">
import {computed,nextTick,ref,watch,onMounted} from 'vue';
import type {Character,DialogueSegment} from '../../shared/models';
import type {LineFields} from '../lib/script-reconcile';
import {missingDialogueSpeakers} from '../../shared/dialogue';
import MessageIcon from './MessageIcon.vue';
const props=defineProps<{line:LineFields;id:string;label:string;characters:Character[];disabled?:boolean}>();
const emit=defineEmits<{update:[fields:Partial<LineFields>];keydown:[event:KeyboardEvent,index?:number];composition:[active:boolean];cursor:[index:number,offset:number];blur:[]}>();
const root=ref<HTMLElement>(),cursors:Record<number,number>={};
const kind=computed(()=>props.line.kind??'dialogue');
const parts=computed(()=>props.line.segments??[]);
const missing=computed(()=>missingDialogueSpeakers(props.line));
function requiredMessage(index:number){return props.label+(props.line.segments?'片段 '+(index+1):'')+'：角色为必填项，请选择发言角色。';}
function focusSpeaker(index:number){const target=document.getElementById(props.line.segments?props.id+'-speaker-'+index:'speaker-'+props.id)??root.value?.querySelector('textarea');if(!target)return;target.scrollIntoView({block:'center'});target.focus();if(target.tagName==='SUMMARY')(target.parentElement as HTMLDetailsElement).open=true;}
const name=(id:string)=>props.characters.find(c=>c.id===id)?.display_name??props.characters.find(c=>c.id===id)?.name??'历史角色';
function choices(part:DialogueSegment){return props.characters.filter(c=>(!c.archived&&!c.hidden)||part.speaker_ids.includes(c.id));}
function update(parts:DialogueSegment[]){emit('update',{segments:parts,speaker_id:null,text:parts.map(part=>part.text).join('')});}
function change(index:number,fields:Partial<DialogueSegment>){update(parts.value.map((part,i)=>i===index?{...part,...fields}:part));}
function toggle(index:number,id:string){const part=parts.value[index]!;const selected=part.speaker_ids.includes(id)?part.speaker_ids.filter(value=>value!==id):[...part.speaker_ids,id];change(index,{speaker_ids:props.characters.filter(c=>selected.includes(c.id)).map(c=>c.id)});}
async function focus(index:number){await nextTick();root.value?.querySelectorAll('textarea')[index]?.focus();}
function enable(){update([{text:props.line.text,speaker_ids:props.line.speaker_id?[props.line.speaker_id]:[]}]);void focus(0);}
function append(){const index=parts.value.length;if(index>=50)return;update([...parts.value,{text:'',speaker_ids:[]}]);void focus(index);}
function split(index:number){const part=parts.value[index]!,offset=cursors[index]??part.text.length;if(offset<1||offset>=part.text.length||parts.value.length>=50)return;if(/[\uD800-\uDBFF]/.test(part.text[offset-1]!)&&/[\uDC00-\uDFFF]/.test(part.text[offset]!))return;update([...parts.value.slice(0,index),{...part,text:part.text.slice(0,offset)},{text:part.text.slice(offset),speaker_ids:[]},...parts.value.slice(index+1)]);void focus(index+1);}
function join(index:number){const previous=parts.value[index-1]!,current=parts.value[index]!;if(JSON.stringify(previous.speaker_ids)!==JSON.stringify(current.speaker_ids))return;update([...parts.value.slice(0,index-1),{...previous,text:previous.text+current.text},...parts.value.slice(index+1)]);}
function remember(index:number,event:Event){cursors[index]=(event.target as HTMLTextAreaElement).selectionStart;emit('cursor',index,cursors[index]!);}
function simple(){const part=parts.value[0];if(!part||parts.value.length!==1||part.speaker_ids.length>1)return;emit('update',{segments:undefined,speaker_id:part.speaker_ids[0]??null,text:part.text});}
function leaveSpeakers(event:FocusEvent){if((event.target as HTMLElement).matches('input,select')&&!root.value?.contains(event.relatedTarget as Node|null))emit('blur');}
function resize(){for(const field of root.value?.querySelectorAll('textarea')??[]){field.style.height='auto';field.style.height=Math.min(400,Math.max(44,field.scrollHeight+2))+'px';}}
watch(()=>props.line.text,()=>void nextTick(resize));watch(()=>props.line.segments,()=>void nextTick(resize),{deep:true});onMounted(()=>void nextTick(resize));
</script>

<template><div ref="root" class="line-text-editor" @focusout="leaveSpeakers">
 <template v-if="!line.segments"><FieldLabel>{{ label }}<textarea :id="id" :aria-label="label" :value="line.text" :disabled="disabled" rows="1" maxlength="5000" :placeholder="kind==='heading'?'写下小标题…':kind==='comment'?'写下注释…':'写下一句台词…'" @input="emit('update',{text:($event.target as HTMLTextAreaElement).value})" @keydown="emit('keydown',$event)" @blur="emit('blur')" @compositionstart="emit('composition',true)" @compositionend="emit('composition',false)"></textarea></FieldLabel><details v-if="kind==='dialogue'&&!disabled" class="speech-settings"><summary>发言设置</summary><button type="button" @click="enable">多人 / 分段</button></details><div v-if="missing.includes(0)" class="alert error speaker-required" role="alert" :id="id+'-speaker-error-0'" :data-message-id="'speaker-required:'+id+':0'" :data-message="requiredMessage(0)"><MessageIcon kind="E"/><a href="#" @click.prevent="focusSpeaker(0)">{{ requiredMessage(0) }}</a></div></template>
 <template v-else><div v-for="(part,index) in parts" :key="index" class="speech-part">
  <div class="part-header"><span>片段 {{ index+1 }}</span><details><summary :id="id+'-speaker-'+index" :aria-label="label+'片段 '+(index+1)+'发言角色（必填）'" :aria-invalid="missing.includes(index)||undefined" :aria-describedby="missing.includes(index)?id+'-speaker-error-'+index:undefined">{{ part.speaker_ids.length?part.speaker_ids.map(name).join('、'):'选择发言角色（必填）' }}{{ part.speaker_ids.length>1?' · 合说':'' }}</summary><div class="speaker-options" role="group" :aria-label="label+'片段 '+(index+1)+'发言角色（必填）'" :aria-invalid="missing.includes(index)||undefined"><FieldLabel v-for="c in choices(part)" :key="c.id" class="check"><input type="checkbox" :checked="part.speaker_ids.includes(c.id)" :disabled="disabled" :aria-label="label+'片段 '+(index+1)+'：'+(c.display_name??c.name)" @change="toggle(index,c.id)"><span :style="{'border-left-color':c.color}">{{ c.display_name??c.name }}</span></FieldLabel></div></details></div>
  <div v-if="missing.includes(index)" class="alert error speaker-required" role="alert" :id="id+'-speaker-error-'+index" :data-message-id="'speaker-required:'+id+':'+index" :data-message="requiredMessage(index)"><MessageIcon kind="E"/><a href="#" @click.prevent="focusSpeaker(index)">{{ requiredMessage(index) }}</a></div>
  <FieldLabel>{{ label+'片段 '+(index+1) }}<textarea :id="index===0?id:id+'-segment-'+index" :aria-label="label+'片段 '+(index+1)" :value="part.text" :disabled="disabled" rows="2" :maxlength="5000-line.text.length+part.text.length" placeholder="填写此片段台词" @input="change(index,{text:($event.target as HTMLTextAreaElement).value})" @keydown="emit('keydown',$event,index)" @select="remember(index,$event)" @keyup="remember(index,$event)" @click="remember(index,$event)" @blur="emit('blur')" @compositionstart="emit('composition',true)" @compositionend="emit('composition',false)"></textarea></FieldLabel>
  <div v-if="!disabled" class="part-actions"><button type="button" :disabled="parts.length>=50" @click="split(index)">在光标处分段</button><button v-if="index>0" type="button" :disabled="JSON.stringify(parts[index-1]?.speaker_ids)!==JSON.stringify(part.speaker_ids)" @click="join(index)">合并前片段</button><button v-if="parts.length>1&&!part.text" type="button" @click="update(parts.filter((_,i)=>i!==index))">移除空片段</button></div>
 </div><div v-if="!disabled" class="part-actions"><button type="button" :disabled="parts.length>=50" @click="append">＋ 添加发言片段</button><button v-if="parts.length===1&&parts[0]!.speaker_ids.length<=1" type="button" @click="simple">单人模式</button></div><small class="hint">每个片段可选多人合说；片段按顺序连续组成同一条台词。</small></template>
</div></template>

<style scoped>
.speaker-required{display:flex;align-items:flex-start;gap:8px;margin-top:10px}.speaker-required :deep(.message-icon){flex-shrink:0;margin-top:2px}.speaker-required a{color:inherit;overflow-wrap:anywhere}.part-header summary[aria-invalid="true"]{color:#b3262e}
.line-text-editor{min-width:0}.speech-settings summary{padding:4px 0;font-size:13px}.line-text-editor textarea{min-height:44px;resize:vertical}.speech-part{border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px;background:#fffdf9}
.part-header{display:flex;align-items:baseline;gap:12px;margin-bottom:10px;font-size:13px}.part-header>span{color:var(--muted);flex-shrink:0}.part-header details{flex:1;min-width:0}.part-header summary{cursor:pointer;min-height:32px;overflow-wrap:anywhere}
.speaker-options{display:flex;flex-wrap:wrap;gap:8px 16px;padding:12px 0}.speaker-options label{margin:0;font-size:13px}.speaker-options span{border-left:4px solid;padding-left:7px}.speaker-options input{min-height:auto}
.part-actions{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}.part-actions button{font-size:12px;padding:6px 10px;min-height:36px}.speech-part textarea{margin-bottom:4px}
@media(max-width:760px){.speech-part{padding:10px}.part-header{flex-wrap:wrap}.part-header summary{min-height:44px}.speaker-options{gap:12px}.speaker-options label{min-height:44px}.part-actions button{min-height:44px}}
</style>
