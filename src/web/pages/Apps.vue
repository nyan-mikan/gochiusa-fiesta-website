<script setup lang="ts">
import {computed} from 'vue';import {modules,canAccess} from '../../shared/modules';import {session} from '../lib/api';
const allowed=computed(()=>modules.filter(module=>canAccess(session.user,module.id)));
</script>
<template><div class="page"><header class="page-head"><h1>应用</h1></header><div class="grid three"><RouterLink v-for="module in allowed" :key="module.id" class="paper module-card" :to="module.path"><h2>{{ module.name }}</h2><p>{{ module.description }}</p><span>打开应用 →</span></RouterLink><RouterLink v-if="session.user?.is_super_admin" class="paper module-card" to="/admin/users"><h2>管理员与权限</h2><p>任免管理员，分配各管理模块的访问权限。</p><span>打开应用 →</span></RouterLink></div><p v-if="!allowed.length" class="alert warning">尚未分配管理模块，请联系超级管理员。你的普通投稿和账号设置仍可使用。</p></div></template>
<style scoped>.module-card{display:block;color:var(--ink)}.module-card:hover{border-color:var(--plum);text-decoration:none}.module-card p{font-size:14px;color:var(--muted)}.module-card span{font-size:13px;color:var(--plum)}</style>
