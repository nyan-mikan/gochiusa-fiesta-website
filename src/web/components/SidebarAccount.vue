<script setup lang="ts">
import { computed,ref } from 'vue';
import type { User } from '../../shared/models';

const menu=ref<HTMLDetailsElement>();
const props = defineProps<{ user: User | null; busy: boolean }>();
defineEmits<{ logout: [] }>();
const accountName = computed(() => props.user?.nickname || props.user?.email.split('@')[0] || '当前账号');
const initial = computed(() => Array.from(accountName.value)[0]?.toUpperCase());
const roleName = computed(() => props.user?.is_super_admin ? '超级管理员' : props.user?.role === 'admin' ? '管理员' : '投稿者');
</script>

<template>
  <div class="sidebar-account">
    <details ref="menu" class="account-card">
      <summary :aria-label="`账户菜单：${accountName}`">
        <span class="account-avatar" aria-hidden="true">{{ initial }}</span>
        <span class="account-label">
          <span class="account-name">{{ accountName }}</span>
          <span class="account-role">{{ roleName }}</span>
        </span>
        <svg class="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </summary>
      <div class="account-menu">
        <RouterLink class="logout-card" to="/account" @click="menu?.removeAttribute('open')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
          <span>账号设置</span>
        </RouterLink>
        <button class="logout-card" :disabled="busy" @click="$emit('logout')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 12h12m-5-5 5 5-5 5" />
          </svg>
          <span>{{ busy ? '正在退出…' : '退出登录' }}</span>
        </button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.sidebar-account { margin-top: auto; padding-top: 20px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; width: 100%; min-width: 0; }
.logout-card, .account-card { border: 1px solid #d8c9bd; border-radius: 14px; background: #fffaf5; box-shadow: 0 2px 4px #5e443206; }
.logout-card { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 54px; padding: 13px 16px; font-size: 14px; font-weight: 600; text-align: left; }
.logout-card:hover { background: #f4e9df; border-color: #bba494; }
.logout-card svg { flex-shrink: 0; color: var(--plum); }
.account-card { position: relative; min-width: 0; background: linear-gradient(135deg, #fffaf5, #f2e8de); }
.account-card summary { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px; border-radius: 13px; overflow: hidden; list-style: none; }
.account-card summary::-webkit-details-marker { display: none; }
.account-card summary:hover { background: #f4e9df; }
.account-avatar { display: grid; place-items: center; flex-shrink: 0; width: 38px; height: 38px; border: 1px solid #d8c9bd; border-radius: 10px; background: #e9dcd1; color: var(--plum); font-size: 17px; font-weight: 600; }
.account-label { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.5; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.account-role { color: var(--muted); font-size: 12px; }
.account-chevron { flex-shrink: 0; color: var(--muted); transition: transform .15s; }
.account-card[open] .account-chevron { transform: rotate(180deg); }
.account-menu { position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; z-index: 25; display: grid; gap: 8px; }
@media (max-width: 760px) {
  .sidebar-account { margin-top: 12px; padding-top: 0; grid-template-columns: minmax(0, 1fr); }
  .logout-card { min-height: 60px; padding: 10px 12px; }
  .account-card summary { min-height:44px;padding:5px; }
  .account-label { display:none; }
  .account-menu { left:auto;width:210px; }
  .account-avatar { width: 32px; height: 32px; }
  .account-menu { top: calc(100% + 8px); bottom: auto; }
}
</style>
