<script setup lang="ts">
import {ref,watch,computed} from 'vue';
import {canAccess,moduleForPath,type ModuleId} from '../shared/modules';
import NavIcon from './components/NavIcon.vue';
import SidebarAccount from './components/SidebarAccount.vue';
import ActionDialog from './components/ActionDialog.vue';
import MessageArea from './components/MessageArea.vue';
import { useRoute,useRouter } from 'vue-router';import { session,api } from './lib/api';
const route=useRoute(),router=useRouter();const links=[['/admin/submissions','投稿审核','review'],['/admin/program','节目编排','program'],['/admin/script','主持稿','script'],['/admin/characters','角色管理','characters'],['/admin/dictionary','分区与职务','settings'],['/admin/settings','活动设置','settings'],['/admin/wishes','祝福语管理','wishes']];const navOpen=ref(false),logoutBusy=ref(false),logoutError=ref('');watch(()=>route.fullPath,()=>navOpen.value=false);async function logout(){if(logoutBusy.value)return;logoutBusy.value=true;logoutError.value='';session.logoutRequested=true;try{await router.push('/login');}catch{logoutError.value='退出失败，请重试。当前登录仍保留。';}finally{session.logoutRequested=false;logoutBusy.value=false;}}
const currentPage=computed(()=>[...links,['/admin/apps','应用'],['/admin/users','管理员与权限'],['/account','账号设置'],['/submit','我的投稿'],['/wishes','祝福语投稿']].find(l=>route.path===l[0]||route.path.startsWith(l[0]+'/'))?.[1]??'工作台');
</script>
<template><MessageArea v-if="route.path!=='/login'"/><ActionDialog/><RouterView v-if="route.path==='/login'"/><div v-else class="workspace"><aside class="sidebar"><RouterLink class="brand" :to="session.user?.role==='admin'?'/admin/submissions':'/submit'"><span class="fiesta-logo"><img src="/images/gochiusa-new-year-fiesta.png" alt="点兔贺年祭 Logo"></span></RouterLink><button class="mobile-nav-toggle" :aria-expanded="navOpen" aria-controls="workspace-nav" @click="navOpen=!navOpen">{{ navOpen?'收起导航':'切换功能' }} · {{ currentPage }}</button><nav id="workspace-nav" :class="{'nav-open':navOpen}"><RouterLink v-if="session.user?.role==='admin'" to="/admin/apps"><NavIcon name="program"/>应用</RouterLink><RouterLink v-if="session.user?.role==='admin'" v-for="link in links.filter(link=>canAccess(session.user,moduleForPath(link[0]!) as ModuleId))" :key="link[0]" :to="link[0]!"><NavIcon :name="link[2]!"/>{{ link[1] }}</RouterLink><RouterLink v-if="session.user?.is_super_admin" to="/admin/users"><NavIcon name="users"/>管理员与权限</RouterLink><RouterLink to="/wishes"><NavIcon name="wishes"/>祝福语投稿</RouterLink><RouterLink to="/submit"><NavIcon name="submit"/>我的投稿</RouterLink></nav><SidebarAccount :user="session.user" :busy="logoutBusy" @logout="logout"/></aside><main class="workspace-main"><div v-if="!session.mailReady" class="system-note" role="status">邮件服务尚未配置，通知会保留在发送队列中。</div><p v-if="logoutError" class="alert error" role="alert">{{ logoutError }}</p><RouterView/></main></div></template>

<style scoped>
.sidebar > nav { margin-top: 24px; }
@media (max-width: 760px) {
  .sidebar { display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:8px 16px;align-items:center; }
  .mobile-nav-toggle { grid-column:1/-1;grid-row:2;margin:0; }
  .sidebar > nav { grid-column:1/-1;margin:0; }
  .sidebar > :deep(.sidebar-account) { grid-column:2;grid-row:1;width:auto;margin:0; }
}
</style>
