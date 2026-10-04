<script setup lang="ts">
import {computed} from 'vue';
const props=defineProps<{id?:string;invalid?:boolean;errorId?:string;modelValue:number;disabled?:boolean;required?:boolean;label?:string}>();const emit=defineEmits<{'update:modelValue':[seconds:number]}>();
const value=computed(()=>{const n=Math.min(86399,Math.max(0,props.modelValue));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');});
function update(e:globalThis.Event){const input=e.target as HTMLInputElement;if(!input.value)return;const [h,m,s=0]=input.value.split(':').map(Number);emit('update:modelValue',h!*3600+m!*60+s);}
</script>
<template><label>{{ label??'节目时长' }}{{ required?' *':'' }}<input :id="id" :aria-invalid="invalid||undefined" :aria-describedby="errorId" class="duration-picker" type="time" step="1" :value="value" :disabled="disabled" :required="required" @input="update"><span class="hint">时 : 分 : 秒{{ modelValue>=86400?' · 已超过可选择范围':'' }}</span></label></template>
