<script setup lang="ts">
import {ref,watch} from 'vue';import type {SubmissionDraft,RoleOption} from '../../shared/models';
const props=defineProps<{form:SubmissionDraft;roles:RoleOption[];labels?:Record<string,string>;editable:boolean;errors?:{path:(string|number)[];message:string}[]}>();const emit=defineEmits<{change:[people:Pick<SubmissionDraft,'contact'|'uploader'|'contributors'>]}>();
type Person=SubmissionDraft['contributors'][number]&{key:string;staff:boolean};
const rows=ref<Person[]>(props.form.contributors.map(p=>({...p,key:crypto.randomUUID(),staff:true})));const contact=ref(''),uploader=ref('');
function find(p:{uid:string;name:string}){if(!p.uid.trim()&&!p.name.trim())return '';let row=rows.value.find(r=>p.uid?r.uid.replace(/^0+/,'')===p.uid.replace(/^0+/,''):r.name===p.name);if(!row){row={...p,key:crypto.randomUUID(),staff:false,role_option_id:null,work_detail:'',role_other:''};rows.value.push(row);}return row.key;}
contact.value=find(props.form.contact);uploader.value=find(props.form.uploader);
function sync(){const c=rows.value.find(r=>r.key===contact.value),u=rows.value.find(r=>r.key===uploader.value);emit('change',{contact:{name:c?.name??'',uid:c?.uid??''},uploader:{name:u?.name??'',uid:u?.uid??''},contributors:rows.value.filter(r=>r.staff).map(({key,staff,...p})=>p)});}
watch([rows,contact,uploader],sync,{deep:true});
function add(){rows.value.push({key:crypto.randomUUID(),name:'',uid:'',staff:true,role_option_id:null,work_detail:'',role_other:''});}
function move(i:number,d:number){const j=i+d;if(j<0||j>=rows.value.length)return;[rows.value[i],rows.value[j]]=[rows.value[j]!,rows.value[i]!];}
const root=ref<HTMLElement>(),removed=ref<{row:Person;index:number;contact:boolean;uploader:boolean}[]>([]);
function remove(p:Person){removed.value.push({row:structuredClone({...p}),index:rows.value.indexOf(p),contact:contact.value===p.key,uploader:uploader.value===p.key});rows.value=rows.value.filter(r=>r.key!==p.key);if(contact.value===p.key)contact.value='';if(uploader.value===p.key)uploader.value='';}
function undo(){const old=removed.value.pop();if(!old)return;rows.value.splice(old.index,0,old.row);if(old.contact&&!contact.value)contact.value=old.row.key;if(old.uploader&&!uploader.value)uploader.value=old.row.key;}
function issues(p:Person){const index=rows.value.filter(r=>r.staff).findIndex(r=>r.key===p.key);return props.errors?.filter(e=>e.path[0]==='contributors'&&e.path[1]===index)??[];}
function focusIssue(path:(string|number)[]){let element:HTMLElement|null=null;if(path[0]==='contributors'){const row=rows.value.filter(r=>r.staff)[Number(path[1]??0)];if(row)element=root.value?.querySelector(`[data-member="${row.key}"] [data-field="${['uid','role_option_id','role_other'].includes(String(path[2]))?path[2]:'name'}"]`)??null;}else element=root.value?.querySelector(`[data-field="${path[0]}"]`)??null;(element??root.value)?.focus();element?.scrollIntoView({block:'center'});}
defineExpose({focusIssue});
watch(()=>props.roles,()=>{if(props.editable)for(const p of rows.value)if(p.role_option_id&&!props.roles.some(r=>r.id===p.role_option_id)){p.role_option_id=null;p.role_other='';}});
const roleLabel=(p:Person)=>props.roles.find(r=>r.id===p.role_option_id)?.label??props.labels?.[p.role_option_id??''];
</script>
<template>
  <div ref="root" class="people-editor" tabindex="-1">
 <p class="member-status" role="status">负责人：{{ rows.find(r=>r.key===contact)?.name||'未选择' }} · 主投稿账号：{{ rows.find(r=>r.key===uploader)?.name||'未选择' }}</p><p v-if="removed.length" class="alert" role="status">已移除 {{ removed.at(-1)?.row.name||'成员' }}。<button type="button" @click="undo">撤销移除</button></p>
    <p class="people-hint">每人填写一次。负责人和主投稿账号各选一人，可由同一人担任；再次点击可取消。</p>
    <article v-for="(p,i) in rows" :key="p.key" class="member-card" :data-member="p.key" :aria-label="'成员 '+(i+1)">
      <header class="member-head">
        <strong>{{ p.name || '成员 '+(i+1) }}</strong>
        <div v-if="editable" class="member-actions">
          <button type="button" :disabled="i===0" aria-label="上移成员" @click="move(i,-1)">↑</button>
          <button type="button" :disabled="i===rows.length-1" aria-label="下移成员" @click="move(i,1)">↓</button>
          <button type="button" class="text-button" @click="remove(p)">移除</button>
        </div>
      </header>
      <div class="member-fields">
        <label>B站名称 *<input data-field="name" :aria-invalid="issues(p).length?true:undefined" :aria-describedby="issues(p).length?'member-error-'+p.key:undefined" v-model="p.name" required maxlength="100" placeholder="成员的公开署名"></label>
        <label>B站 UID *<input data-field="uid" :aria-invalid="issues(p).length?true:undefined" :aria-describedby="issues(p).length?'member-error-'+p.key:undefined" v-model="p.uid" required inputmode="numeric" pattern="[0-9]+" maxlength="40" placeholder="数字 UID"><a v-if="/^[0-9]+$/.test(p.uid)" :href="'https://space.bilibili.com/'+p.uid" target="_blank" rel="noopener noreferrer" class="hint">核对空间 ↗</a></label>
        <label v-if="p.staff">制作职务 *<select data-field="role_option_id" :aria-invalid="issues(p).some(e=>e.path[2]==='role_option_id')||undefined" :aria-describedby="issues(p).length?'member-error-'+p.key:undefined" v-model="p.role_option_id" required><option :value="null">{{ roles.length?'请选择职务':'请先选择作品分区' }}</option><option v-if="p.role_option_id&&!roles.some(r=>r.id===p.role_option_id)" :value="p.role_option_id">{{ editable?'原职务不适用，请重新选择':roleLabel(p)??'历史职务' }}</option><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.label }}</option></select></label>
      </div>
      <p v-if="issues(p).length" :id="'member-error-'+p.key" class="text-danger">{{ issues(p).map(e=>e.message).join('；') }}</p><div class="member-flags">
        <label class="check" :class="{selected:contact===p.key}"><input type="checkbox" data-field="contact" :aria-invalid="errors?.some(e=>e.path[0]==='contact')||undefined" :checked="contact===p.key" @change="contact=($event.target as HTMLInputElement).checked?p.key:''">负责人</label>
        <label class="check" :class="{selected:uploader===p.key}"><input type="checkbox" data-field="uploader" :aria-invalid="errors?.some(e=>e.path[0]==='uploader')||undefined" :checked="uploader===p.key" @change="uploader=($event.target as HTMLInputElement).checked?p.key:''">主投稿账号</label>
        <label class="check" :class="{selected:p.staff}"><input v-model="p.staff" type="checkbox">参与制作</label>
      </div>
      <template v-if="p.staff">
        <label v-if="roleLabel(p)==='其他'">具体职务 *<input data-field="role_other" :aria-invalid="issues(p).some(e=>e.path[2]==='role_other')||undefined" :aria-describedby="issues(p).length?'member-error-'+p.key:undefined" v-model="p.role_other" required maxlength="100" placeholder="请填写你负责的工作"></label>
        <details class="member-detail" :open="!!p.work_detail"><summary>补充分工（可选）</summary><label class="detail-field">分工说明<input v-model="p.work_detail" maxlength="500" placeholder="例如：中文填词、混音、PV 合成"></label></details>
      </template>
    </article>
    <button v-if="editable" type="button" class="add-member" @click="add">＋ 添加成员</button>
  </div>
</template>
<style scoped>
.people-hint{font-size:13px;color:#72615b;line-height:1.8;margin:0 0 18px}
.member-card{border:1px solid #e8ddd5;border-radius:10px;padding:20px;margin-bottom:14px;background:#faf7f2}
.member-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.member-head strong{font-size:15px;overflow-wrap:anywhere}
.member-actions{display:flex;gap:6px;flex-shrink:0}
.member-actions button{padding:5px 9px;font-size:12px}
.member-fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.member-fields label{margin-bottom:8px;min-width:0}
.member-flags{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 0}
.member-flags .check{padding:7px 10px;border:1px solid #e8ddd5;border-radius:6px;margin:0;background:#fffdf9;font-size:13px;cursor:pointer}
.member-flags .selected{background:#efe6ec;border-color:#bba5b1;color:#755563}
.member-card>label{margin-top:16px;margin-bottom:0}
.member-detail{font-size:13px;margin-top:14px;color:#72615b}
.member-detail summary{cursor:pointer;padding:4px 0}
.detail-field{margin:10px 0 0;color:#514644}
.add-member{width:100%;border-style:dashed;background:transparent;margin-top:2px}
@media(max-width:1050px){.member-fields{grid-template-columns:1fr 1fr}.member-fields>label:last-child:nth-child(3){grid-column:1/-1}}
@media(max-width:560px){.member-card{padding:16px}.member-fields{grid-template-columns:1fr;gap:6px}.member-flags{gap:6px}.member-flags .check{padding:7px 8px}.member-head{align-items:flex-start}}
</style>
