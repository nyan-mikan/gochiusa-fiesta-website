<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue';import {api} from '../lib/api';import type {UploadedFile} from '../../shared/models';import {MAX_UPLOAD_SIZE} from '../../shared/uploads';
const props=defineProps<{ensureDraft:()=>Promise<string>;file:UploadedFile|null;disabled?:boolean}>();const emit=defineEmits<{uploaded:[file:UploadedFile];duration:[seconds:number];busy:[value:boolean];remove:[]}>();
const uploading=ref(false),progress=ref(0),error=ref(''),notice=ref(''),phase=ref(''),transferred=ref(0),total=ref(0);let controller:AbortController|null=null,uploadId='';
async function readDuration(file:File){if(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name))return null;
 const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';
 try{const duration=await new Promise<number>((resolve,reject)=>{const timeout=setTimeout(()=>{video.removeAttribute('src');reject(new Error());},12000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve(video.duration);};video.onerror=()=>{clearTimeout(timeout);reject(new Error());};video.src=url;});if(Number.isFinite(duration)&&duration>0&&duration<86400){notice.value='已识别视频时长，上传完成后将自动填入。';return Math.ceil(duration);}else notice.value='无法识别完整时长，请使用时长选择器。';}catch{notice.value='此视频格式无法读取时长，请使用时长选择器。';}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
 return null;
}
async function choose(e:globalThis.Event){const input=e.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;error.value='';notice.value='';if(file.size>MAX_UPLOAD_SIZE){error.value='文件不能超过 1 GB（1,000,000,000 字节）';return;}if(!file.size){error.value='不能上传空文件';return;}
 uploading.value=true;emit('busy',true);progress.value=0;transferred.value=0;total.value=file.size;phase.value='正在保存投稿草稿…';controller=new AbortController();uploadId='';const signal=controller.signal;
 try{const sid=await props.ensureDraft();if(signal.aborted)throw new DOMException('cancelled','AbortError');phase.value='正在准备上传…';const task=await api<{id:string;part_size:number}>('/api/submissions/'+sid+'/uploads',{filename:file.name,size:file.size,content_type:file.type||'application/octet-stream'});uploadId=task.id;phase.value='正在读取视频时长…';const detectedDuration=await readDuration(file);phase.value='正在上传文件';
 for(let at=0,part=1;at<file.size;at+=task.part_size,part++){
  const chunk=file.slice(at,Math.min(at+task.part_size,file.size));let ok=false;
  for(let attempt=0;attempt<3;attempt++){signal.throwIfAborted();try{const res=await fetch('/api/uploads/'+task.id+'/parts/'+part,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Requested-With':'usagi'},body:chunk,signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});if(!res.ok){const v=await res.json() as {error?:string};throw new Error(v.error??'分片上传失败');}ok=true;break;}catch(err){if(attempt===2||signal.aborted)throw err;phase.value='网络波动，正在重试当前分片（'+(attempt+1)+'/2）';}}
  if(!ok)throw new Error('上传失败');phase.value='正在上传文件';transferred.value=Math.min(at+task.part_size,file.size);progress.value=Math.floor(Math.min(at+task.part_size,file.size)/file.size*100);
 }
 signal.throwIfAborted();phase.value='文件已传输，正在确认…';const completed=await api<UploadedFile>('/api/uploads/'+task.id+'/complete',{});emit('uploaded',completed);if(detectedDuration)emit('duration',detectedDuration);notice.value='作品已上传，可继续填写资料。';uploadId='';
 }catch(err){error.value=signal.aborted?'上传已取消':(err as Error).message+'。请重新选择文件重试，已填写资料保留。';if(uploadId)await api('/api/uploads/'+uploadId,{},'DELETE').catch(()=>{});}finally{uploading.value=false;emit('busy',false);controller=null;}
}
function cancel(){controller?.abort();}
onBeforeUnmount(cancel);
</script>
<template><div class="upload-panel"><label>上传作品文件<input type="file" aria-label="上传作品文件" :disabled="disabled||uploading" @change="choose"></label><p class="hint">单个文件最大 1 GB，支持视频、音频及作品附件。视频时长会自动填入。</p><div v-if="file&&!uploading" class="upload-file"><div><strong>{{ file.filename }}</strong><small>{{ (file.size/1000000).toFixed(1) }} MB · 已上传</small><a :href="'/api/uploads/'+file.id+'/download'">下载作品</a></div><button v-if="!disabled" type="button" @click="emit('remove')">移除文件</button></div><template v-if="uploading"><progress :value="progress" max="100" aria-label="文件上传进度"></progress><div class="toolbar"><span role="status">{{ phase }}<small v-if="transferred">{{ (transferred/1000000).toFixed(1) }} / {{ (total/1000000).toFixed(1) }} MB · {{ progress }}%</small></span><button type="button" @click="cancel">取消上传</button></div></template><p v-if="notice" class="hint" role="status">{{ notice }}</p><p v-if="error" class="alert error" role="alert">{{ error }}</p></div></template>
