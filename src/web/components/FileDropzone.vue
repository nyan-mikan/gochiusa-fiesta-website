<script setup lang="ts">
import {ref,useId,watch} from 'vue';
const props=defineProps<{label:string;hint:string;accept?:string;disabled?:boolean}>();
const emit=defineEmits<{selected:[file:File]}>();
const id=useId(),depth=ref(0),error=ref('');
watch(()=>props.disabled,()=>{depth.value=0;});
function select(files:File[]){
 if(props.disabled)return;
 error.value='';
 if(files.length!==1){error.value='请一次选择或拖入一个文件';return;}
 const file=files[0];
 if(props.accept&&!props.accept.split(',').some(value=>{
  const rule=value.trim().toLowerCase(),type=file.type.toLowerCase();
  return rule.startsWith('.')?file.name.toLowerCase().endsWith(rule):rule.endsWith('/*')?type.startsWith(rule.slice(0,-1)):type===rule;
 })){error.value='文件格式不支持，请选择下方说明中的文件格式';return;}
 emit('selected',file);
}
function choose(event:Event){const input=event.target as HTMLInputElement;const files=Array.from(input.files??[]);input.value='';if(files.length)select(files);}
function enter(event:DragEvent){if(!props.disabled&&event.dataTransfer?.types.includes('Files'))depth.value++;}
function over(event:DragEvent){if(event.dataTransfer)event.dataTransfer.dropEffect=props.disabled?'none':'copy';}
function drop(event:DragEvent){
 depth.value=0;if(props.disabled)return;
 const transfer=event.dataTransfer;if(!transfer)return;
 if(Array.from(transfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){error.value='请拖入文件，暂不支持文件夹';return;}
 select(Array.from(transfer.files));
}
</script>
<template>
 <div class="file-dropzone" :class="{'is-dragging':depth>0,'is-disabled':disabled}" role="group" :aria-label="label" :aria-disabled="disabled||undefined" @dragenter.prevent.stop="enter" @dragover.prevent.stop="over" @dragleave.prevent.stop="depth=Math.max(0,depth-1)" @drop.prevent.stop="drop">
  <label :for="id">{{ label }}</label>
  <p class="drop-prompt" role="status">{{ depth>0?'松开即可选择文件':'将文件拖到这里，或点击下方选择文件' }}</p>
  <input :id="id" type="file" :accept="accept" :disabled="disabled" :aria-describedby="id+'-hint'+(error?' '+id+'-error':'')" @change="choose">
  <p :id="id+'-hint'" class="hint">{{ hint }}</p>
  <p v-if="error" :id="id+'-error'" class="alert error" role="alert">{{ error }}</p>
 </div>
</template>
<style scoped>
.file-dropzone{border:2px dashed var(--line);border-radius:10px;padding:20px;background:var(--paper);min-width:0}
.file-dropzone.is-dragging{border-color:var(--plum);background:#eee4ea}
.file-dropzone:focus-within{border-color:var(--plum)}
.file-dropzone.is-disabled{opacity:.65}
label{margin-bottom:8px;font-size:14px}.drop-prompt{font-size:13px;margin-bottom:12px}
input{max-width:100%;font-size:13px}input::file-selector-button{font:inherit;padding:8px 12px;margin-right:12px;border:1px solid var(--line);border-radius:6px;background:#fffaf4;color:var(--ink);cursor:pointer}
input:disabled::file-selector-button{cursor:not-allowed}.hint{margin:12px 0 0}.alert{margin:12px 0 0}
</style>
