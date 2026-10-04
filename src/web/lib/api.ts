import { reactive,watch } from 'vue';
import type { User, Event, FormConfig } from '../../shared/models';
export const session=reactive({user:null as User|null,loaded:false,mailReady:false,logoutRequested:false});
// Reset the former placeholder selection once; later manual choices stay saved.
const eventStorageKey='usagi-event-v2';
export const catalog=reactive({events:[] as Event[],eventId:localStorage.getItem(eventStorageKey)??'',config:null as FormConfig|null});
watch(()=>catalog.eventId,id=>localStorage.setItem(eventStorageKey,id));
export class ApiError extends Error{constructor(public status:number,message:string,public details:unknown=null){super(message);}}
export async function api<T>(path:string,data?:unknown,method=data===undefined?'GET':'POST'):Promise<T>{
 const options:RequestInit={method,credentials:'same-origin',headers:data!==undefined?{'Content-Type':'application/json','X-Requested-With':'usagi'}:{},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(20000)};
 let response:Response;try{response=await fetch(path,options);}catch(error){if(data&&typeof data==='object'&&'operation_id'in data){response=await fetch(path,{...options,signal:AbortSignal.timeout(20000)});}else throw error;}
 const result=await response.json() as {error?:string;details?:unknown};if(!response.ok)throw new ApiError(response.status,result.error??'请求失败',result.details);return result as T;
}
export async function identity(){if(!session.loaded){try{const r=await api<{user:User;mail_ready:boolean}>('/api/me');session.user=r.user;session.mailReady=r.mail_ready;}catch{session.user=null;}session.loaded=true;}return session.user;}
export async function loadCatalog(){catalog.config=await api<FormConfig>('/api/form-config');catalog.events=catalog.config.events;if(!catalog.events.some(e=>e.id===catalog.eventId))catalog.eventId=catalog.events.find(e=>e.id==='fiesta-2027')?.id??catalog.events[0]?.id??'';return catalog.config;}
export async function download(path:string,filename:string){const r=await fetch(path);if(!r.ok){const v=await r.json() as {error:string};throw new Error(v.error);}const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
export const statusName=(s:string)=>({draft:'草稿',pending:'待审核',approved:'已通过',rejected:'已驳回'}[s]??s);
export const duration=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
export function displayTime(value:string|null,tz='Asia/Shanghai'){return value?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:tz}).format(new Date(value)):'未设置';}
