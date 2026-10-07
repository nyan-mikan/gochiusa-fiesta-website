<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue';
import FileDropzone from './FileDropzone.vue';
import {AVATAR_DIMENSION,MAX_AVATAR_FILE_SIZE,MAX_AVATAR_SIZE,type CharacterAvatarInput} from '../../shared/character-avatar';
const props=defineProps<{modelValue?:CharacterAvatarInput|null;existingUrl?:string;disabled?:boolean;label?:string}>();
const emit=defineEmits<{'update:modelValue':[value:CharacterAvatarInput|null];busy:[value:boolean]}>();
const preparing=ref(false),error=ref('');let disposed=false;
onBeforeUnmount(()=>{disposed=true;emit('busy',false);});
async function choose(file:File){
 if(props.disabled||preparing.value)return;
 error.value='';if(file.size>MAX_AVATAR_FILE_SIZE){error.value='头像文件最大 2 MiB';return;}
 preparing.value=true;emit('busy',true);let bitmap:ImageBitmap|undefined;
 try{
  bitmap=await createImageBitmap(file);if(bitmap.width<1||bitmap.height<1||bitmap.width>8192||bitmap.height>8192)throw new Error('图片尺寸过大，请选择较小的头像');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=AVATAR_DIMENSION;const context=canvas.getContext('2d');if(!context)throw new Error('浏览器暂不支持读取头像');
  const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,AVATAR_DIMENSION,AVATAR_DIMENSION);
  let url=canvas.toDataURL('image/webp',.88);let data=url.split(',')[1]??'';
  if(data.length*3/4>MAX_AVATAR_SIZE){url=canvas.toDataURL('image/jpeg',.8);data=url.split(',')[1]??'';}
  if(data.length*3/4>MAX_AVATAR_SIZE)throw new Error('图片处理后仍过大，请换一张头像');
  const content_type=url.slice(5,url.indexOf(';')) as CharacterAvatarInput['content_type'];if(!disposed)emit('update:modelValue',{content_type,data});
 }catch(e){if(!disposed)error.value=e instanceof Error&&e.message.startsWith('图片')?e.message:'图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件';}
 finally{bitmap?.close();if(!disposed){preparing.value=false;emit('busy',false);}}
}
function clear(){if(!props.disabled&&!preparing.value){error.value='';emit('update:modelValue',null);}}
</script>
<template><div class="avatar-input"><FileDropzone :label="label??'头像（可选）'" hint="PNG、JPEG 或 WebP，最大 2 MiB。自动裁成方形头像；不选也可以保存。" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" :disabled="disabled||preparing" @selected="choose"/><div v-if="modelValue||existingUrl&&modelValue!==null" class="avatar-preview"><img :src="modelValue?'data:'+modelValue.content_type+';base64,'+modelValue.data:existingUrl" alt="头像预览"><button type="button" :disabled="disabled||preparing" @click="clear">移除头像</button></div><p v-if="preparing" class="hint" role="status">正在读取头像…</p><p v-if="error" class="alert error" role="alert">{{ error }}</p></div></template>
<style scoped>
.avatar-input{min-width:0;margin-bottom:16px}.avatar-preview{display:flex;align-items:center;gap:12px;margin-top:12px}.avatar-preview img{width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
</style>
