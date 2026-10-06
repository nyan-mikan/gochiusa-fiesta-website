<script setup lang="ts">
import {computed,ref} from 'vue';import {localTime,utcTime} from '../lib/time';
const props=withDefaults(defineProps<{modelValue:string;timezone?:string;disabled?:boolean;label:string}>(),{timezone:'Asia/Shanghai',disabled:false});const emit=defineEmits<{ 'update:modelValue':[value:string] }>();const error=ref('');
const value=computed(()=>{try{return localTime(props.modelValue,props.timezone);}catch{return '';}});
function update(e:globalThis.Event){const input=e.target as HTMLInputElement;try{emit('update:modelValue',utcTime(input.value,props.timezone));error.value='';input.setCustomValidity('');}catch(err){error.value=(err as Error).message;input.setCustomValidity(error.value);}}
</script>
<template><FieldLabel>{{ label }}<input type="datetime-local" :value="value" :disabled="disabled" step="1" @change="update"><span class="hint">{{ timezone }} · 选择日期和时间</span><span v-if="error" class="text-danger" role="alert">{{ error }}</span></FieldLabel></template>
