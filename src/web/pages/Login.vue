<script setup lang="ts">
import { ref,shallowRef,nextTick,onBeforeUnmount } from 'vue';import { useRouter,useRoute } from 'vue-router';
import { api,session,identity } from '../lib/api';import type { User } from '../../shared/models';
import FileDropzone from '../components/FileDropzone.vue';
import {readLoginKey,checkChallenge,sign,type KeyChallenge} from '../lib/private-key';
const mode=ref<'email'|'key'>('email'),loginKey=shallowRef<Awaited<ReturnType<typeof readLoginKey>>|null>(null);
const codeInput=ref<HTMLInputElement>(),cooldown=ref(0);let cooldownTimer:ReturnType<typeof setInterval>|undefined;onBeforeUnmount(()=>{clearInterval(cooldownTimer);loginKey.value=null;});
const email=ref(''),code=ref(''),challenge=ref(''),error=ref(''),busy=ref(false),sent=ref(false);const router=useRouter(),route=useRoute();
async function send(){busy.value=true;error.value='';try{const r=await api<{challenge_id:string}>('/api/auth/code',{email:email.value});challenge.value=r.challenge_id;sent.value=true;code.value='';cooldown.value=60-Math.floor(Date.now()/1000)%60;clearInterval(cooldownTimer);cooldownTimer=setInterval(()=>{cooldown.value=Math.max(0,cooldown.value-1);if(!cooldown.value)clearInterval(cooldownTimer);},1000);await nextTick();codeInput.value?.focus();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function finish(user:User){session.user=user;session.loaded=false;await identity();const next=String(route.query.next??'');await router.push(next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/login')&&(user.role==='admin'||!next.startsWith('/admin'))?next:user.role==='admin'?'/admin/submissions':'/submit');}
async function verify(){busy.value=true;error.value='';try{const r=await api<{user:User}>('/api/auth/verify',{challenge_id:challenge.value,code:code.value});await finish(r.user);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function selectKey(file:File){busy.value=true;error.value='';loginKey.value=null;try{loginKey.value=await readLoginKey(file);}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function keyLogin(){if(!loginKey.value||busy.value)return;busy.value=true;error.value='';try{const {keyId,key}=loginKey.value;const proof=await api<KeyChallenge>('/api/auth/key/challenge',{key_id:keyId});checkChallenge(proof,'login-private-key',keyId);const result=await api<{user:User}>('/api/auth/key/verify',{challenge_id:proof.challenge_id,signature:await sign(key,proof.message)});loginKey.value=null;await finish(result.user);}catch(e){error.value=(e as Error).message+'。私钥失效或丢失时，请使用邮箱登录后重新生成。';}finally{busy.value=false;}}
function switchMode(value:'email'|'key'){mode.value=value;error.value='';loginKey.value=null;}
</script>
<style scoped>
.login-methods{display:flex;gap:8px;margin-bottom:24px}.login-methods button{border-radius:10px;padding:10px 16px}.login-methods .selected{background:var(--plum);color:white}.key-login{margin:20px 0 12px}
:global(html:has(.login-page)) {
  scrollbar-gutter: auto;
}

.login-page {
  max-width: none;
  padding: 16px;
  gap: 16px;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
}

.login-hero {
  border-radius: 20px;
}

@media (max-width: 760px) {
  .login-page {
    padding: 12px;
    gap: 12px;
    grid-template-columns: minmax(0, 1fr);
  }

  .login-hero {
    border-radius: 16px;
  }
}
</style>
<template><div class="login-page"><section class="login-hero"><div class="login-brand"><span class="fiesta-logo"><img src="/images/gochiusa-new-year-fiesta.png" alt="点兔贺年祭 Logo"></span><p class="eyebrow">Gochiusa New Year Fiesta</p></div><span class="edition">点兔贺年祭</span><h1>可爱如繁花绽放</h1><p class="lede">2027 点兔贺年祭正在征稿，欢迎投稿。</p><div class="login-art" aria-hidden="true"><svg viewBox="0 0 180 170"><path d="M58 87C23 9 52-17 74 79M103 78C108-17 147 0 123 89M49 95C24 132 43 162 88 162S151 132 126 95C108 76 68 76 49 95Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="69" cy="117" r="3"/><circle cx="108" cy="117" r="3"/><path d="m85 131 5 4 5-4" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>こころぴょんぴょん待ち？</span></div></section><section class="login-panel"><div class="login-methods" aria-label="登录方式"><button type="button" :class="{selected:mode==='email'}" :aria-pressed="mode==='email'" :disabled="busy" @click="switchMode('email')">邮箱登录</button><button type="button" :class="{selected:mode==='key'}" :aria-pressed="mode==='key'" :disabled="busy" @click="switchMode('key')">私钥登录</button></div><h2>{{ mode==='email'?'邮箱登录':'私钥登录' }}</h2><p v-if="mode==='email'" class="muted">使用邮箱验证码登录。审核反馈也会发送到这个邮箱。</p><form v-if="mode==='email'" @submit.prevent="sent?verify():send()"><label>邮箱地址<input v-model="email" type="email" autocomplete="email" required :readonly="sent" placeholder="you@example.com"></label><label v-if="sent">验证码<input ref="codeInput" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 位数字"><span class="hint">已发送至 {{ email }}，10 分钟内有效。</span></label><p v-if="error" class="alert error" role="alert">{{ error }}</p><button class="primary wide" :disabled="busy">{{ busy?'正在处理…':sent?'登录':'发送验证码' }}</button><div v-if="sent" class="inline"><button type="button" class="text-button" :disabled="busy||cooldown>0" @click="send">{{ cooldown?cooldown+' 秒后可重发':'重新发送验证码' }}</button><button type="button" class="text-button" :disabled="busy" @click="sent=false;code='';error=''">修改邮箱</button></div></form><form v-else @submit.prevent="keyLogin"><p class="muted">选择账号设置中下载的私钥文件。文件只在本机读取，登录时仅发送签名。</p><FileDropzone label="私钥文件" hint="选择本站生成的 JSON 私钥文件，最大 4 KiB。" accept=".json" :disabled="busy" @selected="selectKey"/><p v-if="loginKey" class="hint" role="status">私钥已读取，可以登录。</p><p v-if="error" class="alert error" role="alert">{{ error }}</p><button class="primary wide key-login" :disabled="busy||!loginKey">{{ busy?'正在处理…':'使用私钥登录' }}</button><button type="button" class="text-button" :disabled="busy" @click="switchMode('email')">私钥丢失？使用邮箱登录</button></form><p class="hint">只收集活动所需的信息。作品链接与联系方式仅本人和活动管理员可见。</p></section></div></template>
