<script setup lang="ts">
import {computed,ref,onBeforeUnmount} from 'vue';
import type {Character,CharacterList} from '../../shared/models';
import {api,ApiError} from '../lib/api';
import {orderCharacters} from '../lib/character-order';
import ModalDialog from './ModalDialog.vue';

const props=defineProps<{eventId:string;list:CharacterList;characters:Character[]}>();
const emit=defineEmits<{close:[];added:[count:number,eventId:string,name:string];busy:[value:boolean]}>();
const eventId=props.eventId,baseline=ref({...props.list,members:[...props.list.members]}),characters=ref([...props.characters]);
const query=ref(''),selected=ref<string[]>([]),busy=ref(false),error=ref(''),notice=ref(''),conflict=ref(false),unavailable=ref(false);
const candidates=computed(()=>orderCharacters(characters.value.filter(c=>c.id!=='aux-narrator'&&!c.archived&&!baseline.value.members.includes(c.id))));
const visible=computed(()=>{const key=query.value.trim().toLocaleLowerCase();return candidates.value.filter(c=>[c.name,c.display_name??'',c.japanese_name,...c.aliases??[]].some(name=>name.toLocaleLowerCase().includes(key)));});
const remaining=computed(()=>Math.max(0,300-baseline.value.members.length));
let previousRequest:{key:string;operation_id:string}|undefined,disposed=false;
onBeforeUnmount(()=>disposed=true);
function setBusy(value:boolean){busy.value=value;if(!disposed)emit('busy',value);}
function close(){if(!busy.value)emit('close');}
async function refresh(){
 if(busy.value)return;
 setBusy(true);error.value='';notice.value='';
 try{
  const snapshot=await api<{characters:Character[];lists:CharacterList[]}>('/api/admin/events/'+eventId+'/characters');
  const current=snapshot.lists.find(l=>l.id===baseline.value.id&&!l.archived);
  if(!current){unavailable.value=true;throw new Error('这个列表已归档或不存在，请关闭后选择其他列表。');}
  baseline.value={...current,members:[...current.members]};characters.value=snapshot.characters;
  const allowed=new Set(candidates.value.map(c=>c.id));selected.value=selected.value.filter(id=>allowed.has(id));
  conflict.value=false;unavailable.value=false;previousRequest=undefined;
  notice.value='列表已刷新，你尚未加入的选择已保留。请核对后添加。';
 }catch(e){error.value=(e as Error).message;}finally{setBusy(false);}
}
async function add(){
 if(busy.value||conflict.value||unavailable.value||!selected.value.length||selected.value.length>remaining.value)return;
 const allowed=new Set(candidates.value.map(c=>c.id)),chosen=selected.value.filter(id=>allowed.has(id));
 if(chosen.length!==selected.value.length){error.value='部分角色已不可用，请刷新列表后重新选择。';return;}
 const list=baseline.value,payload={type:'list.update',id:list.id,expectedVersion:list.version,name:list.name,archived:false,position:list.position,members:[...list.members,...chosen]},key=JSON.stringify(payload);
 if(previousRequest?.key!==key)previousRequest={key,operation_id:crypto.randomUUID()};
 setBusy(true);error.value='';notice.value='';
 try{await api('/api/admin/events/'+eventId+'/characters/operations',{...payload,operation_id:previousRequest.operation_id});if(!disposed)emit('added',chosen.length,eventId,list.name);}
 catch(e){if(e instanceof ApiError&&e.status===409){conflict.value=true;error.value='列表或角色资料已被其他人修改，你的选择已保留。请先刷新列表，核对后再添加。';}else error.value=(e as Error).message;}
 finally{setBusy(false);}
}
</script>

<template><ModalDialog :title="'添加角色到「'+baseline.name+'」'" @close="close">
 <section class="list-member-picker">
  <p class="hint">勾选已有角色，一次添加到当前列表。已在列表中的角色不会重复显示。</p>
  <p v-if="error" class="alert error" role="alert">{{ error }}</p><p v-if="notice" class="alert success" role="status">{{ notice }}</p>
  <FieldLabel>查找角色<input v-model="query" type="search" autofocus :disabled="busy" placeholder="中文名 / 日文名 / 别名" aria-label="查找要加入列表的角色"></FieldLabel>
  <p class="hint" role="status">已选择 {{ selected.length }} 位 · {{ visible.length }} 位可选{{ remaining===0?' · 列表已满，请先移除角色':'' }}</p>
  <div class="member-candidates" role="group" aria-label="可添加的角色" :aria-busy="busy">
   <label v-for="c in visible" :key="c.id" class="member-choice" :class="{selected:selected.includes(c.id)}"><input v-model="selected" type="checkbox" :value="c.id" :disabled="busy||unavailable||(!selected.includes(c.id)&&selected.length>=remaining)" :aria-label="'选择 '+(c.display_name??c.name)"><span class="member-color" :style="{backgroundColor:c.color}" aria-hidden="true"></span><span class="member-name"><strong>{{ c.display_name??c.name }}</strong><small v-if="c.japanese_name">{{ c.japanese_name }}</small><small v-if="c.hidden">已隐藏</small></span></label>
   <p v-if="!visible.length" class="empty">{{ candidates.length?'没有匹配的角色，请修改搜索。':'没有可添加的角色。可在角色库中新增角色。' }}</p>
  </div>
  <div class="member-actions"><button type="button" :disabled="busy" @click="close">取消</button><button type="button" :disabled="busy" @click="refresh">刷新列表</button><button type="button" class="primary" :disabled="busy||conflict||unavailable||!selected.length||selected.length>remaining" @click="add">{{ busy?'正在处理…':'添加已选（'+selected.length+'）' }}</button></div>
 </section>
</ModalDialog></template>

<style scoped>
.list-member-picker{min-width:0}.member-candidates{max-height:38dvh;overflow:auto;border-block:1px solid var(--line);padding:8px 0}.member-choice{display:flex;align-items:center;gap:12px;min-height:54px;margin:4px 0;padding:10px;border:1px solid transparent;border-radius:8px;cursor:pointer}.member-choice:hover{background:#f2f6fb}.member-choice.selected{background:#edf4ff;border-color:#aecbf0}.member-choice input{width:18px;height:18px;min-height:18px;flex-shrink:0;margin:0}.member-color{width:12px;height:28px;border-radius:4px;flex-shrink:0}.member-name{min-width:0;overflow-wrap:anywhere}.member-name strong{display:block;font-size:14px}.member-name small{display:block}.member-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:18px}.empty{padding:16px}.list-member-picker .alert{overflow-wrap:anywhere}
@media(max-width:760px){.member-choice{min-height:48px}.member-actions button{min-height:44px}.member-actions{gap:6px}}
</style>
