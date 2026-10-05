<script setup lang="ts">
import { ref,nextTick,onBeforeUnmount } from 'vue';import { useRouter,useRoute } from 'vue-router';
import { api,session,identity } from '../lib/api';import type { User } from '../../shared/models';
const codeInput=ref<HTMLInputElement>(),cooldown=ref(0);let cooldownTimer:ReturnType<typeof setInterval>|undefined;onBeforeUnmount(()=>clearInterval(cooldownTimer));
const email=ref(''),code=ref(''),challenge=ref(''),error=ref(''),busy=ref(false),sent=ref(false);const router=useRouter(),route=useRoute();
async function send(){busy.value=true;error.value='';try{const r=await api<{challenge_id:string}>('/api/auth/code',{email:email.value});challenge.value=r.challenge_id;sent.value=true;code.value='';cooldown.value=60-Math.floor(Date.now()/1000)%60;clearInterval(cooldownTimer);cooldownTimer=setInterval(()=>{cooldown.value=Math.max(0,cooldown.value-1);if(!cooldown.value)clearInterval(cooldownTimer);},1000);await nextTick();codeInput.value?.focus();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
async function verify(){busy.value=true;error.value='';try{const r=await api<{user:User}>('/api/auth/verify',{challenge_id:challenge.value,code:code.value});session.user=r.user;session.loaded=false;await identity();const next=String(route.query.next??'');await router.push(next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/login')&&(r.user.role==='admin'||!next.startsWith('/admin'))?next:r.user.role==='admin'?'/admin/submissions':'/submit');}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
</script>
<style scoped>
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
<template><div class="login-page"><section class="login-hero"><div class="login-brand"><span class="fiesta-logo"><img src="/images/gochiusa-new-year-fiesta.png" alt="点兔贺年祭 Logo"></span><p class="eyebrow">Gochiusa New Year Fiesta</p></div><span class="edition">点兔贺年祭</span><h1>可爱如繁花绽放</h1><p class="lede">2027 点兔贺年祭正在征稿，欢迎投稿。</p><div class="login-art" aria-hidden="true"><svg viewBox="0 0 180 170"><path d="M58 87C23 9 52-17 74 79M103 78C108-17 147 0 123 89M49 95C24 132 43 162 88 162S151 132 126 95C108 76 68 76 49 95Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="69" cy="117" r="3"/><circle cx="108" cy="117" r="3"/><path d="m85 131 5 4 5-4" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>こころぴょんぴょん待ち？</span></div></section><section class="login-panel"><h2>邮箱登录</h2><p class="muted">使用邮箱验证码登录。审核反馈也会发送到这个邮箱。</p><form @submit.prevent="sent?verify():send()"><label>邮箱地址<input v-model="email" type="email" autocomplete="email" required :readonly="sent" placeholder="you@example.com"></label><label v-if="sent">验证码<input ref="codeInput" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 位数字"><span class="hint">已发送至 {{ email }}，10 分钟内有效。</span></label><p v-if="error" class="alert error" role="alert">{{ error }}</p><button class="primary wide" :disabled="busy">{{ busy?'正在处理…':sent?'登录':'发送验证码' }}</button><div v-if="sent" class="inline"><button type="button" class="text-button" :disabled="busy||cooldown>0" @click="send">{{ cooldown?cooldown+' 秒后可重发':'重新发送验证码' }}</button><button type="button" class="text-button" :disabled="busy" @click="sent=false;code='';error=''">修改邮箱</button></div></form><p class="hint">只收集活动所需的信息。作品链接与联系方式仅本人和活动管理员可见。</p></section></div></template>
