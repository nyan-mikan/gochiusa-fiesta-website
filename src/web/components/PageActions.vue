<script setup lang="ts">
defineProps<{status?:string}>();
</script>
<template><Teleport defer to="#page-actions"><div class="page-actions"><span v-if="status" class="page-action-status" role="status">{{ status }}</span><slot/></div></Teleport></template>
<style>
.page-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0}.page-action-status{margin-right:8px;color:var(--muted);font-size:12px;max-width:240px;overflow-wrap:anywhere}.page-actions>button,.page-actions>.button{margin:0;min-height:36px;padding:6px 12px;font-size:13px;border-radius:7px;white-space:normal;color:#0868c9;background:transparent;border-color:transparent}.page-actions>button:hover,.page-actions>.button:hover{background:#e9f2fc}.page-actions>button.primary{color:white;background:#0868c9;border-color:#0868c9}.page-actions>button.primary:hover{background:#0757a8}.page-actions>button.danger{color:#a32028}.page-actions>button:disabled{opacity:.45}@media(max-width:760px){.page-actions{gap:4px}.page-actions>button,.page-actions>.button{min-height:44px;padding:6px 9px;font-size:12px}.page-action-status{flex-basis:100%;text-align:right;max-width:none;margin-right:0;font-size:11px}}@media print{.page-actions{display:none}}
</style>
