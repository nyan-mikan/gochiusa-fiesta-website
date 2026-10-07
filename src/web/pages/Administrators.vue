<script setup lang="ts">
import ModalDialog from '../components/ModalDialog.vue';
import {modules,type ModuleId} from '../../shared/modules';
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import type { ManagedUser } from '../../shared/models';
const editing=ref<ManagedUser|null>(null),selectedModules=ref<ModuleId[]>([]);
function editModules(user:ManagedUser){editing.value=user;selectedModules.value=[...user.modules];}
async function saveModules(){if(!editing.value||busy.value)return;busy.value=true;error.value='';try{await api('/api/admin/users/modules',{user_id:editing.value.id,expected_version:editing.value.version,modules:selectedModules.value,operation_id:crypto.randomUUID()},'PUT');editing.value=null;success.value='模块权限已保存，该账号需重新登录。';await load();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
const users=ref<ManagedUser[]>([]),total=ref(0),page=ref(1),pageSize=30,search=ref(''),newEmail=ref(''),busy=ref(false),error=ref(''),success=ref('');
async function load(){const r=await api<{users:ManagedUser[];total:number;page:number}>('/api/admin/users?'+new URLSearchParams({search:search.value,page:String(page.value)}));users.value=r.users;total.value=r.total;}
async function browse(next=1){busy.value=true;error.value='';page.value=next;try{await load();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function change(email:string,role:'admin'|'submitter',version:number|null){
 if(busy.value)return;
 const title=role==='admin'?'任命为管理员':'罢免管理员职务';
 if(!await confirmAction(`${title}：${email}\n${role==='admin'?'该账号将成为管理员，请随后分配需要使用的管理模块。账号仍需通过邮箱验证码登录。':'该账号将恢复为普通投稿者，现有登录会话会失效，投稿和审核记录仍会保留。'}\n普通管理员不能任免其他管理员。`))return;
 busy.value=true;error.value='';success.value='';
 try{await api('/api/admin/users/role',{email,role,expected_version:version,operation_id:crypto.randomUUID()},'PUT');success.value=`已${role==='admin'?'任命':'罢免'} ${email}。`;newEmail.value='';await load();}
 catch(e){error.value=(e as Error).message;try{await load();}catch{}}
 finally{busy.value=false;}
}
async function appoint(){
 const email=newEmail.value.trim().toLowerCase();if(!email)return;
 busy.value=true;error.value='';
 let found:ManagedUser|undefined;
 try{const r=await api<{users:ManagedUser[]}>('/api/admin/users?'+new URLSearchParams({search:email}));found=r.users.find(u=>u.email.toLowerCase()===email);}
 catch(e){error.value=(e as Error).message;busy.value=false;return;}
 busy.value=false;
 if(found?.is_super_admin){error.value='该账号已经是超级管理员。';return;}
 if(found?.role==='admin'){error.value='该账号已经是管理员。';return;}
 await change(email,'admin',found?.version??null);
}
onMounted(()=>browse());
</script>
<template><div class="page"><header class="page-head"><div><h1>管理员与权限</h1></div></header>
<p v-if="error" class="alert error" role="alert">{{ error }}</p><p v-if="success" class="alert success" role="status">{{ success }}</p>
<section class="paper"><h2>任命管理员</h2><form id="admin-appointment-form" class="inline" @submit.prevent="appoint"><FieldLabel class="grow">账号邮箱<input v-model="newEmail" type="email" autocomplete="off" required maxlength="254" placeholder="administrator@example.com" :disabled="busy"></FieldLabel><PageActions><button type="submit" form="admin-appointment-form" class="primary" :disabled="busy">任命管理员</button></PageActions></form><p class="hint">可以填写尚未登录本站的邮箱。对方完成邮箱验证后即可使用管理员工作台；普通管理员无法任命新的管理员。</p></section>
<section class="paper"><form class="inline" @submit.prevent="browse()"><FieldLabel class="grow">搜索账号<input v-model="search" type="search" maxlength="254" placeholder="输入邮箱" :disabled="busy"></FieldLabel><button :disabled="busy">搜索</button></form>
<div class="table-wrap"><table class="accounts-table"><thead><tr><th>账号邮箱</th><th>权限</th><th>邮箱验证</th><th>操作</th></tr></thead><tbody><tr v-for="user in users" :key="user.id"><td data-label="账号邮箱">{{ user.email }}</td><td data-label="权限"><span class="badge">{{ user.is_super_admin?'超级管理员':user.role==='admin'?'管理员':'投稿者' }}</span></td><td data-label="邮箱验证">{{ user.verified_at?'已验证':'待首次登录' }}</td><td data-label="操作"><span v-if="user.is_super_admin" class="hint">受保护</span><template v-else-if="user.role==='admin'"><button :disabled="busy" @click="editModules(user)">模块权限</button><button class="danger" :disabled="busy" @click="change(user.email,'submitter',user.version)">罢免管理员</button></template><button v-else :disabled="busy" @click="change(user.email,'admin',user.version)">任命管理员</button></td></tr></tbody></table></div><p v-if="!users.length&&!busy" class="empty">没有匹配的账号。</p><div class="pagination"><button :disabled="busy||page===1" @click="browse(page-1)">上一页</button><span class="hint">{{ total }} 个账号 · 第 {{ page }} 页</span><button :disabled="busy||page*pageSize>=total" @click="browse(page+1)">下一页</button></div></section><ModalDialog v-if="editing" :title="editing.email+' · 模块权限'" @close="editing=null"><form @submit.prevent="saveModules"><p class="hint">仅勾选需要使用的管理模块。保存后撤销该账号原登录会话，已有业务记录保留。</p><FieldLabel v-for="module in modules" :key="module.id" class="check"><input v-model="selectedModules" type="checkbox" :value="module.id" :disabled="busy">{{ module.name }}</FieldLabel><p v-if="error" class="alert error" role="alert">{{ error }}</p><div class="dialog-actions"><button type="button" :disabled="busy" @click="editing=null">取消</button><button class="primary" :disabled="busy">保存模块权限</button></div></form></ModalDialog></div></template>

<style scoped>
@media(max-width:760px){.table-wrap{overflow:visible}.accounts-table,.accounts-table tbody{display:block;width:100%}.accounts-table thead{display:none}.accounts-table tr{display:block;border:1px solid var(--line);border-radius:10px;margin:12px 0;padding:12px}.accounts-table td{display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;border:0;overflow-wrap:anywhere;white-space:normal}.accounts-table td::before{content:attr(data-label);flex:0 0 100%;font-size:12px;color:var(--muted)}.accounts-table button{white-space:normal;min-height:44px}}
</style>
