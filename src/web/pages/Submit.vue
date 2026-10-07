<script setup lang="ts">
import MatchSelect from '../components/MatchSelect.vue';
import DurationPicker from '../components/DurationPicker.vue';import PeopleEditor from '../components/PeopleEditor.vue';import WorkUpload from '../components/WorkUpload.vue';
import {confirmAction} from '../lib/dialog';import {notify} from '../lib/messages';
import { computed,ref,watch,onBeforeUnmount,nextTick } from 'vue';import { useRoute,useRouter,onBeforeRouteLeave } from 'vue-router';
import { catalog,loadCatalog,api,session,statusName,displayTime,duration } from '../lib/api';import { completeSubmission,submissionDraft,programTypes,type SubmissionDraft,type Detail,type UploadedFile } from '../../shared/models';
const deleting=ref(false);
const route=useRoute(),router=useRouter(),d=ref<Detail|null>(null),error=ref(''),message=ref(''),saveState=ref(''),loaded=ref(false),confirmDialog=ref<HTMLDialogElement>(),confirmed=ref(false),submitting=ref(false);
const blank=():SubmissionDraft=>({upload_id:null,type_other:'',category_other:'',title:'',type:'翻唱',description:'',duration_seconds:0,category_id:null,delivery_url:'',access_notes:'',notes:'',contact:{name:'',uid:''},uploader:{name:'',uid:''},contributors:[{name:'',uid:'',role_option_id:null,work_detail:'',role_other:''}]});
const formGeneration=ref(0);const form=ref<SubmissionDraft>(blank()),uploaded=ref<UploadedFile|null>(null),uploading=ref(false);let saved='',timer:ReturnType<typeof setTimeout>|null=null,promise:Promise<void>|null=null;type FieldError={path:(string|number)[];message:string};const errors=ref<FieldError[]>([]),errorSummary=ref<HTMLElement>(),peopleEditor=ref<InstanceType<typeof PeopleEditor>>();
const editable=computed(()=>!deleting.value&&(!d.value||(['draft','rejected'].includes(d.value.submission.status)&&d.value.submission.owner_user_id===session.user?.id)));
const pendingDelivery=ref<UploadedFile|null>(null);let deliveryOperation=crypto.randomUUID();
const canSupplement=computed(()=>!!d.value&&d.value.submission.owner_user_id===session.user?.id&&['pending','approved'].includes(d.value.submission.status)&&!uploaded.value);
const canUpload=computed(()=>(editable.value||canSupplement.value)&&!submitting.value);
const event=computed(()=>catalog.events.find(e=>e.id===(d.value?.submission.event_id??catalog.eventId)));
const categoryOptions=computed(()=>{const options=(catalog.config?.categories??[]).map(c=>({value:c.id,label:c.name}));if(!editable.value&&d.value?.form.category_id&&d.value.category_name&&!options.some(c=>c.value===d.value!.form.category_id))options.push({value:d.value.form.category_id,label:d.value.category_name});return [{value:null,label:'请选择分区'},...options];});
const roles=computed(()=>catalog.config?.roles.filter(r=>r.category_id===form.value.category_id)??[]);
const validationShown=ref(false);
const categoryOther=computed(()=>catalog.config?.categories.find(c=>c.id===form.value.category_id)?.name==='其他');
async function ensureDraft(){if(!editable.value){if(!canSupplement.value)throw new Error('此投稿不能补交视频');return d.value!.submission.id;}await save();if(!d.value){const created=await api<{id:string}>('/api/submissions',{event_id:event.value!.id,operation_id:crypto.randomUUID()});d.value=await api<Detail>('/api/submissions/'+created.id);await router.replace('/submit/'+created.id);}return d.value.submission.id;}
function received(file:UploadedFile){if(!editable.value){pendingDelivery.value=file;deliveryOperation=crypto.randomUUID();return;}uploaded.value=file;form.value.upload_id=file.id;void save().catch(()=>{});}
async function load(){pendingDelivery.value=null;loaded.value=false;error.value='';errors.value=[];validationShown.value=false;try{await loadCatalog();if(route.params.id&&route.params.id!=='new'){d.value=await api<Detail>('/api/submissions/'+route.params.id);form.value=d.value.form;uploaded.value=d.value.uploaded_file??null;catalog.eventId=d.value.submission.event_id;}else{d.value=null;uploaded.value=null;form.value=blank();}formGeneration.value++;saved=JSON.stringify(form.value);if(editable.value){form.value={...form.value,delivery_url:'',access_notes:''};}saveState.value=d.value?'已从服务器恢复':'';}catch(e){error.value=(e as Error).message;}finally{loaded.value=true;}}
watch(()=>route.params.id,id=>{if(id&&id===d.value?.submission.id)return;void load();},{immediate:true});
async function save(){
 if(promise)await promise;if(!editable.value||!loaded.value||JSON.stringify(form.value)===saved)return;
 promise=(async()=>{saveState.value='正在保存…';const body=JSON.stringify(form.value);
  if(!d.value){if(!event.value)throw new Error('请先选择活动');const created=await api<{id:string}>('/api/submissions',{event_id:event.value.id,operation_id:crypto.randomUUID()});d.value=await api<Detail>('/api/submissions/'+created.id);await router.replace('/submit/'+created.id);}
  try{const r=await api<{version:number;revision_id:string}>('/api/submissions/'+d.value.submission.id,{expectedVersion:d.value.submission.version,form:JSON.parse(body)},'PATCH');d.value.submission.version=r.version;if(d.value.revision.id!==r.revision_id){d.value.revision.id=r.revision_id;d.value.revision.revision_no++;d.value.revision.submitted_at=null;}}
  catch(failure){const current=await api<Detail>('/api/submissions/'+d.value.submission.id);const normal=(f:SubmissionDraft)=>{const n=submissionDraft.parse(f);for(const p of [n.contact,n.uploader,...n.contributors])p.uid=p.uid.replace(/^0+/,'');return JSON.stringify(n);};if(normal(current.form)!==normal(JSON.parse(body)))throw failure;d.value=current;}
  saved=body;saveState.value='已保存 · '+new Date().toLocaleTimeString();
 })();try{await promise;}catch(e){saveState.value='保存失败，修改仍保留在本页';error.value=(e as Error).message;throw e;}finally{promise=null;}
 if(JSON.stringify(form.value)!==saved)await save();
}
watch(form,()=>{if(validationShown.value)collectErrors();if(!loaded.value||!editable.value||JSON.stringify(form.value)===saved)return;saveState.value='有未保存修改';if(timer)clearTimeout(timer);timer=setTimeout(()=>void save().catch(()=>{}),1200);},{deep:true});
const fieldNames:Record<string,string>={title:'节目名',type:'节目类型',description:'节目简介',category_id:'B站分区',duration_seconds:'节目时长',delivery_url:'作品交付',type_other:'具体节目类型',category_other:'具体分区',contact:'负责人',uploader:'主投稿账号',contributors:'团队成员'};
function focusError(e:FieldError){if(['contributors','contact','uploader'].includes(String(e.path[0]))){peopleEditor.value?.focusIssue(e.path);return;}const node=document.getElementById('field-'+e.path[0]);node?.focus();node?.scrollIntoView({block:'center'});}
const fieldErrors=(name:string)=>errors.value.filter(e=>e.path[0]===name);
function collectErrors(){errors.value=[];for(const node of document.querySelectorAll<HTMLInputElement>('.submission-page input[role=combobox]'))if(node.validity.customError){const key=node.id.startsWith('field-')?node.id.slice(6):'contributors';const member=Array.from(document.querySelectorAll('.submission-page input[data-field=role_option_id]')).indexOf(node);errors.value.push({path:key==='contributors'?['contributors',member,'role_option_id']:[key],message:(key==='contributors'?`成员 ${member+1} 制作职务`:fieldNames[key]??'投稿资料')+'：'+node.validationMessage});}if(uploading.value)errors.value.push({path:['delivery_url'],message:'请等待作品上传完成'});const r=completeSubmission.safeParse(form.value);if(!r.success)errors.value.push(...r.error.issues.map(e=>({path:e.path as (string|number)[],message:(e.path[0]==='contributors'&&typeof e.path[1]==='number'?`成员 ${e.path[1]+1}（${form.value.contributors[e.path[1]]?.name||'未署名'}）`:fieldNames[String(e.path[0])]??'投稿资料')+'：'+e.message})));if(categoryOther.value&&!form.value.category_other.trim())errors.value.push({path:['category_other'],message:'请说明具体分区'});form.value.contributors.forEach((p,i)=>{if(roles.value.find(r=>r.id===p.role_option_id)?.label==='其他'&&!p.role_other.trim())errors.value.push({path:['contributors',i,'role_other'],message:`成员 ${i+1}：请说明具体职务`});});}
async function commitChoices(){for(const node of document.querySelectorAll<HTMLInputElement>('.submission-page input[role=combobox]'))node.dispatchEvent(new CustomEvent('field-commit'));await nextTick();}
async function saveExplicit(){await commitChoices();const invalid=Array.from(document.querySelectorAll<HTMLInputElement>('.submission-page input[role=combobox]')).find(node=>node.validity.customError);if(invalid){notify('E',invalid.getAttribute('aria-label')+'：'+invalid.validationMessage,invalid);invalid.focus();invalid.scrollIntoView({block:'center'});return;}await save().catch(()=>{});}
async function check(){if(!editable.value||submitting.value||uploading.value)return;await commitChoices();validationShown.value=true;collectErrors();if(errors.value.length){await nextTick();errorSummary.value?.focus();return;}confirmed.value=false;confirmDialog.value?.showModal();}
async function send(){if(submitting.value)return;submitting.value=true;error.value='';try{await save();await api('/api/submissions/'+d.value!.submission.id+'/submit',{expectedVersion:d.value!.submission.version,confirmed:true,operation_id:crypto.randomUUID()});confirmDialog.value?.close();message.value='提交成功，回执已进入通知队列。';await router.replace('/submit/'+d.value!.submission.id);await load();}catch(e){error.value=(e as Error).message;}finally{submitting.value=false;}}
async function supplement(){if(!d.value||!pendingDelivery.value||submitting.value||uploading.value)return;if(!await confirmAction('提交这个视频？提交后不能替换；节目资料和审核结果会保留。'))return;submitting.value=true;error.value='';const file=pendingDelivery.value,formRevision=d.value.revision.id;try{await api('/api/submissions/'+d.value.submission.id+'/delivery',{expectedVersion:d.value.submission.version,expectedRevision:d.value.revision.id,upload_id:file.id,operation_id:deliveryOperation});await load();message.value='视频已补交。';}catch(e){error.value=(e as Error).message;try{const current=await api<Detail>('/api/submissions/'+d.value.submission.id);if(current.uploaded_file?.id===file.id){await load();message.value='视频已补交。';error.value='';}else{d.value=current;uploaded.value=current.uploaded_file??null;if(current.uploaded_file||!['pending','approved'].includes(current.submission.status)||current.revision.id!==formRevision){pendingDelivery.value=null;await load();error.value='投稿状态或作品交付已改变，请核对最新资料。';}deliveryOperation=crypto.randomUUID();}}catch{/* Keep the pending video for retry. */}}finally{submitting.value=false;}}
onBeforeRouteLeave(async()=>{if(pendingDelivery.value&&!await confirmAction('视频尚未提交，确定离开吗？'))return false;if(uploading.value&&!await confirmAction('作品正在上传，离开将中断上传，确定离开？'))return false;if(JSON.stringify(form.value)===saved)return true;try{await save();return true;}catch{return await confirmAction('仍有未保存内容，确定离开吗？');}});
async function deleteDraft(){
 if(!d.value||deleting.value||uploading.value||!await confirmAction('删除这份草稿？删除后无法继续填写，已上传的文件也会被清理。'))return;
 deleting.value=true;error.value='';if(timer)clearTimeout(timer);
 try{if(promise)await promise;await api('/api/submissions/'+d.value.submission.id,{expectedVersion:d.value.submission.version,operation_id:crypto.randomUUID()},'DELETE');saved=JSON.stringify(form.value);await router.push('/submit');}catch(e){error.value=(e as Error).message;deleting.value=false;}
}
function leave(e:BeforeUnloadEvent){if(pendingDelivery.value||uploading.value||(editable.value&&JSON.stringify(form.value)!==saved)){e.preventDefault();e.returnValue='';}}
window.addEventListener('beforeunload',leave);onBeforeUnmount(()=>{if(timer)clearTimeout(timer);window.removeEventListener('beforeunload',leave);});
</script>
<template>
  <div class="page submission-page">
    <header class="page-head"><div><RouterLink class="back" to="/submit">← 我的投稿</RouterLink><h1>{{ d?'投稿详情':'新建投稿' }}</h1></div><span v-if="d" class="badge" :class="d.submission.status">{{ statusName(d.submission.status) }}</span></header>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p><p v-if="message" class="alert success">{{ message }}</p><p v-if="!loaded" class="muted">正在读取资料…</p>
    <template v-else>

      <p v-if="d" class="muted mono">{{ d.submission.public_number }} · 修订 {{ d.revision.revision_no }}</p>
      <section v-if="d?.submission.status==='rejected'&&d.reviews[0]" class="alert warning"><h2>本次需要修改</h2><p>{{ d.reviews[0].reason }}</p></section><details v-if="d?.reviews.length" class="paper"><summary>历史审核记录（{{ d.reviews.length }}）</summary><p v-for="r in d.reviews" :key="r.id"><strong>修订 {{ d.revisions.find(v=>v.id===r.revision_id)?.revision_no??'—' }} · {{ r.action==='reopen'?'退回修改':statusName(r.action) }}</strong><small>{{ displayTime(r.created_at) }}</small>{{ r.reason }}</p></details>
      <p v-for="warning in d?.warnings??[]" :key="warning" class="alert warning">{{ warning }}</p><p v-if="event&&!event.submissions_open" class="alert warning">当前征稿尚未开放或已经结束。你可以保存草稿，开放后再提交。</p>
      <form id="submission-form" novalidate @submit.prevent="check" @field-validated="validationShown&&collectErrors()"><fieldset :disabled="!editable">
        <section class="paper form-section" aria-labelledby="program-heading">
          <header class="form-section-head"><span class="step-number">01</span><div><h2 id="program-heading">节目资料</h2></div></header>
          <FieldLabel v-if="!d">活动<select v-model="catalog.eventId" required><option v-for="e in catalog.events" :key="e.id" :value="e.id">{{ e.name }}</option></select></FieldLabel><p v-else class="event-caption">{{ event?.name }}</p>
          <FieldLabel>节目名 *<input :id="'field-title'" :aria-invalid="fieldErrors('title').length?true:undefined" :aria-describedby="fieldErrors('title').length?'error-title':undefined" v-model="form.title" maxlength="100" required placeholder="作品或节目的名称"><span v-if="fieldErrors('title').length" id="error-title" class="text-danger">{{ fieldErrors('title').map(e=>e.message).join('；') }}</span></FieldLabel>
          <div class="grid two"><FieldLabel>节目类型 *<MatchSelect :id="'field-type'" :aria-invalid="fieldErrors('type').length?true:undefined" :aria-describedby="fieldErrors('type').length?'error-type':undefined" v-model="form.type" label="节目类型" :options="programTypes.map(t=>({value:t,label:t}))" required/><span v-if="fieldErrors('type').length" id="error-type" class="text-danger">{{ fieldErrors('type').map(e=>e.message).join('；') }}</span></FieldLabel><FieldLabel>拟投稿 B站分区 *<MatchSelect :id="'field-category_id'" :aria-invalid="fieldErrors('category_id').length?true:undefined" :aria-describedby="fieldErrors('category_id').length?'error-category_id':undefined" v-model="form.category_id" label="B站分区" :options="categoryOptions" required/><span v-if="fieldErrors('category_id').length" id="error-category_id" class="text-danger">{{ fieldErrors('category_id').map(e=>e.message).join('；') }}</span></FieldLabel></div>
          <div v-if="form.type==='其他'||categoryOther" class="grid two"><FieldLabel v-if="form.type==='其他'">具体节目类型 *<input :id="'field-type_other'" :aria-invalid="fieldErrors('type_other').length?true:undefined" :aria-describedby="fieldErrors('type_other').length?'error-type_other':undefined" v-model="form.type_other" required maxlength="100" placeholder="请说明节目类型"><span v-if="fieldErrors('type_other').length" id="error-type_other" class="text-danger">{{ fieldErrors('type_other').map(e=>e.message).join('；') }}</span></FieldLabel><FieldLabel v-if="categoryOther">具体分区 *<input :id="'field-category_other'" :aria-invalid="fieldErrors('category_other').length?true:undefined" :aria-describedby="fieldErrors('category_other').length?'error-category_other':undefined" v-model="form.category_other" required maxlength="100" placeholder="请说明作品所属分区"><span v-if="fieldErrors('category_other').length" id="error-category_other" class="text-danger">{{ fieldErrors('category_other').map(e=>e.message).join('；') }}</span></FieldLabel></div>
          <FieldLabel>节目简介 *<textarea :id="'field-description'" :aria-invalid="fieldErrors('description').length?true:undefined" :aria-describedby="fieldErrors('description').length?'error-description':undefined" v-model="form.description" rows="3" maxlength="1000" required placeholder="介绍作品内容、创作想法或舞台呈现。"></textarea><span v-if="fieldErrors('description').length" id="error-description" class="text-danger">{{ fieldErrors('description').map(e=>e.message).join('；') }}</span></FieldLabel>
        </section>
      </fieldset>
        <section class="paper form-section" aria-labelledby="delivery-heading">
          <header class="form-section-head"><span class="step-number">02</span><div><h2 id="delivery-heading">作品交付</h2><p>只支持上传视频。可以先提交节目资料，再到此页补交视频。</p></div></header>
          <p v-if="!uploaded&&!pendingDelivery" class="hint">视频尚未交付。</p>
          <p v-if="canSupplement" class="hint">上传完成后，点击底部的「提交视频」。已提交的节目资料和审核结果会保留。</p>
          <p v-if="d?.delivery_at" class="hint">视频补交于 {{ displayTime(d.delivery_at) }}</p>
          <WorkUpload v-if="catalog.config?.uploads_enabled||uploaded" :ensure-draft="ensureDraft" :file="pendingDelivery??uploaded" :disabled="!canUpload||!catalog.config?.uploads_enabled" @uploaded="received" @duration="editable&&(form.duration_seconds=$event)" @busy="uploading=$event" @remove="editable?(uploaded=null,form.upload_id=null):pendingDelivery=null"/>
          <fieldset :disabled="!editable"><p v-if="editable&&!uploaded" class="hint">视频尚未完成时，请先填写预计节目时长。</p><DurationPicker id="field-duration_seconds" :invalid="!!fieldErrors('duration_seconds').length" :error-id="fieldErrors('duration_seconds').length?'error-duration':undefined" v-model="form.duration_seconds" required/><p v-if="fieldErrors('duration_seconds').length" id="error-duration" class="text-danger">{{ fieldErrors('duration_seconds')[0]?.message }}</p></fieldset>
        </section>
      <fieldset :disabled="!editable">
        <section class="paper form-section" aria-labelledby="people-heading">
          <header class="form-section-head"><span class="step-number">03</span><div><h2 id="people-heading">团队成员与署名</h2><p>填写成员，标记身份与制作职务。</p></div></header>
          <PeopleEditor ref="peopleEditor" :key="formGeneration" :errors="errors" :form="form" :roles="roles" :labels="d?.role_labels" :editable="editable" @change="Object.assign(form,$event)"/>
          <p class="feedback-email">回执与审核反馈将发送至 <strong>{{ d?.revision.feedback_email??session.user?.email }}</strong></p>
          <details class="optional-fields" :open="!!form.notes"><summary>投稿备注（可选）</summary><FieldLabel>补充说明<textarea v-model="form.notes" rows="3" maxlength="1000" placeholder="需要向审核团队说明的事项"></textarea></FieldLabel></details>
        </section>
        <section v-if="errors.length" ref="errorSummary" tabindex="-1" class="alert error" role="alert" aria-label="请检查投稿资料"><h2>请修正以下 {{ errors.length }} 项</h2><ul><li v-for="(issue,i) in errors" :key="i"><a href="#" @click.prevent="focusError(issue)">{{ issue.message }}</a></li></ul></section>
        <PageActions v-if="editable" :status="saveState||'修改会自动保存'"><button v-if="d?.submission.status==='draft'&&d.submission.owner_user_id===session.user?.id" type="button" class="danger delete-draft" :disabled="deleting||uploading||submitting" @click="deleteDraft">{{ deleting?'正在删除…':'删除草稿' }}</button><button type="button" :disabled="deleting||uploading||submitting" @click="saveExplicit">保存草稿</button><button type="submit" form="submission-form" class="primary" :disabled="!event?.submissions_open||uploading||deleting||submitting">检查并提交</button></PageActions>
      </fieldset></form>
      <PageActions v-if="canSupplement" :status="pendingDelivery?'视频已上传，等待提交':'可以稍后补交视频'"><button class="primary" type="button" :disabled="!pendingDelivery||uploading||submitting" @click="supplement">{{ submitting?'正在提交…':'提交视频' }}</button></PageActions>
      <p v-if="!editable" class="muted">当前资料为只读。驳回后可在同一投稿编号下修改并重交。</p>
    </template>
<dialog ref="confirmDialog"><form @submit.prevent="send"><h2>确认投稿</h2><p v-if="!form.upload_id" class="hint">本次先提交节目资料，视频可稍后在投稿详情中补交。</p><h3>{{ form.title }}</h3><p>{{ form.type==='其他'?form.type_other:form.type }} · {{ duration(form.duration_seconds) }} · {{ form.contributors.length }} 位制作人员</p><p>负责人：{{ form.contact.name }}（{{ form.contact.uid }}）<br>主投稿：{{ form.uploader.name }}（{{ form.uploader.uid }}）</p><ul><li v-for="(p,i) in form.contributors" :key="i">{{ p.name }} · UID {{ p.uid }} · {{ roles.find(r=>r.id===p.role_option_id)?.label }}{{ p.role_other?'：'+p.role_other:'' }} {{ p.work_detail }}</li></ul><FieldLabel class="check"><input v-model="confirmed" type="checkbox" required>我确认资料准确，团队成员已知情。本确认不代替 B站的联投邀请确认。</FieldLabel><p v-if="error" class="alert error">{{ error }}</p><div class="dialog-actions"><button type="button" :disabled="submitting" @click="confirmDialog?.close()">返回修改</button><button class="primary" :disabled="!confirmed||submitting">{{ submitting?'提交中…':'确认提交' }}</button></div></form></dialog>
  </div>
</template>
<style scoped>
.page-head{margin-bottom:26px}
.page-head h1{font-size:32px}
.form-section{padding:28px;margin-bottom:20px}
.form-section-head{display:flex;gap:14px;align-items:flex-start;border-bottom:1px solid #eee4dd;padding-bottom:18px;margin-bottom:22px}
.step-number{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:50%;background:#eee3d9;color:#9a705d;font-size:12px;margin-top:2px}
.form-section-head h2{margin:0 0 4px;font-size:19px}
.form-section-head p{margin:0;color:#72615b;font-size:13px;line-height:1.8}
.event-caption{color:#72615b;font-size:13px;margin:0 0 18px}
.optional-fields{font-size:13px;border-top:1px solid #eee4dd;margin-top:16px;padding-top:14px}
.optional-fields summary{cursor:pointer;color:#78675f;padding:4px 0}
.optional-fields label{margin:14px 0 0}
.feedback-email{color:#72615b;font-size:12px;line-height:1.8;margin:18px 0 0;overflow-wrap:anywhere}
.feedback-email strong{font-weight:500;color:#78675f}
@media(max-width:760px){.form-section{padding:20px}.page-head h1{font-size:28px}.form-section-head{gap:10px}}
</style>
