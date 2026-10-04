<script setup lang="ts">
defineProps<{disabled?:boolean}>();
import { onMounted } from 'vue';
import { catalog, loadCatalog } from '../lib/api';
onMounted(()=>{if(!catalog.config)void loadCatalog();});
</script>
<template><label class="event-picker">活动 <select v-model="catalog.eventId" :disabled="disabled"><option v-for="e in catalog.events" :key="e.id" :value="e.id">{{ e.name }}</option></select></label></template>
