<script setup lang="ts">
import {ref,watch} from 'vue';
import NavIcon from './components/NavIcon.vue';
import SidebarAccount from './components/SidebarAccount.vue';
import ActionDialog from './components/ActionDialog.vue';
import { useRoute,useRouter } from 'vue-router';import { session,api } from './lib/api';
const route=useRoute(),router=useRouter();const links=[['/admin/submissions','投稿审核','review'],['/admin/program','节目编排','program'],['/admin/script','主持稿','script'],['/admin/characters','角色库','characters'],['/admin/settings','活动设置','settings'],['/admin/wishes','祝福语管理','wishes']];const navOpen=ref(false),logoutBusy=ref(false),logoutError=ref('');watch(()=>route.fullPath,()=>navOpen.value=false);async function logout(){if(logoutBusy.value)return;logoutBusy.value=true;logoutError.value='';session.logoutRequested=true;try{await router.push('/login');}catch{logoutError.value='退出失败，请重试。当前登录仍保留。';}finally{session.logoutRequested=false;logoutBusy.value=false;}}
</script>
<template><ActionDialog/><RouterView v-if="route.path==='/login'"/><div v-else class="workspace"><aside class="sidebar"><RouterLink class="brand" :to="session.user?.role==='admin'?'/admin/submissions':'/submit'"><span class="fiesta-logo"><img src="/images/gochiusa-new-year-fiesta.png" alt="点兔贺年祭 Logo"></span></RouterLink><button class="mobile-nav-toggle" :aria-expanded="navOpen" aria-controls="workspace-nav" @click="navOpen=!navOpen">{{ navOpen?'收起导航':'切换功能' }} · {{ links.find(l=>route.path.startsWith(l[0]!))?.[1]??(route.path.startsWith('/submit')?'我的投稿':'祝福语投稿') }}</button><nav id="workspace-nav" :class="{'nav-open':navOpen}"><RouterLink v-if="session.user?.role==='admin'" v-for="link in links" :key="link[0]" :to="link[0]!"><NavIcon :name="link[2]!"/>{{ link[1] }}</RouterLink><RouterLink v-if="session.user?.is_super_admin" to="/admin/users"><NavIcon name="users"/>管理员任免</RouterLink><RouterLink to="/wishes"><NavIcon name="wishes"/>祝福语投稿</RouterLink><RouterLink to="/submit"><NavIcon name="submit"/>我的投稿</RouterLink></nav><SidebarAccount :user="session.user" :busy="logoutBusy" @logout="logout"/></aside><main class="workspace-main"><div v-if="!session.mailReady" class="system-note" role="status">邮件服务尚未配置，通知会保留在发送队列中。</div><p v-if="logoutError" class="alert error" role="alert">{{ logoutError }}</p><RouterView/></main></div></template>

<style scoped>
.sidebar > nav { margin-top: 24px; }
@media (max-width: 760px) {
  .sidebar > nav { margin-top: 10px; }
}
</style>
