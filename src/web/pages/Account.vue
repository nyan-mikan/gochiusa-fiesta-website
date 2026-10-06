<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import type {User} from '../../shared/models';
import {api,session} from '../lib/api';
import {generateLoginKey,type KeyChallenge,type KeyInfo} from '../lib/private-key';
import {confirmAction} from '../lib/dialog';
const nickname=ref(session.user?.nickname??''),profileBusy=ref(false),profileError=ref(''),profileNotice=ref('');
async function saveNickname(){profileBusy.value=true;profileError.value='';profileNotice.value='';try{const response=await api<{user:User}>('/api/account/profile',{nickname:nickname.value},'PUT');session.user=response.user;nickname.value=response.user.nickname;profileNotice.value='昵称已保存';}catch(e){profileError.value=(e as Error).message;}finally{profileBusy.value=false;}}
const current=ref<KeyInfo|null>(null),loading=ref(true),busy=ref(false),challenge=ref<KeyChallenge|null>(null),code=ref(''),accepted=ref(false),downloadReady=ref(false),downloaded=ref(false),error=ref(''),cooldown=ref(0);
let privateFile:string|null=null,timer:ReturnType<typeof setInterval>|undefined;
onMounted(async()=>{try{current.value=(await api<{key:KeyInfo|null}>('/api/account/key')).key;}catch(e){error.value=(e as Error).message;}finally{loading.value=false;}});
function warnLeaving(event:BeforeUnloadEvent){if(privateFile){event.preventDefault();event.returnValue='';}}
window.addEventListener('beforeunload',warnLeaving);
onBeforeUnmount(()=>{privateFile=null;clearInterval(timer);window.removeEventListener('beforeunload',warnLeaving);});
onBeforeRouteLeave(async()=>!privateFile||await confirmAction('私钥还没有下载。离开后将无法再次下载，需要重新验证邮箱并生成新私钥。仍要离开吗？'));
async function send(){
 if(busy.value||downloadReady.value)return;busy.value=true;error.value='';
 try{challenge.value=await api<KeyChallenge>('/api/account/key/code',{});code.value='';cooldown.value=60;clearInterval(timer);timer=setInterval(()=>{cooldown.value=Math.max(0,cooldown.value-1);if(!cooldown.value)clearInterval(timer);},1000);}
 catch(e){error.value=(e as Error).message;}finally{busy.value=false;}
}
async function generate(){
 if(busy.value||!challenge.value||!accepted.value)return;busy.value=true;error.value='';
 try{const result=await generateLoginKey(challenge.value);const response=await api<{key:KeyInfo}>('/api/account/key',{challenge_id:challenge.value.challenge_id,code:code.value,public_key:result.publicKey,signature:result.signature});current.value=response.key;privateFile=result.file;downloadReady.value=true;downloaded.value=false;challenge.value=null;code.value='';}
 catch(e){error.value=(e as Error).message+'。若生成未完成，请重新发送验证码后再试。';}
 finally{busy.value=false;}
}
function download(){
 if(!privateFile||!current.value)return;
 const url=URL.createObjectURL(new Blob([privateFile],{type:'application/json'})),link=document.createElement('a');
 link.href=url;link.download=`gochiusa-private-key-${current.value.id}.json`;document.body.appendChild(link);link.click();link.remove();
 privateFile=null;downloadReady.value=false;downloaded.value=true;accepted.value=false;setTimeout(()=>URL.revokeObjectURL(url),10000);
}
</script>
<template>
 <div class="page account-page">
  <header class="page-head"><div><h1>账号设置</h1><p class="muted">{{ session.user?.email }}</p></div></header>
  <section class="key-card profile-card">
   <h2>昵称</h2><form @submit.prevent="saveNickname"><label>用户昵称<input v-model="nickname" maxlength="40" autocomplete="nickname" placeholder="设置希望展示的名字" :disabled="profileBusy"></label><p class="hint">最多 40 字，留空时使用邮箱前缀。更改昵称不会修改已提交的祝福语署名。</p><button class="primary" :disabled="profileBusy">{{ profileBusy?'正在保存…':'保存昵称' }}</button></form><p v-if="profileError" class="alert error" role="alert">{{ profileError }}</p><p v-if="profileNotice" class="alert success" role="status">{{ profileNotice }}</p>
  </section>
  <section class="key-card private-key-card">
   <h2>私钥登录</h2>
   <p>保存私钥文件后，可以在登录页面选择文件登录。私钥在你的浏览器中生成，本站仅保存对应公钥。</p>
   <p v-if="loading" role="status">正在读取…</p>
   <template v-else>
    <dl v-if="current"><dt>当前私钥</dt><dd>生成于 {{ new Date(current.created_at).toLocaleString('zh-CN') }}</dd><dt>公钥指纹</dt><dd class="fingerprint">{{ current.fingerprint }}</dd></dl>
    <p v-else class="muted">尚未设置私钥。</p>
    <div class="key-notice">
     <p>私钥只能下载一次，请保存在安全的位置，不要分享或上传给他人。拿到私钥的人可以登录你的账号。</p>
     <p>丢失后可使用邮箱登录，再次验证邮箱并生成新私钥。新私钥生成成功后，旧私钥和其他使用旧私钥登录的会话会失效。</p>
    </div>
    <template v-if="downloadReady">
     <p class="alert" role="status">新私钥已生成，请立即下载。刷新或离开此页后无法再次下载。</p>
     <button class="primary" @click="download">下载私钥（仅一次）</button>
    </template>
    <template v-else>
     <p v-if="downloaded" class="alert" role="status">已提供私钥下载，请确认文件已保存。本站无法再次提供这份私钥。</p>
     <form v-if="challenge" @submit.prevent="generate">
      <label>邮箱验证码<input v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 位数字" :disabled="busy"><span class="hint">已发送至 {{ session.user?.email }}，10 分钟内有效。仅用于本次生成私钥。</span></label>
      <label class="acknowledge"><input v-model="accepted" type="checkbox" required :disabled="busy">我会妥善保存私钥，并知晓生成新私钥会使旧私钥失效。</label>
      <div class="actions"><button class="primary" :disabled="busy||!accepted">{{ busy?'正在生成…':current?'验证并更换私钥':'验证并生成私钥' }}</button><button type="button" :disabled="busy||cooldown>0" @click="send">{{ cooldown?cooldown+' 秒后可重发':'重新发送验证码' }}</button></div>
     </form>
     <button v-else class="primary" :disabled="loading||busy||cooldown>0" @click="send">{{ busy?'正在发送…':cooldown?cooldown+' 秒后可重新验证':current?'验证邮箱，更换私钥':'验证邮箱，生成私钥' }}</button>
    </template>
   </template>
   <p v-if="error" class="alert error" role="alert">{{ error }}</p>
  </section>
 </div>
</template>
<style scoped>
.profile-card{margin-bottom:24px}.account-page{max-width:var(--page-max-width);margin:auto}.key-card{max-width:760px;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px}.key-card h2{margin-top:0}.key-card p{line-height:1.8}.key-notice{background:#eee4da;border-radius:12px;padding:12px 18px;margin:24px 0}.key-notice p{margin:8px 0;font-size:14px}dl{display:grid;gap:6px;margin:20px 0}dt{font-size:13px;color:var(--muted)}dd{margin:0}.fingerprint{font-family:monospace;font-size:12px;overflow-wrap:anywhere}.acknowledge{display:flex;align-items:flex-start;gap:10px;margin:20px 0;font-size:14px;line-height:1.6}.acknowledge input{width:auto;margin-top:4px}.actions{display:flex;gap:12px;flex-wrap:wrap}@media(max-width:760px){.key-card{padding:20px}}
</style>
