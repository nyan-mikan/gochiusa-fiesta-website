<script setup lang="ts">
import {ref,watch} from 'vue';
import type {Character} from '../../shared/models';
const props=defineProps<{character:Character}>();
const failed=ref(false);
watch(()=>props.character.avatar_url,()=>failed.value=false);
</script>
<template><span class="character-avatar" :style="{backgroundColor:character.color}" aria-hidden="true"><img v-if="character.avatar_url&&!failed" :src="character.avatar_url" :style="{objectPosition:character.avatar_position??'50% 20%'}" alt="" loading="lazy" decoding="async" @error="failed=true"><span v-else>{{ (character.display_name??character.name).slice(0,1) }}</span></span></template>
<style scoped>
.character-avatar{display:grid;place-items:center;width:72px;height:72px;flex-shrink:0;overflow:hidden;border-radius:12px;color:white;font-size:24px;font-weight:500}.character-avatar img{display:block;width:100%;height:100%;object-fit:cover;background:var(--paper)}
</style>
