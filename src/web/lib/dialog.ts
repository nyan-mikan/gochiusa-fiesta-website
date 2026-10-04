import {reactive} from 'vue';
export const actionDialog=reactive({open:false,message:'',prompt:false,value:''});let complete:((v:string|null)=>void)|null=null;
function ask(message:string,prompt:boolean){if(complete)finishDialog(null);actionDialog.message=message;actionDialog.prompt=prompt;actionDialog.value='';actionDialog.open=true;return new Promise<string|null>(resolve=>complete=resolve);}
export const confirmAction=async(message:string)=>(await ask(message,false))!==null;
export const promptAction=(message:string)=>ask(message,true);
export function finishDialog(value:string|null){actionDialog.open=false;const resolve=complete;complete=null;resolve?.(value);}
