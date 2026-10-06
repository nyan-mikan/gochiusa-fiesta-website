<script setup lang="ts">
import type {MessageKind} from '../lib/messages';
defineProps<{kind:MessageKind}>();
</script>
<template><svg class="message-icon" :class="'icon-'+kind" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
 <template v-if="kind==='W'"><path class="shape" d="M10.3 3.6a2 2 0 0 1 3.4 0l9 15.5a2 2 0 0 1-1.7 3H3a2 2 0 0 1-1.7-3z"/><path class="mark" d="M12 8v6m0 3v.1"/></template>
 <template v-else><circle class="shape" cx="12" cy="12" r="11"/><path v-if="kind==='E'" class="mark" d="m8 8 8 8m0-8-8 8"/><path v-else-if="kind==='S'" class="mark" d="m7 12 3.5 3.5L17 9"/><path v-else class="mark" d="M12 11v6m0-10v.1"/></template>
</svg></template>
<style scoped>
.message-icon{display:block;width:24px;height:24px;flex-shrink:0}.shape{fill:#0868c9}.mark{fill:none;stroke:white;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.icon-E .shape{fill:#e3343b}.icon-W .shape{fill:#f5c242}.icon-W .mark{stroke:#5b4300}
</style>
