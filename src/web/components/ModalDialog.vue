<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount,useId} from 'vue';
defineProps<{title:string}>();const emit=defineEmits<{close:[]}>();
const box=ref<HTMLDialogElement>(),titleId=useId();let previous:HTMLElement|null=null;
onMounted(()=>{previous=document.activeElement as HTMLElement;box.value?.showModal();});
onBeforeUnmount(()=>{box.value?.close();if(previous?.isConnected)previous.focus();});
</script>
<template><Teleport to="body"><dialog ref="box" class="modal paper" :aria-labelledby="titleId" @cancel.prevent="emit('close')"><h2 :id="titleId">{{ title }}</h2><slot/></dialog></Teleport></template>
