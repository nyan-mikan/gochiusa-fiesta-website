<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import type { ManagedUser } from '../../shared/models';
const users=ref<ManagedUser[]>([]),total=ref(0),page=ref(1),pageSize=30,search=ref(''),newEmail=ref(''),busy=ref(false),error=ref(''),success=ref('');
async function load(){const r=await api<{users:ManagedUser[];total:number;page:number}>('/api/admin/users?'+new URLSearchParams({search:search.value,page:String(page.value)}));users.value=r.users;total.value=r.total;}
async function browse(next=1){busy.value=true;error.value='';page.value=next;try{await load();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function change(email:string,role:'admin'|'submitter',version:number|null){
 if(busy.value)return;
 const title=role==='admin'?'任命为管理员':'罢免管理员职务';
 if(!await confirmAction(`${title}：${email}\n${role==='admin'?'该账号将可以审核投稿、编排节目并编辑主持稿。账号仍需通过邮箱验证码登录。':'该账号将恢复为普通投稿者，现有登录会话会失效，投稿和审核记录仍会保留。'}\n普通管理员不能任免其他管理员。`))return;
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
<template><div class="page"><header class="page-head"><div><h1>管理员任免</h1></div></header>
<p v-if="error" class="alert error" role="alert">{{ error }}</p><p v-if="success" class="alert success" role="status">{{ success }}</p>
<section class="paper"><h2>任命管理员</h2><form class="inline" @submit.prevent="appoint"><label class="grow">账号邮箱<input v-model="newEmail" type="email" autocomplete="off" required maxlength="254" placeholder="administrator@example.com" :disabled="busy"></label><button class="primary" :disabled="busy">任命管理员</button></form><p class="hint">可以填写尚未登录本站的邮箱。对方完成邮箱验证后即可使用管理员工作台；普通管理员无法任命新的管理员。</p></section>
<section class="paper"><form class="inline" @submit.prevent="browse()"><label class="grow">搜索账号<input v-model="search" type="search" maxlength="254" placeholder="输入邮箱" :disabled="busy"></label><button :disabled="busy">搜索</button></form>
<div class="table-wrap"><table><thead><tr><th>账号邮箱</th><th>权限</th><th>邮箱验证</th><th>操作</th></tr></thead><tbody><tr v-for="user in users" :key="user.id"><td>{{ user.email }}</td><td><span class="badge">{{ user.is_super_admin?'超级管理员':user.role==='admin'?'管理员':'投稿者' }}</span></td><td>{{ user.verified_at?'已验证':'待首次登录' }}</td><td><span v-if="user.is_super_admin" class="hint">受保护</span><button v-else-if="user.role==='admin'" class="danger" :disabled="busy" @click="change(user.email,'submitter',user.version)">罢免管理员</button><button v-else :disabled="busy" @click="change(user.email,'admin',user.version)">任命管理员</button></td></tr></tbody></table></div><p v-if="!users.length&&!busy" class="empty">没有匹配的账号。</p><div class="pagination"><button :disabled="busy||page===1" @click="browse(page-1)">上一页</button><span class="hint">{{ total }} 个账号 · 第 {{ page }} 页</span><button :disabled="busy||page*pageSize>=total" @click="browse(page+1)">下一页</button></div></section></div></template>
